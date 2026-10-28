import pytest
from fastapi.testclient import TestClient

from backend.app import app

DEMO_SCRAMBLE = "D L' F2 R' B2 L' U2 F2 R B2 R2 D2 B2 F' L' R' U' B L B2 R2"
INSERTION_SCRAMBLE = "F2 U2 D R D' B F' U' F D2 F2 U' R B' R' L' F' U' R L F"
UPRIME_INSERTION_SCRAMBLE = "F' L R2 U' R' U2 B' F2 U L' R' B' U D B' F2 R B2 F2 U' D"

KNOWN_SCRAMBLES = [
    DEMO_SCRAMBLE,
    INSERTION_SCRAMBLE,
    UPRIME_INSERTION_SCRAMBLE,
]


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(scope="session")
def analyses(client):
    out = {}
    for s in KNOWN_SCRAMBLES:
        r = client.post("/api/analyze", json={"scramble": s})
        assert r.status_code == 200
        out[s] = r.json()
    return out
