from typing import List, Literal, Optional

from pydantic import BaseModel, Field

PairCategory = Literal["excellent", "comfortable", "stuck", "bad_eo"]


class AnalyzeRequest(BaseModel):
    scramble: str = Field(..., description="WCA 3x3 scramble (white top, green front)")


class PairCard(BaseModel):
    slot: str
    slot_label: str
    is_back_slot: bool
    edge_good_eo: bool = Field(description="Engine verdict: <R,U,L> solution found within depth 9")
    rul_reachable: bool = Field(description="Pair state lies in the <R,U,L> reachable set at all")
    both_in_u: bool
    rul_alg: Optional[str]
    rul_moves: Optional[int]
    c1_score: float
    summary: str
    category: PairCategory
    comfortable: bool = Field(description="Good EO and <= 6 moves")
    back_slot_priority: bool = Field(description="Comfortable pair that goes into BL/BR")
    rotation_free_trigger: bool = Field(description="Comfortable <R,U,L> insert, no y rotation / regrip")
    trigger: Optional[str] = Field(description="Closing insert trigger, e.g. \"R U' R'\"")
    corner_location: str
    edge_location: str
    verified: bool = Field(description="Alg re-applied on the engine state solves this slot and keeps the cross")


class AufVariant(BaseModel):
    auf: str
    cross: str
    cross_moves: int
    first_pair: PairCard
    total_score: float


class InsertionHighlight(BaseModel):
    rotation: str
    orientation_label: str
    original_cross: str
    auf: str
    final_move: str
    new_cross: str
    slot: str
    slot_label: str
    is_back_slot: bool
    before_moves: int
    before_alg: str
    before_corner_location: str
    before_edge_location: str
    after_moves: int
    after_alg: str
    after_trigger: Optional[str]
    improves_first_pair: bool
    before_best_moves: Optional[int]
    full_solution: str
    playback_alg: str
    verified: bool


class Route(BaseModel):
    cross: str
    cross_moves: int
    cross_ergonomic_score: float
    c1_score: float
    total_score: float
    first_pair: PairCard
    pairs: List[PairCard]
    full_solution: str
    playback_alg: str
    verified: bool
    auf_variants: List[AufVariant]
    insertion_highlights: List[InsertionHighlight]


class OrientationResult(BaseModel):
    rank: int
    rotation: str
    inspection_alg: str
    front_color: str
    label: str
    optimal_cross_moves: int
    best_route: Route
    routes: List[Route]


class Playback(BaseModel):
    setup_alg: str
    alg: str
    inspection: str
    cross: str
    pair: str
    pair_slot: Optional[str]


class CoachComment(BaseModel):
    text: str
    source: Literal["llm", "template"]
    kind: Literal["insertion", "general"]
    model: Optional[str] = None
    fallback_reason: Optional[str] = None


class AnalyzeResponse(BaseModel):
    scramble: str
    cross_color: str
    orientations: List[OrientationResult]
    best_orientation: OrientationResult
    best_route: Route
    playback: Playback
    insertion_highlights: List[InsertionHighlight]
    coach: CoachComment
    elapsed_ms: float


class CoachRequest(BaseModel):
    scramble: str
