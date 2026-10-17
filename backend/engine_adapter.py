"""Thin performance adapters around c_plus_1_engine (the engine file stays untouched)."""
import sys
import threading
from pathlib import Path
from typing import Dict, FrozenSet, Optional, Tuple

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from c_plus_1_engine import FACE_NORMALS, Cube3D, Cubie, FastSolverEngine, PieceState  # noqa: E402

PairKey = Tuple[str, PieceState, PieceState, int]


class FastCube(Cube3D):
    """Cube3D whose clone avoids copy.deepcopy (an order of magnitude faster)."""

    def clone(self) -> "FastCube":
        c = FastCube.__new__(FastCube)
        c.cubies = [Cubie(pos=x.pos, stickers=dict(x.stickers), home_id=x.home_id) for x in self.cubies]
        return c


class _PairProbe:
    """Minimal stand-in exposing exactly what solve_rul_f2l_slot reads from a cube:
    centre colours plus the slot's corner/edge position and key-sticker normal."""

    def __init__(self, slot: str, c_state: PieceState, e_state: PieceState):
        self._centers = {face: face for face in FACE_NORMALS}
        d, fb, rl = "D", slot[0], slot[1]
        self._pieces = {
            frozenset({d, fb, rl}): Cubie(pos=c_state[0], stickers={c_state[1]: d}, home_id=frozenset({d, fb, rl})),
            frozenset({fb, rl}): Cubie(pos=e_state[0], stickers={e_state[1]: fb}, home_id=frozenset({fb, rl})),
        }

    def center_color(self, face: str) -> str:
        return self._centers[face]

    def find_piece(self, colors: FrozenSet[str]) -> Cubie:
        return self._pieces[colors]


class CachedSolverEngine(FastSolverEngine):
    """Memoizes solve_rul_f2l_slot.

    The parent search always starts from a solved cross (DR/DL at goal), so its
    result depends only on (slot, corner state, edge state, max_depth).
    """

    def __init__(self):
        super().__init__()
        self._pair_cache: Dict[PairKey, Optional[str]] = {}
        self._lock = threading.Lock()

    @staticmethod
    def pair_start(cube: Cube3D, slot_name: str) -> Tuple[PieceState, PieceState]:
        d_col = cube.center_color("D")
        c_fb, c_rl = cube.center_color(slot_name[0]), cube.center_color(slot_name[1])
        corner = cube.find_piece(frozenset({d_col, c_fb, c_rl}))
        edge = cube.find_piece(frozenset({c_fb, c_rl}))
        c_norm = next(n for n, col in corner.stickers.items() if col == d_col)
        e_norm = next(n for n, col in edge.stickers.items() if col == c_fb)
        return (corner.pos, c_norm), (edge.pos, e_norm)

    def solve_rul_f2l_slot(self, cube: Cube3D, slot_name: str, max_depth: int = 9) -> Optional[str]:
        c_start, e_start = self.pair_start(cube, slot_name)
        key = (slot_name, c_start, e_start, max_depth)
        if key in self._pair_cache:
            return self._pair_cache[key]
        result = super().solve_rul_f2l_slot(cube, slot_name, max_depth)
        with self._lock:
            self._pair_cache[key] = result
        return result

    def cache_size(self) -> int:
        return len(self._pair_cache)

    def warm_pair_cache(self, max_depth: int = 9, stop: Optional[threading.Event] = None) -> int:
        """Pre-solve every <R,U,L>-reachable pair state of all four slots."""
        for slot_name, pdb in self.f2l_pair_pdbs.items():
            for c_st, e_st in list(pdb):
                if stop is not None and stop.is_set():
                    return self.cache_size()
                if (slot_name, c_st, e_st, max_depth) not in self._pair_cache:
                    self.solve_rul_f2l_slot(_PairProbe(slot_name, c_st, e_st), slot_name, max_depth)
        return self.cache_size()
