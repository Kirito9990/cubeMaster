"""Re-verify every API answer on a fresh, unmodified engine Cube3D."""
import pytest

from backend.analysis import CROSS_COLOR_CONFIG, is_slot_solved
from c_plus_1_engine import Cube3D

from .conftest import DEMO_SCRAMBLE, KNOWN_SCRAMBLES


def fresh(scramble: str, *algs: str) -> Cube3D:
    cube = Cube3D().apply(scramble)
    for a in algs:
        cube.apply(a)
    return cube


def is_solved(cube: Cube3D) -> bool:
    solved = Cube3D()
    return all(
        c.pos == h.pos and c.stickers == h.stickers
        for c, h in zip(sorted(cube.cubies, key=lambda c: sorted(c.home_id)),
                        sorted(solved.cubies, key=lambda c: sorted(c.home_id)))
    )


@pytest.mark.parametrize("alg,power", [("R U R' U'", 6), ("R U", 105), ("F R U R' U' F'", 6), ("y x z", 4)])
def test_engine_move_identities(alg, power):
    assert is_solved(Cube3D().apply(" ".join([alg] * power)))


@pytest.mark.parametrize("color_name,cfg", list(CROSS_COLOR_CONFIG.items()))
def test_all_six_cross_colors_verify_on_fresh_cube(client, color_name, cfg):
    base_rot, label, expected_d_face = cfg
    # Verify base_rot brings expected_d_face onto D
    c0 = Cube3D().apply(base_rot)
    assert c0.center_color("D") == expected_d_face

    r = client.post(
        "/api/analyze",
        json={"scramble": DEMO_SCRAMBLE, "color_mode": "custom", "cross_colors": [color_name]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["cross_color"] == color_name
    assert data["cross_color_label"] == label
    for o in data["orientations"]:
        for route in o["routes"]:
            cube_cross = fresh(DEMO_SCRAMBLE, o["inspection_alg"], route["cross"])
            assert cube_cross.is_cross_solved()
            assert cube_cross.center_color("D") == expected_d_face
            fp = route["first_pair"]
            if fp["rul_alg"]:
                cube_c1 = fresh(DEMO_SCRAMBLE, route["playback_alg"])
                assert cube_c1.is_cross_solved()
                assert is_slot_solved(cube_c1, fp["slot"])
