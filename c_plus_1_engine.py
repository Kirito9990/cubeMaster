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
        if axis == 'U':   return (-z, y, x) if cw else (z, y, -x)
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
        raise RuntimeError("Center not found")

    def find_piece(self, colors: FrozenSet[str]) -> Cubie:
        for c in self.cubies:
            if c.home_id == colors:
                return c
        raise KeyError(f"Piece {colors} not found")

    def is_cross_solved(self) -> bool:
        d_col = self.center_color('D')
        for face in ('F', 'R', 'B', 'L'):
            side_col = self.center_color(face)
            edge = self.find_piece(frozenset({d_col, side_col}))
            expected_pos = (FACE_NORMALS[face][0], -1, FACE_NORMALS[face][2])
            if edge.pos != expected_pos or edge.stickers.get((0, -1, 0)) != d_col:
                return False
        return True


class FastSolverEngine:
    """预计算棱块与角块状态转移表，支持毫秒级 Cross 与 <R,U,L> F2L 精确求解"""

    SOLVED_CROSS: Tuple[PieceState, ...] = (
        ((0, -1, 1), (0, -1, 0)),   # DF
        ((1, -1, 0), (0, -1, 0)),   # DR
        ((0, -1, -1), (0, -1, 0)),  # DB
        ((-1, -1, 0), (0, -1, 0)),  # DL
    )

    SLOT_TARGETS: Dict[str, Tuple[PieceState, PieceState]] = {
        # slot: (角块目标状态(pos, D贴纸法向), 棱块目标状态(pos, F/B贴纸法向))
        'FR': (((1, -1, 1), (0, -1, 0)),  ((1, 0, 1), (0, 0, 1))),
        'FL': (((-1, -1, 1), (0, -1, 0)), ((-1, 0, 1), (0, 0, 1))),
        'BR': (((1, -1, -1), (0, -1, 0)), ((1, 0, -1), (0, 0, -1))),
        'BL': (((-1, -1, -1), (0, -1, 0)), ((-1, 0, -1), (0, 0, -1))),
    }

    def __init__(self):
        self.edge_states: List[PieceState] = []
        self.corner_states: List[PieceState] = []
        for x in (-1, 0, 1):
            for y in (-1, 0, 1):
                for z in (-1, 0, 1):
                    norms = []
                    if x != 0: norms.append((x, 0, 0))
                    if y != 0: norms.append((0, y, 0))
                    if z != 0: norms.append((0, 0, z))
                    if abs(x) + abs(y) + abs(z) == 2:
                        for n in norms:
                            self.edge_states.append(((x, y, z), n))
                    elif abs(x) + abs(y) + abs(z) == 3:
                        for n in norms:
                            self.corner_states.append(((x, y, z), n))

        self.edge_trans: Dict[str, Dict[PieceState, PieceState]] = {}
        self.corner_trans: Dict[str, Dict[PieceState, PieceState]] = {}
        for m in ALL_MOVES:
            base = m[0]
            suffix = m[1:] if len(m) > 1 else ""
            times = 2 if suffix == '2' else 1
            cw = (suffix != "'")
            self.edge_trans[m] = {}
            self.corner_trans[m] = {}
            for pos, norm in self.edge_states:
                p, n = pos, norm
                for _ in range(times):
                    if Cube3D._in_layer(p, base):
                        p = Cube3D._rot_vec(p, base, cw)
                        n = Cube3D._rot_vec(n, base, cw)
                self.edge_trans[m][(pos, norm)] = (p, n)
            for pos, norm in self.corner_states:
                p, n = pos, norm
                for _ in range(times):
                    if Cube3D._in_layer(p, base):
                        p = Cube3D._rot_vec(p, base, cw)
                        n = Cube3D._rot_vec(n, base, cw)
                self.corner_trans[m][(pos, norm)] = (p, n)

        self.pdb_01 = self._build_edge_pdb(self.SOLVED_CROSS[0], self.SOLVED_CROSS[1], ALL_MOVES)
        self.pdb_23 = self._build_edge_pdb(self.SOLVED_CROSS[2], self.SOLVED_CROSS[3], ALL_MOVES)
        self.f2l_pair_pdbs = {
            slot: self._build_f2l_pdb(c_goal, e_goal)
            for slot, (c_goal, e_goal) in self.SLOT_TARGETS.items()
        }

    def _build_edge_pdb(self, s0: PieceState, s1: PieceState, moves: List[str]):
        dist = {(s0, s1): 0}
        q = deque([(s0, s1)])
        while q:
            cur = q.popleft()
            d = dist[cur]
            for m in moves:
                nxt = (self.edge_trans[m][cur[0]], self.edge_trans[m][cur[1]])
                if nxt not in dist:
                    dist[nxt] = d + 1
                    q.append(nxt)
        return dist

    def _build_f2l_pdb(self, c_goal: PieceState, e_goal: PieceState):
        """构建在 <R, U, L> 下角棱配对入槽的精确距离表"""
        dist = {(c_goal, e_goal): 0}
        q = deque([(c_goal, e_goal)])
        while q:
            cur_c, cur_e = q.popleft()
            d = dist[(cur_c, cur_e)]
            for m in RUL_MOVES:
                nxt = (self.corner_trans[m][cur_c], self.edge_trans[m][cur_e])
                if nxt not in dist:
                    dist[nxt] = d + 1
                    q.append(nxt)
        return dist

    @staticmethod
    def extract_cross_state(cube: Cube3D):
        d_col = cube.center_color('D')
        states = []
        for face in ('F', 'R', 'B', 'L'):
            side_col = cube.center_color(face)
            edge = cube.find_piece(frozenset({d_col, side_col}))
            d_norm = next(n for n, col in edge.stickers.items() if col == d_col)
            states.append((edge.pos, d_norm))
        return (states[0], states[1], states[2], states[3])

    def solve_crosses(self, cube: Cube3D, max_solutions: int = 8) -> List[str]:
        start_state = self.extract_cross_state(cube)
        solutions: List[str] = []

        def h(st) -> int:
            return max(self.pdb_01[(st[0], st[1])], self.pdb_23[(st[2], st[3])])

        def dfs(st, depth: int, bound: int, path: List[str]) -> int:
            est = depth + h(st)
            if est > bound:
                return est
            if st == self.SOLVED_CROSS:
                solutions.append(" ".join(path))
                return est
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
        """在保持底十字不被破坏的前提下，搜索指定槽位的最短 <R, U, L> 无转体解法"""
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

        # 若不在 <R, U, L> 可达集内（即 Bad Edge），直接返回 None
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
        """评估十字本身的人体工学顺手度：惩罚 B 动作，鼓励 R/L/F/D"""
        tokens = cross_alg.split()
        score = 100.0 - 6.0 * len(tokens)
        for t in tokens:
            if t[0] == 'B':
                score -= 12.0  # B 动作在固定朝向下极易卡手或导致换手
            elif t[0] in ('R', 'L', 'U'):
                score += 2.0
        return round(score, 1)

    @classmethod
    def analyze_c1_state(cls, cube: Cube3D, engine: FastSolverEngine) -> List[PairReport]:
        d_col = cube.center_color('D')
        reports: List[PairReport] = []

        for slot_name, (fb_face, rl_face, is_back) in cls.SLOTS.items():
            c_fb, c_rl = cube.center_color(fb_face), cube.center_color(rl_face)
            edge = cube.find_piece(frozenset({c_fb, c_rl}))
            corner = cube.find_piece(frozenset({d_col, c_fb, c_rl}))

            both_in_u = (edge.pos[1] == 1 and corner.pos[1] == 1)
            rul_alg = engine.solve_rul_f2l_slot(cube, slot_name, max_depth=9)
            edge_good_eo = (rul_alg is not None)
            rul_moves = len(rul_alg.split()) if rul_alg is not None else 99

            score = 60.0
            reasons = []

            if edge_good_eo:
                # 步数越少得分呈指数级奖励：3-4步是极品好块，7-8步是恶心粘连态
                move_bonus = max(-10.0, (7 - rul_moves) * 9.0)
                score += 20.0 + move_bonus
                if rul_moves <= 4:
                    reasons.append(f"极品标态({rul_moves}步: {rul_alg})")
                elif rul_moves <= 6:
                    reasons.append(f"顺手好块({rul_moves}步: {rul_alg})")
                else:
                    reasons.append(f"粘连/拆解态({rul_moves}步: {rul_alg})")
            else:
                score -= 30.0
                reasons.append("Bad EO(需转体y或Sledge变向)")

            if is_back:
                score += 10.0
                reasons.append("后槽(留视野)")
            else:
                score -= 4.0
                reasons.append("前槽")

            if both_in_u:
                score += 8.0
                reasons.append("双块在U层")

            reports.append(PairReport(
                slot_name=slot_name, is_back_slot=is_back,
                edge_good_eo=edge_good_eo, both_in_u=both_in_u,
                rul_alg=rul_alg, rul_moves=rul_moves,
                c1_score=round(score, 1), summary=" | ".join(reasons)
            ))

        return sorted(reports, key=lambda r: r.c1_score, reverse=True)

    @classmethod
    def optimize_last_cross_step(
        cls, scrambled_cube: Cube3D, cross_alg: str, engine: FastSolverEngine
    ) -> List[Tuple[str, str, PairReport]]:
        tokens = cross_alg.strip().split()
        if not tokens:
            return []
        prefix = " ".join(tokens[:-1])
        final_drop = tokens[-1]

        candidates = []
        for auf in ["", "U", "U'", "U2"]:
            full_cross = f"{prefix} {auf} {final_drop}".strip()
            c = scrambled_cube.clone().apply(full_cross)
            if not c.is_cross_solved():
                continue
            best_pair = cls.analyze_c1_state(c, engine)[0]
            label = auf if auf else "原收尾 (无AUF)"
            candidates.append((label, full_cross, best_pair))

        return sorted(candidates, key=lambda x: x[2].c1_score, reverse=True)


if __name__ == "__main__":
    USER_SCRAMBLE = "D L' F2 R' B2 L' U2 F2 R B2 R2 D2 B2 F' L' R' U' B L B2 R2"
    engine = FastSolverEngine()

    print(f"=== 打乱: {USER_SCRAMBLE} ===")
    print("=== 1. 15秒观察期：四向白底起手朝向对比（解决十字步数多/B动作卡手） ===")

    orientations = [
        ("绿前 (无预转)", ""),
        ("红前 (开表前 y)", "y"),
        ("橙前 (开表前 y')", "y'"),
        ("蓝前 (开表前 y2)", "y2"),
    ]

    best_overall = None
    for label, rot in orientations:
        base_cube = Cube3D().apply(USER_SCRAMBLE).apply("z2").apply(rot)
        crosses = engine.solve_crosses(base_cube, max_solutions=6)
        for alg in crosses:
            c = base_cube.clone().apply(alg)
            top_f2l = CPlusOneTutor.analyze_c1_state(c, engine)[0]
            erg_score = CPlusOneTutor.cross_ergonomic_score(alg)
            total_score = round(0.4 * erg_score + 0.6 * top_f2l.c1_score, 1)
            record = (total_score, erg_score, label, rot, alg, base_cube, c, top_f2l)
            if best_overall is None or total_score > best_overall[0]:
                best_overall = record
        # 打印当前朝向的最佳一条
        alg0 = crosses[0]
        c0 = base_cube.clone().apply(alg0)
        f2l0 = CPlusOneTutor.analyze_c1_state(c0, engine)[0]
        erg0 = CPlusOneTutor.cross_ergonomic_score(alg0)
        print(
            f"朝向 [{label:14s}] -> 最短十字: [{alg0:18s}] (十字手感分 {erg0:4.1f}) | "
            f"首组 [{f2l0.slot_name}槽] -> {f2l0.summary}"
        )

    _, _, best_label, best_rot, best_alg, best_base_cube, best_solved_cube, _ = best_overall
    print(f"\n=== 2. 最佳实战起手 [{best_label}] 十字 [{best_alg}] 四槽精确 F2L 诊断 ===")
    for rank, rep in enumerate(CPlusOneTutor.analyze_c1_state(best_solved_cube, engine), 1):
        print(f"Top {rank} [{rep.slot_name}槽] 评分: {rep.c1_score:5.1f} | {rep.summary}")

    print(f"\n=== 3. C+1 收尾微调：在 [{best_alg}] 最后一步前插入 AUF 改变首组步数 ===")
    for auf_label, full_alg, best_rep in CPlusOneTutor.optimize_last_cross_step(best_base_cube, best_alg, engine):
        print(
            f"方案 [{auf_label:13s}] -> Cross: {full_alg:22s} | "
            f"首组 [{best_rep.slot_name}槽] (得分 {best_rep.c1_score:5.1f}) -> {best_rep.summary}"
        )