"""Re-verify every API answer on a fresh, unmodified engine Cube3D."""
import pytest

from backend.analysis import is_slot_solved
from c_plus_1_engine import Cube3D

from .conftest import KNOWN_SCRAMBLES


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


def test_engine_move_directions_match_wca():
    # U turns the front layer to the left; R takes the front stickers up.
    cube = Cube3D().apply("U")
    assert cube.find_piece(frozenset({"U", "F"})).pos == (-1, 1, 0)
    cube = Cube3D().apply("R")
    assert cube.find_piece(frozenset({"F", "R"})).pos == (1, 1, 0)


@pytest.mark.parametrize("scramble", KNOWN_SCRAMBLES)
def test_every_route_solves_cross_and_pair(analyses, scramble):
    data = analyses[scramble]
    for o in data["orientations"]:
        lengths = {r["cross_moves"] for r in o["routes"]}
        assert lengths == {o["optimal_cross_moves"]}, "all returned crosses should be optimal-length"
        assert o["optimal_cross_moves"] <= 8
        for route in o["routes"]:
            cross_done = fresh(scramble, o["inspection_alg"], route["cross"])
            assert cross_done.is_cross_solved(), route["cross"]
            assert route["verified"]
            for pair in route["pairs"]:
                if pair["rul_alg"] is None:
                    continue
                assert set(t[0] for t in pair["rul_alg"].split()) <= set("RUL")
                end = cross_done.clone().apply(pair["rul_alg"])
                assert end.is_cross_solved()
                assert is_slot_solved(end, pair["slot"]), (route["cross"], pair)
                assert pair["verified"]


@pytest.mark.parametrize("scramble", KNOWN_SCRAMBLES)
def test_playback_alg_is_one_continuous_solution(analyses, scramble):
    pb = analyses[scramble]["playback"]
    end = fresh(pb["setup_alg"], pb["alg"])
    assert end.is_cross_solved()
    if pb["pair_slot"]:
        assert is_slot_solved(end, pb["pair_slot"])
    assert pb["alg"] == " ".join(p for p in (pb["inspection"], pb["cross"], pb["pair"]) if p)


@pytest.mark.parametrize("scramble", KNOWN_SCRAMBLES)
def test_insertion_highlights_are_verified(analyses, scramble):
    for h in analyses[scramble]["insertion_highlights"]:
        tokens = h["original_cross"].split()
        assert h["new_cross"].split() == tokens[:-1] + [h["auf"], tokens[-1]]
        end = fresh(scramble, "z2", h["rotation"], h["full_solution"])
        assert end.is_cross_solved() and is_slot_solved(end, h["slot"])
        end2 = fresh(scramble, h["playback_alg"])
        assert end2.is_cross_solved() and is_slot_solved(end2, h["slot"])


def test_pair_probe_matches_real_cube():
    from backend.engine_adapter import CachedSolverEngine, _PairProbe
    from c_plus_1_engine import FastSolverEngine

    plain, cached = FastSolverEngine(), CachedSolverEngine()
    cube = Cube3D().apply(KNOWN_SCRAMBLES[0]).apply("z2 y2 D' R' D2 B' F' R")
    for slot in ("FR", "FL", "BR", "BL"):
        c_st, e_st = CachedSolverEngine.pair_start(cube, slot)
        expected = plain.solve_rul_f2l_slot(cube, slot, max_depth=9)
        assert cached.solve_rul_f2l_slot(_PairProbe(slot, c_st, e_st), slot, max_depth=9) == expected
        assert cached.solve_rul_f2l_slot(cube, slot, max_depth=9) == expected
