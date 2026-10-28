import httpx

from backend.analysis import analyze_scramble
from backend import coach

from .conftest import DEMO_SCRAMBLE, INSERTION_SCRAMBLE


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_random_scramble_endpoint(client):
    r = client.get("/api/scramble?length=20")
    assert r.status_code == 200
    scramble = r.json()["scramble"]
    assert len(scramble.split()) == 20


def test_analyze_structure(client):
    r = client.post("/api/analyze", json={"scramble": DEMO_SCRAMBLE})
    assert r.status_code == 200
    data = r.json()
    assert data["scramble"] == DEMO_SCRAMBLE
    assert data["cross_color"] == "white"
    assert len(data["orientations"]) == 4
    for o in data["orientations"]:
        assert o["optimal_cross_moves"] <= 8
        assert len(o["routes"]) >= 1
        for route in o["routes"]:
            assert len(route["pairs"]) == 4


def test_color_neutrality_modes(client):
    # Dual color (White + Yellow)
    r_dual = client.post("/api/analyze", json={"scramble": DEMO_SCRAMBLE, "color_mode": "dual"})
    assert r_dual.status_code == 200
    d_dual = r_dual.json()
    assert len(d_dual["color_summaries"]) == 2
    assert {s["cross_color"] for s in d_dual["color_summaries"]} == {"white", "yellow"}

    # Full 6-color neutrality
    r_full = client.post("/api/analyze", json={"scramble": DEMO_SCRAMBLE, "color_mode": "full"})
    assert r_full.status_code == 200
    d_full = r_full.json()
    assert len(d_full["color_summaries"]) == 6
    assert d_full["color_summaries"][0]["rank"] == 1
    assert d_full["best_orientation"]["cross_color"] == d_full["color_summaries"][0]["cross_color"]


def test_analyze_scramble_returns_best_orientation(client):
    r = client.post("/api/analyze", json={"scramble": DEMO_SCRAMBLE})
    data = r.json()
    best = data["best_orientation"]
    assert best["rank"] == 1


def test_insertion_highlights_present_when_applicable(client):
    r = client.post("/api/analyze", json={"scramble": INSERTION_SCRAMBLE})
    data = r.json()
    assert len(data["insertion_highlights"]) > 0
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


# ---------------------------------------------------------------------- coach layer


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
            200, json={"choices": [{"message": {"content": "建议多练习十字。"}}]}
        ))
    )
    assert out.source == "template" and out.fallback_reason == "llm_output_failed_validation"


def test_coach_llm_http_error_falls_back(monkeypatch):
    _llm_env(monkeypatch)
    out = coach.generate_comment(
        analyze_scramble(DEMO_SCRAMBLE),
        client=_mock_client(lambda r: httpx.Response(500, json={"error": "fail"}))
    )
    assert out.source == "template" and out.fallback_reason == "llm_http_error"
