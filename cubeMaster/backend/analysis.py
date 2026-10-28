import copy
import time
from functools import lru_cache
from typing import Dict, List, Optional, Tuple

from .engine_adapter import CachedSolverEngine, FastCube
from c_plus_1_engine import CPlusOneTutor, Cube3D, FastSolverEngine, PairReport, PieceState

from .schemas import (
    AnalyzeResponse,
    AufVariant,
    CoachComment,
    ColorCrossSummary,
    InsertionHighlight,
    OrientationResult,
    PairCard,
    Playback,
    Route,
)

FACE_COLORS: Dict[str, Tuple[str, str]] = {
    "U": ("white", "白"), "D": ("yellow", "黄"),
    "F": ("green", "绿"), "B": ("blue", "蓝"),
    "R": ("red", "红"), "L": ("orange", "橙"),
}

CROSS_COLOR_CONFIG: Dict[str, Tuple[str, str, str]] = {
    "white":  ("z2", "白底", "U"),
    "yellow": ("",   "黄底", "D"),
    "green":  ("x'", "绿底", "F"),
    "blue":   ("x",  "蓝底", "B"),
    "red":    ("z",  "红底", "R"),
    "orange": ("z'", "橙底", "L"),
}

COLOR_MODE_PRESETS: Dict[str, Tuple[str, ...]] = {
    "white": ("white",),
    "dual": ("white", "yellow"),
    "full": ("white", "yellow", "green", "blue", "red", "orange"),
}

CROSS_ON_BOTTOM = "z2"
ORIENTATIONS = ["", "y", "y'", "y2"]
SLOT_LABELS = {"FR": "FR 前右槽", "FL": "FL 前左槽", "BR": "BR 后右槽", "BL": "BL 后左槽"}

MAX_CROSS_SOLUTIONS = 6
COMFORTABLE_MAX_MOVES = 6
STUCK_MIN_MOVES = 7
STANDARD_INSERT_MAX_MOVES = 5
INSERTION_AUFS = ("U", "U'")

CROSS_WEIGHT = 0.4
PAIR_WEIGHT = 0.6

ENGINE = CachedSolverEngine()


def join_algs(*parts: str) -> str:
    return " ".join(p.strip() for p in parts if p and p.strip())


def total_score(cross_alg: str, first_pair: PairReport) -> float:
    erg = CPlusOneTutor.cross_ergonomic_score(cross_alg)
    return round(CROSS_WEIGHT * erg + PAIR_WEIGHT * first_pair.c1_score, 1)


def location_name(pos: Tuple[int, int, int]) -> str:
    x, y, z = pos
    name = ""
    if y == 1: name += "U"
    if y == -1: name += "D"
    if z == 1: name += "F"
    if z == -1: name += "B"
    if x == 1: name += "R"
    if x == -1: name += "L"
    return name


def pair_pieces(cube: Cube3D, slot: str):
    d_col = cube.center_color("D")
    c_fb, c_rl = cube.center_color(slot[0]), cube.center_color(slot[1])
    corner = cube.find_piece(frozenset({d_col, c_fb, c_rl}))
    edge = cube.find_piece(frozenset({c_fb, c_rl}))
    return corner, edge, d_col, c_fb


def pair_state(cube: Cube3D, slot: str) -> Tuple[PieceState, PieceState]:
    corner, edge, d_col, c_fb = pair_pieces(cube, slot)
    c_norm = next(n for n, col in corner.stickers.items() if col == d_col)
    e_norm = next(n for n, col in edge.stickers.items() if col == c_fb)
    return (corner.pos, c_norm), (edge.pos, e_norm)


def is_slot_solved(cube: Cube3D, slot: str) -> bool:
    return pair_state(cube, slot) == FastSolverEngine.SLOT_TARGETS[slot]


def inverse_move(m: str) -> str:
    if m.endswith("'"):
        return m[:-1]
    if m.endswith("2"):
        return m
    return m + "'"


def closing_trigger(alg: Optional[str]) -> Optional[str]:
    if not alg:
        return None
    t = alg.split()
    if len(t) < 3:
        return None
    a, b, c = t[-3:]
    if a[0] in "RL" and b[0] == "U" and not a.endswith("2") and c == inverse_move(a):
        return f"{a} {b} {c}"
    return None


def classify(rep: PairReport) -> str:
    if rep.rul_alg is None:
        return "bad_eo"
    if rep.rul_moves <= 4:
        return "excellent"
    if rep.rul_moves <= COMFORTABLE_MAX_MOVES:
        return "comfortable"
    return "stuck"


def build_pair_card(cross_solved: Cube3D, rep: PairReport) -> PairCard:
    corner, edge, _, _ = pair_pieces(cross_solved, rep.slot_name)
    reachable = pair_state(cross_solved, rep.slot_name) in ENGINE.f2l_pair_pdbs[rep.slot_name]
    comfortable = rep.rul_alg is not None and rep.rul_moves <= COMFORTABLE_MAX_MOVES

    verified = False
    if rep.rul_alg is not None:
        after = cross_solved.clone().apply(rep.rul_alg)
        verified = after.is_cross_solved() and is_slot_solved(after, rep.slot_name)

    return PairCard(
        slot=rep.slot_name,
        slot_label=SLOT_LABELS[rep.slot_name],
        is_back_slot=rep.is_back_slot,
        edge_good_eo=rep.edge_good_eo,
        rul_reachable=reachable,
        both_in_u=rep.both_in_u,
        rul_alg=rep.rul_alg,
        rul_moves=rep.rul_moves if rep.rul_alg is not None else None,
        c1_score=rep.c1_score,
        summary=rep.summary,
        category=classify(rep),
        comfortable=comfortable,
        back_slot_priority=comfortable and rep.is_back_slot,
        rotation_free_trigger=comfortable,
        trigger=closing_trigger(rep.rul_alg),
        corner_location=location_name(corner.pos),
        edge_location=location_name(edge.pos),
        verified=verified,
    )


def analyze_cross_state(cross_solved: Cube3D) -> List[PairCard]:
    reports = CPlusOneTutor.analyze_c1_state(cross_solved, ENGINE)
    return [build_pair_card(cross_solved, r) for r in reports]


def playback_alg(rotation: str, cross: str, pair_alg: Optional[str], base_rotation: str = CROSS_ON_BOTTOM) -> str:
    return join_algs(base_rotation, rotation, cross, pair_alg or "")


def best_good_moves(pairs: List[PairCard]) -> Optional[int]:
    moves = [p.rul_moves for p in pairs if p.rul_moves is not None]
    return min(moves) if moves else None


def find_insertions(
    rotation: str,
    label: str,
    base: Cube3D,
    cross: str,
    base_pairs: List[PairCard],
    cross_color: str = "white",
    cross_color_label: str = "白底",
    base_rotation: str = CROSS_ON_BOTTOM,
) -> Tuple[List[AufVariant], List[InsertionHighlight]]:
    variants: List[AufVariant] = []
    highlights: List[InsertionHighlight] = []
    tokens = cross.split()
    if not tokens:
        return variants, highlights

    before = {p.slot: p for p in base_pairs}
    before_best = best_good_moves(base_pairs)

    for auf, full_cross, _best in CPlusOneTutor.optimize_last_cross_step(base, cross, ENGINE):
        full_cross = join_algs(*full_cross.split())
        if full_cross == cross or auf not in ("U", "U'", "U2"):
            continue
        solved = base.clone().apply(full_cross)
        pairs = analyze_cross_state(solved)
        first = pairs[0]
        variants.append(AufVariant(
            auf=auf, cross=full_cross, cross_moves=len(full_cross.split()),
            first_pair=first,
            total_score=round(
                CROSS_WEIGHT * CPlusOneTutor.cross_ergonomic_score(full_cross)
                + PAIR_WEIGHT * first.c1_score, 1),
        ))
        if auf not in INSERTION_AUFS:
            continue
        for p in pairs:
            b = before[p.slot]
            if b.rul_moves is None or b.rul_moves < STUCK_MIN_MOVES:
                continue
            if p.rul_moves is None or p.rul_moves > STANDARD_INSERT_MAX_MOVES:
                continue
            full = join_algs(full_cross, p.rul_alg)
            end = base.clone().apply(full)
            highlights.append(InsertionHighlight(
                cross_color=cross_color,
                cross_color_label=cross_color_label,
                base_rotation=base_rotation,
                rotation=rotation,
                orientation_label=label,
                original_cross=cross,
                auf=auf,
                final_move=tokens[-1],
                new_cross=full_cross,
                slot=p.slot,
                slot_label=p.slot_label,
                is_back_slot=p.is_back_slot,
                before_moves=b.rul_moves,
                before_alg=b.rul_alg or "",
                before_corner_location=b.corner_location,
                before_edge_location=b.edge_location,
                after_moves=p.rul_moves,
                after_alg=p.rul_alg or "",
                after_trigger=p.trigger,
                improves_first_pair=before_best is None or p.rul_moves < before_best,
                before_best_moves=before_best,
                full_solution=full,
                playback_alg=playback_alg(rotation, full_cross, p.rul_alg, base_rotation=base_rotation),
                verified=end.is_cross_solved() and is_slot_solved(end, p.slot),
            ))

    variants.sort(key=lambda v: v.total_score, reverse=True)
    return variants, highlights


def highlight_rank_key(h: InsertionHighlight):
    return (h.improves_first_pair, h.is_back_slot, -h.after_moves, h.before_moves - h.after_moves)


def build_route(
    rotation: str,
    label: str,
    base: Cube3D,
    cross: str,
    cross_color: str = "white",
    cross_color_label: str = "白底",
    base_rotation: str = CROSS_ON_BOTTOM,
) -> Route:
    solved = base.clone().apply(cross)
    pairs = analyze_cross_state(solved)
    first = pairs[0]
    pair_alg = first.rul_alg or ""
    end = solved.clone().apply(pair_alg)
    verified = end.is_cross_solved() and (first.rul_alg is None or is_slot_solved(end, first.slot))
    variants, highlights = find_insertions(
        rotation, label, base, cross, pairs,
        cross_color=cross_color, cross_color_label=cross_color_label, base_rotation=base_rotation
    )
    erg = CPlusOneTutor.cross_ergonomic_score(cross)
    return Route(
        cross=cross,
        cross_moves=len(cross.split()),
        cross_ergonomic_score=erg,
        c1_score=first.c1_score,
        total_score=round(CROSS_WEIGHT * erg + PAIR_WEIGHT * first.c1_score, 1),
        first_pair=first,
        pairs=pairs,
        full_solution=join_algs(cross, pair_alg),
        playback_alg=playback_alg(rotation, cross, pair_alg, base_rotation=base_rotation),
        verified=verified,
        auf_variants=variants,
        insertion_highlights=sorted(highlights, key=highlight_rank_key, reverse=True),
    )


def analyze_orientation(scramble: str, rotation: str, cross_color: str = "white") -> OrientationResult:
    base_rotation, cross_color_label, _ = CROSS_COLOR_CONFIG.get(cross_color, ("z2", "白底", "U"))
    base = FastCube().apply(scramble).apply(base_rotation).apply(rotation)
    front_en, front_zh = FACE_COLORS[base.center_color("F")]
    label = f"{front_zh}前 ({rotation or '无预转'})"
    crosses = ENGINE.solve_crosses(base, max_solutions=MAX_CROSS_SOLUTIONS)
    if not crosses:
        raise RuntimeError(f"Engine found no cross solution for color '{cross_color}' rotation '{rotation}'")
    routes = [
        build_route(
            rotation, label, base, c,
            cross_color=cross_color, cross_color_label=cross_color_label, base_rotation=base_rotation
        )
        for c in crosses
    ]
    routes.sort(key=lambda r: r.total_score, reverse=True)
    return OrientationResult(
        rank=0,
        cross_color=cross_color,
        cross_color_label=cross_color_label,
        base_rotation=base_rotation,
        rotation=rotation,
        inspection_alg=join_algs(base_rotation, rotation),
        front_color=front_en,
        label=label,
        optimal_cross_moves=len(crosses[0].split()),
        best_route=routes[0],
        routes=routes,
    )


@lru_cache(maxsize=512)
def analyze_single_color(scramble: str, cross_color: str = "white") -> ColorCrossSummary:
    base_rotation, cross_color_label, _ = CROSS_COLOR_CONFIG.get(cross_color, ("z2", "白底", "U"))
    orientations = [analyze_orientation(scramble, rot, cross_color=cross_color) for rot in ORIENTATIONS]
    orientations.sort(key=lambda o: (-o.best_route.total_score, o.optimal_cross_moves))
    for i, o in enumerate(orientations, 1):
        o.rank = i
    best_o = orientations[0]
    best_r = best_o.best_route
    return ColorCrossSummary(
        rank=1,
        cross_color=cross_color,
        cross_color_label=cross_color_label,
        base_rotation=base_rotation,
        optimal_cross_moves=min(o.optimal_cross_moves for o in orientations),
        best_total_score=best_r.total_score,
        best_c1_score=best_r.c1_score,
        best_rotation=best_o.rotation,
        best_orientation_label=best_o.label,
        best_slot=best_r.first_pair.slot,
        best_slot_moves=best_r.first_pair.rul_moves,
        orientations=orientations,
        best_orientation=best_o,
    )


def resolve_colors(color_mode: str = "white", cross_colors: Optional[List[str]] = None) -> Tuple[str, ...]:
    if cross_colors:
        valid = [c for c in cross_colors if c in CROSS_COLOR_CONFIG]
        if valid:
            return tuple(dict.fromkeys(valid))
    return COLOR_MODE_PRESETS.get(color_mode, ("white",))


@lru_cache(maxsize=256)
def _analyze_cached(scramble: str, color_mode: str, colors_tuple: Tuple[str, ...]) -> AnalyzeResponse:
    from .coach import template_comment

    t0 = time.perf_counter()
    summaries = [copy.deepcopy(analyze_single_color(scramble, c)) for c in colors_tuple]
    summaries.sort(key=lambda s: (-s.best_total_score, s.optimal_cross_moves))
    for i, s in enumerate(summaries, 1):
        s.rank = i

    best_summary = summaries[0]
    orientations = best_summary.orientations
    best_o = best_summary.best_orientation
    best = best_o.best_route

    highlights = sorted(
        (h for s in summaries for o in s.orientations for r in o.routes for h in r.insertion_highlights),
        key=highlight_rank_key, reverse=True,
    )
    pair_alg = best.first_pair.rul_alg or ""
    response = AnalyzeResponse(
        scramble=scramble,
        color_mode=color_mode,
        cross_color=best_summary.cross_color,
        cross_color_label=best_summary.cross_color_label,
        orientations=orientations,
        best_orientation=best_o,
        best_route=best,
        color_summaries=summaries,
        global_best_orientation=best_o,
        playback=Playback(
            setup_alg=scramble,
            alg=best.playback_alg,
            inspection=best_o.inspection_alg,
            cross=best.cross,
            pair=pair_alg,
            pair_slot=best.first_pair.slot if best.first_pair.rul_alg is not None else None,
        ),
        insertion_highlights=highlights,
        coach=CoachComment(text="", source="template", kind="general"),
        elapsed_ms=0.0,
    )
    response.coach = template_comment(response)
    response.elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
    return response


def analyze_scramble(
    scramble: str,
    color_mode: str = "white",
    cross_colors: Optional[List[str]] = None,
) -> AnalyzeResponse:
    colors_tuple = resolve_colors(color_mode, cross_colors)
    return _analyze_cached(scramble, color_mode, colors_tuple)
