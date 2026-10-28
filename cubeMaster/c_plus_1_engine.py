from collections import deque
from dataclasses import dataclass
from typing import Dict, List, Tuple, FrozenSet, Optional
import copy

Vector3 = Tuple[int, int, int]
PieceState = Tuple[Vector3, Vector3]  # (3D坐标, 关键贴纸法向量)

FACE_NORMALS: Dict[str, Vector3] = {
    'R': (1, 0, 0),  'L': (-1, 0, 0),
    'U': (0, 1, 0),  'D': (0, -1, 0),
    'F': (0, 0, 1),  'B': (0, 0, -1),
}

ALL_MOVES = [
    "U", "U'", "U2", "D", "D'", "D2",
    "R", "R'", "R2", "L", "L'", "L2",
    "F", "F'", "F2", "B", "B'", "B2",
]
RUL_MOVES = ["U", "U'", "U2", "R", "R'", "R2", "L", "L'", "L2"]
OPPOSITE_SECOND = {'D': 'U', 'L': 'R', 'B': 'F'}


@dataclass
class Cubie:
    pos: Vector3
    stickers: Dict[Vector3, str]
    home_id: FrozenSet[str]


class Cube3D:
    """基于 3D 坐标精确旋转矩阵的魔方状态机"""

    def __init__(self):
        self.cubies: List[Cubie] = []
        for x in (-1, 0, 1):
            for y in (-1, 0, 1):
                for z in (-1, 0, 1):
                    if (x, y, z) == (0, 0, 0):
                        continue
                    stickers: Dict[Vector3, str] = {}
                    if x == 1:  stickers[(1, 0, 0)] = 'R'
                    if x == -1: stickers[(-1, 0, 0)] = 'L'
                    if y == 1:  stickers[(0, 1, 0)] = 'U'
                    if y == -1: stickers[(0, -1, 0)] = 'D'
                    if z == 1:  stickers[(0, 0, 1)] = 'F'
                    if z == -1: stickers[(0, 0, -1)] = 'B'
                    self.cubies.append(
                        Cubie(pos=(x, y, z), stickers=stickers, home_id=frozenset(stickers.values()))
                    )

    def clone(self) -> 'Cube3D':
        return copy.deepcopy(self)

    @staticmethod
    def _rot_vec(v: Vector3, axis: str, cw: bool) -> Vector3:
        x, y, z = v
        if axis == 'U':  return (-z, y, x) if cw else (z, y, -x)
        elif axis == 'D': return (z, y, -x) if cw else (-z, y, x)
        elif axis == 'R': return (x, z, -y) if cw else (x, -z, y)
        elif axis == 'L': return (x, -z, y) if cw else (x, z, -y)
        elif axis == 'F': return (y, -x, z) if cw else (-y, x, z)
        elif axis == 'B': return (-y, x, z) if cw else (y, -x, z)
        raise ValueError(f"Unknown axis: {axis}")

    @staticmethod
    def _in_layer(pos: Vector3, base: str) -> bool:
        if base == 'U': return pos[1] == 1
        if base == 'D': return pos[1] == -1
        if base == 'R': return pos[0] == 1
        if base == 'L': return pos[0] == -1
        if base == 'F': return pos[2] == 1
        if base == 'B': return pos[2] == -1
        return True

    def move_single(self, token: str) -> None:
        base = token[0]
        suffix = token[1:] if len(token) > 1 else ""
        times = 2 if suffix == '2' else 1
        cw = (suffix != "'")
        rot_axis = {'y': 'U', 'x': 'R', 'z': 'F'}.get(base, base)

        for _ in range(times):
            for c in self.cubies:
                if self._in_layer(c.pos, base):
                    c.pos = self._rot_vec(c.pos, rot_axis, cw)
                    c.stickers = {
                        self._rot_vec(n, rot_axis, cw): color
                        for n, color in c.stickers.items()
                    }

    def apply(self, alg: str) -> 'Cube3D':
        for token in alg.strip().split():
            if token:
                self.move_single(token)
        return self

    def center_color(self, face: str) -> str:
        target_pos = FACE_NORMALS[face]
        for c in self.cubies:
            if c.pos == target_pos and len(c.home_id) == 1:
                return c.stickers[target_pos]
        return face

    def find_piece(self, colors: FrozenSet[str]) -> Cubie:
        for c in self.cubies:
            if set(c.stickers.values()) == colors:
                return c
        raise ValueError(f"Piece with colors {colors} not found!")

    def is_cross_solved(self) -> bool:
        d_col = self.center_color('D')
        for face in ('F', 'B', 'R', 'L'):
            f_col = self.center_color(face)
            edge = self.find_piece(frozenset({d_col, f_col}))
            if edge.pos != (FACE_NORMALS[face][0] + FACE_NORMALS['D'][0],
                            FACE_NORMALS[face][1] + FACE_NORMALS['D'][1],
                            FACE_NORMALS[face][2] + FACE_NORMALS['D'][2]):
                return False
            if edge.stickers.get(FACE_NORMALS['D']) != d_col:
                return False
        return True


class FastSolverEngine:
    """包含 PDB 剪枝与 IDA* 算法的高性能 C+1 求解引擎"""

    SOLVED_CROSS = [
        ((0, -1, 1), (0, -1, 0)),   # DF
        ((1, -1, 0), (0, -1, 0)),   # DR
        ((0, -1, -1), (0, -1, 0)),  # DB
        ((-1, -1, 0), (0, -1, 0)),  # DL
    ]

    SLOT_TARGETS = {
        'FR': (((1, -1, 1), (0, -1, 0)), ((1, 0, 1), (0, 0, 1))),
        'FL': (((-1, -1, 1), (0, -1, 0)), ((-1, 0, 1), (0, 0, 1))),
        'BR': (((1, -1, -1), (0, -1, 0)), ((1, 0, -1), (0, 0, -1))),
        'BL': (((-1, -1, -1), (0, -1, 0)), ((-1, 0, -1), (0, 0, -1))),
    }

    def __init__(self):
        self.edge_trans, self.corner_trans = self._build_transition_tables()
        self.cross_pdb = self._build_cross_pdb()
        self.f2l_pair_pdbs = {
            slot: self._build_f2l_pair_pdb(slot) for slot in ['FR', 'FL', 'BR', 'BL']
        }

    def _build_transition_tables(self):
        edge_trans, corner_trans = {}, {}
        for m in ALL_MOVES:
            e_map, c_map = {}, {}
            for x in (-1, 0, 1):
                for y in (-1, 0, 1):
                    for z in (-1, 0, 1):
                        pos = (x, y, z)
                        if abs(x) + abs(y) + abs(z) == 2:
                            for norm in [n for n in FACE_NORMALS.values() if pos[0]*n[0]+pos[1]*n[1]+pos[2]*n[2] == 1]:
                                c = Cubie(pos=pos, stickers={norm: 'X'}, home_id=frozenset())
                                tmp = Cube3D()
                                tmp.cubies = [c]
                                tmp.move_single(m)
                                new_c = tmp.cubies[0]
                                new_norm = list(new_c.stickers.keys())[0]
                                e_map[(pos, norm)] = (new_c.pos, new_norm)
                        elif abs(x) + abs(y) + abs(z) == 3:
                            for norm in [n for n in FACE_NORMALS.values() if pos[0]*n[0]+pos[1]*n[1]+pos[2]*n[2] == 1]:
                                c = Cubie(pos=pos, stickers={norm: 'X'}, home_id=frozenset())
                                tmp = Cube3D()
                                tmp.cubies = [c]
                                tmp.move_single(m)
                                new_c = tmp.cubies[0]
                                new_norm = list(new_c.stickers.keys())[0]
                                c_map[(pos, norm)] = (new_c.pos, new_norm)
            edge_trans[m] = e_map
            corner_trans[m] = c_map
        return edge_trans, corner_trans

    def _build_cross_pdb(self) -> Dict[Tuple[PieceState, PieceState, PieceState, PieceState], int]:
        pdb = {tuple(self.SOLVED_CROSS): 0}
        q = deque([tuple(self.SOLVED_CROSS)])
        while q:
            curr = q.popleft()
            d = pdb[curr]
            if d == 6:
                continue
            for m in ALL_MOVES:
                nxt = (
                    self.edge_trans[m][curr[0]],
                    self.edge_trans[m][curr[1]],
                    self.edge_trans[m][curr[2]],
                    self.edge_trans[m][curr[3]],
                )
                if nxt not in pdb:
                    pdb[nxt] = d + 1
                    q.append(nxt)
        return pdb

    def _build_f2l_pair_pdb(self, slot: str) -> Dict[Tuple[PieceState, PieceState], int]:
        target_c, target_e = self.SLOT_TARGETS[slot]
        pdb = {(target_c, target_e): 0}
        q = deque([(target_c, target_e)])
        while q:
            c_st, e_st = q.popleft()
            d = pdb[(c_st, e_st)]
            if d == 8:
                continue
            for m in RUL_MOVES:
                nxt = (self.corner_trans[m][c_st], self.edge_trans[m][e_st])
                if nxt not in pdb:
                    pdb[nxt] = d + 1
                    q.append(nxt)
        return pdb

    def solve_crosses(self, cube: Cube3D, max_solutions: int = 5) -> List[str]:
        d_col = cube.center_color('D')
        faces = ['F', 'R', 'B', 'L']
        edges = [cube.find_piece(frozenset({d_col, cube.center_color(f)})) for f in faces]
        start_state = []
        for i, f in enumerate(faces):
            c = edges[i]
            d_norm = next(n for n, col in c.stickers.items() if col == d_col)
            start_state.append((c.pos, d_norm))
        start_state = tuple(start_state)

        solutions = []

        def h(st):
            return self.cross_pdb.get(st, 7)

        def dfs(st, depth, bound, path):
            cost = depth + h(st)
            if cost > bound:
                return cost
            if st == tuple(self.SOLVED_CROSS):
                solutions.append(" ".join(path))
                return cost
            min_t = 999
            last_face = path[-1][0] if path else ""
            for m in ALL_MOVES:
                face = m[0]
                if face == last_face or OPPOSITE_SECOND.get(face) == last_face:
                    continue
                nxt = (
                    self.edge_trans[m][st[0]], self.edge_trans[m][st[1]],
                    self.edge_trans[m][st[2]], self.edge_trans[m][st[3]],
                )
                path.append(m)
                t = dfs(nxt, depth + 1, bound, path)
                path.pop()
                if len(solutions) >= max_solutions:
                    return t
                if t < min_t:
                    min_t = t
            return min_t

        bound = h(start_state)
        while bound <= 8 and len(solutions) < max_solutions:
            t = dfs(start_state, 0, bound, [])
            if solutions:
                break
            bound = t
        return solutions

    def solve_rul_f2l_slot(self, cube: Cube3D, slot_name: str, max_depth: int = 9) -> Optional[str]:
        """在保持十字不被破坏的前提下，搜索指定槽位的最短 <R, U, L> 无转体解法"""
        fb_face, rl_face = slot_name[0], slot_name[1]
        d_col = cube.center_color('D')
        c_fb = cube.center_color(fb_face)
        c_rl = cube.center_color(rl_face)

        corner = cube.find_piece(frozenset({d_col, c_fb, c_rl}))
        edge = cube.find_piece(frozenset({c_fb, c_rl}))

        c_d_norm = next(n for n, col in corner.stickers.items() if col == d_col)
        e_fb_norm = next(n for n, col in edge.stickers.items() if col == c_fb)

        c_start: PieceState = (corner.pos, c_d_norm)
        e_start: PieceState = (edge.pos, e_fb_norm)
        pair_pdb = self.f2l_pair_pdbs[slot_name]

        if (c_start, e_start) not in pair_pdb:
            return None

        dr_goal = self.SOLVED_CROSS[1]
        dl_goal = self.SOLVED_CROSS[3]
        c_goal, e_goal = self.SLOT_TARGETS[slot_name]

        def h(dr_st: PieceState, dl_st: PieceState, c_st: PieceState, e_st: PieceState) -> int:
            cross_h = 0
            if dr_st != dr_goal: cross_h += 1
            if dl_st != dl_goal: cross_h += 1
            return max(cross_h, pair_pdb[(c_st, e_st)])

        found_alg: List[str] = []

        def dfs(dr_st, dl_st, c_st, e_st, depth: int, bound: int, path: List[str]) -> int:
            est = depth + h(dr_st, dl_st, c_st, e_st)
            if est > bound:
                return est
            if dr_st == dr_goal and dl_st == dl_goal and c_st == c_goal and e_st == e_goal:
                found_alg.append(" ".join(path))
                return est
            min_t = 999
            last_face = path[-1][0] if path else ""
            for m in RUL_MOVES:
                face = m[0]
                if face == last_face or OPPOSITE_SECOND.get(face) == last_face:
                    continue
                path.append(m)
                t = dfs(
                    self.edge_trans[m][dr_st],
                    self.edge_trans[m][dl_st],
                    self.corner_trans[m][c_st],
                    self.edge_trans[m][e_st],
                    depth + 1, bound, path
                )
                path.pop()
                if found_alg:
                    return t
                if t < min_t:
                    min_t = t
            return min_t

        bound = h(dr_goal, dl_goal, c_start, e_start)
        while bound <= max_depth:
            t = dfs(dr_goal, dl_goal, c_start, e_start, 0, bound, [])
            if found_alg:
                return found_alg[0]
            if t > max_depth:
                break
            bound = t
        return None


@dataclass
class PairReport:
    slot_name: str
    is_back_slot: bool
    edge_good_eo: bool
    both_in_u: bool
    rul_alg: Optional[str]
    rul_moves: int
    c1_score: float
    summary: str


class CPlusOneTutor:
    """Sub-15 进阶 C+1 启发式评估器 (v3.0 精确步数版)"""

    SLOTS = {
        'FR': ('F', 'R', False),
        'FL': ('F', 'L', False),
        'BR': ('B', 'R', True),
        'BL': ('B', 'L', True),
    }

    @staticmethod
    def cross_ergonomic_score(cross_alg: str) -> float:
        tokens = cross_alg.split()
        score = 100.0 - 6.0 * len(tokens)
        for t in tokens:
            if t[0] == 'B':
                score -= 12.0
            elif t[0] in ('R', 'L', 'U'):
                score += 2.0
        return round(score, 1)

    @classmethod
    def analyze_c1_state(cls, cross_solved_cube: Cube3D, engine: FastSolverEngine) -> List[PairReport]:
        reports = []
        for slot_name, (_, _, is_back) in cls.SLOTS.items():
            corner, edge, d_col, c_fb = cls._get_pair_pieces(cross_solved_cube, slot_name)
            c_st = (corner.pos, next(n for n, col in corner.stickers.items() if col == d_col))
            e_st = (edge.pos, next(n for n, col in edge.stickers.items() if col == c_fb))

            is_good_eo = (c_st, e_st) in engine.f2l_pair_pdbs[slot_name]
            both_u = (corner.pos[1] == 1) and (edge.pos[1] == 1)

            rul_alg = engine.solve_rul_f2l_slot(cross_solved_cube, slot_name) if is_good_eo else None
            rul_moves = len(rul_alg.split()) if rul_alg else 99

            base_score = 100.0 if is_good_eo else 30.0
            if rul_moves <= 4:
                base_score += 20.0
            elif rul_moves <= 6:
                base_score += 10.0
            else:
                base_score -= 15.0

            if is_back and is_good_eo and rul_moves <= 6:
                base_score += 15.0
            if both_u and is_good_eo:
                base_score += 5.0

            summary = cls._generate_summary(is_good_eo, rul_moves, is_back, both_u)
            reports.append(PairReport(
                slot_name=slot_name,
                is_back_slot=is_back,
                edge_good_eo=is_good_eo,
                both_in_u=both_u,
                rul_alg=rul_alg,
                rul_moves=rul_moves,
                c1_score=round(base_score, 1),
                summary=summary
            ))

        reports.sort(key=lambda r: r.c1_score, reverse=True)
        return reports

    @staticmethod
    def _get_pair_pieces(cube: Cube3D, slot_name: str):
        d_col = cube.center_color('D')
        c_fb, c_rl = cube.center_color(slot_name[0]), cube.center_color(slot_name[1])
        corner = cube.find_piece(frozenset({d_col, c_fb, c_rl}))
        edge = cube.find_piece(frozenset({c_fb, c_rl}))
        return corner, edge, d_col, c_fb

    @staticmethod
    def _generate_summary(is_good_eo: bool, moves: int, is_back: bool, both_u: bool) -> str:
        if not is_good_eo:
            return "Bad EO：做十字破坏了方向，需要转体或 F/B 动作，极不推荐作为第一组。"
        pos_desc = "双块均在顶层" if both_u else "存在底层或槽内块"
        slot_desc = "后槽优先（留足前方视野）" if is_back else "前槽"
        if moves <= 4:
            return f"极佳 ({moves} 步)：{pos_desc}，{slot_desc}，无体转极速直插！"
        elif moves <= 6:
            return f"顺手 ({moves} 步)：{pos_desc}，{slot_desc}，无转体标准配对。"
        else:
            return f"卡手 ({moves} 步)：虽为 Good EO 但步数较长，建议观察期放弃。"

    @staticmethod
    def optimize_last_cross_step(base_cube: Cube3D, cross_alg: str, engine: FastSolverEngine):
        tokens = cross_alg.split()
        if not tokens:
            return
        prefix = tokens[:-1]
        final_move = tokens[-1]

        for auf in ["", "U", "U'", "U2"]:
            test_cross = " ".join(prefix + ([auf] if auf else []) + [final_move])
            solved_cube = base_cube.clone().apply(test_cross)
            if solved_cube.is_cross_solved():
                reports = CPlusOneTutor.analyze_c1_state(solved_cube, engine)
                best_pair = reports[0]
                yield auf, test_cross, best_pair
