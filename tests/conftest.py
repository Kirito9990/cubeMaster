import pytest
from fastapi.testclient import TestClient

from backend.app import app

DEMO_SCRAMBLE = "D L' F2 R' B2 L' U2 F2 R B2 R2 D2 B2 F' L' R' U' B L B2 R2"
# Green front, cross "L B R2 F": a 7-move BL pair becomes "L' U L2 U L'" (5 moves)
# when U is inserted before the final F.
INSERTION_SCRAMBLE = "F2 U2 D R D' B F' U' F D2 F2 U' R B' R' L' F' U' R L F"
# Cross ends in F' (y orientation); inserting U' turns a 7-move BR pair into "U R' U2 R".
INSERTION_SCRAMBLE_2 = "F' L R2 U' R' U2 B' F2 U L' R' B' U D B' F2 R B2 F2 U' D"
KNOWN_SCRAMBLES = [
    DEMO_SCRAMBLE,
    INSERTION_SCRAMBLE,
    INSERTION_SCRAMBLE_2,
    "R2 D2 F2 U' B2 U R2 U' L2 B2 D' R' F' D2 L U' F2 D' R' B L2",
    "F U2 L2 B2 F' U L2 U R2 D2 L' B L2 B2 R2 U2",
]


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(scope="session")
def analyses(client):
    out = {}
    for s in KNOWN_SCRAMBLES:
        r = client.post("/api/analyze", json={"scramble": s})
        assert r.status_code == 200, r.text
        out[s] = r.json()
    return out


@pytest.fixture(autouse=True)
def no_llm_env(monkeypatch):
    for var in ("CUBEMASTER_LLM_API_KEY", "OPENAI_API_KEY", "CUBEMASTER_LLM_BASE_URL", "OPENAI_BASE_URL"):
        monkeypatch.delenv(var, raising=False)
