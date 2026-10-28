import httpx
import pytest

from backend import coach
from backend.analysis import analyze_scramble
from backend.scramble import ScrambleError, normalize_scramble

from .conftest import DEMO_SCRAMBLE, INSERTION_SCRAMBLE, INSERTION_SCRAMBLE_2


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["llm"] == {"configured": False, "model": None}


@pytest.mark.parametrize("raw,expected", [
    ("R U R' U'", "R U R' U'"),
    ("  R2'  U’ F2 ", "R2 U' F2"),
    ("r u", None), ("Rw U", None), ("M", None), ("R3", None), ("x R", None), ("", None), ("   ", None),
])
def test_normalize_scramble(raw, expected):
    if expected is None:
        with pytest.raises(ScrambleError):
            normalize_scramble(raw)
    else:
        assert normalize_scramble(raw) == expected


def test_too_long_scramble_rejected(client):
    r = client.post("/api/analyze", json={"scramble": " ".join(["R U"] * 31)})
    assert r.status_code == 422


@pytest.mark.parametrize("bad", ["Rw U R", "R U X", "", "R 2"])
def test_invalid_scramble_returns_422(client, bad):
    r = client.post("/api/analyze", json={"scramble": bad})
    assert r.status_code == 422
    assert isinstance(r.json()["detail"], str)


def test_demo_scramble_matches_engine_demo(analyses):
    data = analyses[DEMO_SCRAMBLE]
    assert data["scramble"] == DEMO_SCRAMBLE
    assert data["cross_color"] == "white"
    rotations = [o["rotation"] for o in data["orientations"]]
    assert sorted(rotations) == sorted(["", "y", "y'", "y2"])
    assert [o["rank"] for o in data["orientations"]] == [1, 2, 3, 4]
    totals = [o["best_route"]["total_score"] for o in data["orientations"]]
    assert totals == sorted(totals, reverse=True)

    best = data["best_orientation"]
    assert best["rotation"] == "y2"
    assert best["front_color"] == "blue"
    assert best["label"] == "蓝前 (y2)"
    route = data["best_route"]
    assert route["cross"] == "D' R' D2 B' F' R"
    assert route["first_pair"]["slot"] == "BL"
    assert route["first_pair"]["rul_alg"] == "L2 U L U' L2"
    assert route["total_score"] == 92.0
    assert data["playback"]["alg"] == "z2 y2 D' R' D2 B' F' R L2 U L U' L2"


def test_front_colours_per_rotation(analyses):
    by_rot = {o["rotation"]: o for o in analyses[DEMO_SCRAMBLE]["orientations"]}
    assert {r: o["front_color"] for r, o in by_rot.items()} == {
        "": "green", "y": "orange", "y'": "red", "y2": "blue",
    }


def test_pair_card_flags(analyses):
    for o in analyses[DEMO_SCRAMBLE]["orientations"]:
        for route in o["routes"]:
            assert {p["slot"] for p in route["pairs"]} == {"FR", "FL", "BR", "BL"}
            scores = [p["c1_score"] for p in route["pairs"]]
            assert scores == sorted(scores, reverse=True)
            for p in route["pairs"]:
                assert p["is_back_slot"] == (p["slot"] in ("BR", "BL"))
                assert p["comfortable"] == (p["rul_moves"] is not None and p["rul_moves"] <= 6)
                assert p["back_slot_priority"] == (p["comfortable"] and p["is_back_slot"])
                assert p["rotation_free_trigger"] == p["comfortable"]
                if p["rul_alg"] is None:
                    assert p["category"] == "bad_eo" and p["rul_moves"] is None
    bl = analyses[DEMO_SCRAMBLE]["best_route"]["first_pair"]
    assert bl["category"] == "comfortable" and bl["back_slot_priority"] and bl["rotation_free_trigger"]


def test_insertion_case_detected(analyses):
    data = analyses[INSERTION_SCRAMBLE]
    hs = [h for h in data["insertion_highlights"]
          if h["rotation"] == "" and h["original_cross"] == "L B R2 F" and h["auf"] == "U"]
    assert hs, data["insertion_highlights"]
    h = next(x for x in hs if x["slot"] == "BL")
    assert h["final_move"] == "F"
    assert h["new_cross"] == "L B R2 U F"
    assert h["before_moves"] == 7 and h["after_moves"] == 5
    assert h["after_alg"] == "L' U L2 U L'"
    assert h["is_back_slot"] and h["verified"] and h["improves_first_pair"]
    assert h["playback_alg"] == "z2 L B R2 U F L' U L2 U L'"

    assert data["coach"]["kind"] == "insertion"
    assert data["coach"]["source"] == "template"


def test_insertion_case_with_u_prime(analyses):
    hs = analyses[INSERTION_SCRAMBLE_2]["insertion_highlights"]
    assert any(h["auf"] == "U'" and h["after_moves"] <= 5 and h["before_moves"] >= 7 for h in hs)


def test_highlights_respect_thresholds(analyses):
    for data in analyses.values():
        for h in data["insertion_highlights"]:
            assert h["auf"] in ("U", "U'")
            assert h["before_moves"] >= 7 and h["after_moves"] <= 5


def test_auf_variants_keep_cross(analyses):
    for o in analyses[DEMO_SCRAMBLE]["orientations"]:
        for route in o["routes"]:
            for v in route["auf_variants"]:
                assert v["auf"] in ("U", "U'", "U2")
                assert v["cross_moves"] == route["cross_moves"] + 1


def test_cross_already_solved():
    # WCA D is the yellow face, which ends up on top after z2, so the white cross stays solved.
    data = analyze_scramble("D")
    none = next(o for o in data.orientations if o.rotation == "")
    assert none.optimal_cross_moves == 0
    assert none.best_route.cross == ""
    assert none.best_route.auf_variants == []


# ---------------------------------------------------------------- coach layer

def test_coach_template_without_key(client):
    r = client.post("/api/coach", json={"scramble": INSERTION_SCRAMBLE})
    body = r.json()
    assert r.status_code == 200
    assert body["source"] == "template" and body["kind"] == "insertion"
    assert body["fallback_reason"] == "no_api_key"
    assert "U" in body["text"] and "F" in body["text"] and "BL" in body["text"]
    assert body["text"].startswith("在这把打乱中")


def test_coach_general_template(client):
    r = client.post("/api/coach", json={"scramble": DEMO_SCRAMBLE})
    body = r.json()
    assert body["kind"] == "general"
    assert "BL" in body["text"] and "L2 U L U' L2" in body["text"]


def _mock_client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def _llm_env(monkeypatch):
    monkeypatch.setenv("CUBEMASTER_LLM_API_KEY", "test-key")
    monkeypatch.setenv("CUBEMASTER_LLM_BASE_URL", "https://llm.example/v1/")
    monkeypatch.setenv("CUBEMASTER_LLM_MODEL", "test-model")


def test_coach_llm_success(monkeypatch):
    _llm_env(monkeypatch)
    seen = {}

    def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["authorization"]
        seen["body"] = request.read().decode()
        text = "这把在最后一步 F 前补一个 U，BL 后槽的粘连块直接变成 5 步无转体直插，太顺了。"
        return httpx.Response(200, json={"choices": [{"message": {"content": text}}]})

    analysis = analyze_scramble(INSERTION_SCRAMBLE)
    out = coach.generate_comment(analysis, client=_mock_client(handler))
    assert out.source == "llm" and out.kind == "insertion" and out.model == "test-model"
    assert seen["url"] == "https://llm.example/v1/chat/completions"
    assert seen["auth"] == "Bearer test-key"
    assert "L B R2 U F" in seen["body"] and "test-model" in seen["body"]


def test_coach_llm_hallucination_falls_back(monkeypatch):
    _llm_env(monkeypatch)
    out = coach.generate_comment(
        analyze_scramble(INSERTION_SCRAMBLE),
        client=_mock_client(lambda r: httpx.Response(
            200, json={"choices": [{"message": {"content": "建议多练习十字。"}}]})),
    )
    assert out.source == "template" and out.fallback_reason == "llm_output_failed_validation"


def test_coach_llm_http_error_falls_back(monkeypatch):
    _llm_env(monkeypatch)
    out = coach.generate_comment(
        analyze_scramble(DEMO_SCRAMBLE),
        client=_mock_client(lambda r: httpx.Response(500, json={"error": "boom"})),
    )
    assert out.source == "template" and out.fallback_reason.startswith("llm_error")
