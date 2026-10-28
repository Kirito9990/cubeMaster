export type PairCategory = "excellent" | "comfortable" | "stuck" | "bad_eo";
export type ColorMode = "white" | "dual" | "full" | "custom";
export type CrossColorName = "white" | "yellow" | "green" | "blue" | "red" | "orange";
export type SlotName = "FR" | "FL" | "BR" | "BL";

export interface PairCard {
  slot: SlotName;
  slot_label: string;
  is_back_slot: boolean;
  edge_good_eo: boolean;
  rul_reachable: boolean;
  both_in_u: boolean;
  rul_alg: string | null;
  rul_moves: number | null;
  c1_score: number;
  summary: string;
  category: PairCategory;
  comfortable: boolean;
  back_slot_priority: boolean;
  rotation_free_trigger: boolean;
  trigger: string | null;
  corner_location: string;
  edge_location: string;
  verified: boolean;
}

export interface AufVariant {
  auf: string;
  cross: string;
  cross_moves: number;
  first_pair: PairCard;
  total_score: number;
}

export interface InsertionHighlight {
  cross_color: CrossColorName;
  cross_color_label: string;
  base_rotation: string;
  rotation: string;
  orientation_label: string;
  original_cross: string;
  auf: string;
  final_move: string;
  new_cross: string;
  slot: SlotName;
  slot_label: string;
  is_back_slot: boolean;
  before_moves: number;
  before_alg: string;
  before_corner_location: string;
  before_edge_location: string;
  after_moves: number;
  after_alg: string;
  after_trigger: string | null;
  improves_first_pair: boolean;
  before_best_moves: number | null;
  full_solution: string;
  playback_alg: string;
  verified: boolean;
}

export interface Route {
  cross: string;
  cross_moves: number;
  cross_ergonomic_score: number;
  c1_score: number;
  total_score: number;
  first_pair: PairCard;
  pairs: PairCard[];
  full_solution: string;
  playback_alg: string;
  verified: boolean;
  auf_variants: AufVariant[];
  insertion_highlights: InsertionHighlight[];
}

export interface OrientationResult {
  rank: number;
  cross_color: CrossColorName;
  cross_color_label: string;
  base_rotation: string;
  rotation: string;
  inspection_alg: string;
  front_color: string;
  label: string;
  optimal_cross_moves: number;
  best_route: Route;
  routes: Route[];
}

export interface ColorCrossSummary {
  rank: number;
  cross_color: CrossColorName;
  cross_color_label: string;
  base_rotation: string;
  optimal_cross_moves: number;
  best_total_score: number;
  best_c1_score: number;
  best_rotation: string;
  best_orientation_label: string;
  best_slot: SlotName;
  best_slot_moves: number | null;
  orientations: OrientationResult[];
  best_orientation: OrientationResult;
}

export interface CoachComment {
  text: string;
  source: "llm" | "template";
  kind: "insertion" | "general" | "color_neutral";
  model: string | null;
  fallback_reason: string | null;
}

export interface AnalyzeResponse {
  scramble: string;
  color_mode: ColorMode;
  cross_color: CrossColorName;
  cross_color_label: string;
  orientations: OrientationResult[];
  best_orientation: OrientationResult;
  best_route: Route;
  color_summaries: ColorCrossSummary[];
  global_best_orientation: OrientationResult | null;
  playback: {
    setup_alg: string;
    alg: string;
    inspection: string;
    cross: string;
    pair: string;
    pair_slot: string | null;
  };
  insertion_highlights: InsertionHighlight[];
  coach: CoachComment;
  elapsed_ms: number;
}

export interface PlaybackSegment {
  label: string;
  alg: string;
  tone: "rotation" | "cross" | "auf" | "pair";
}

export interface PlaybackSelection {
  title: string;
  setupAlg: string;
  segments: PlaybackSegment[];
}

export type PenaltyType = "OK" | "+2" | "DNF";
export type TrainingDrillMode = "c1" | "full";

export interface SolveRecord {
  id: string;
  timestamp: number;
  scramble: string;
  timeMs: number;
  inspectionSec: number;
  penalty: PenaltyType;
  drillMode: TrainingDrillMode;
  blindMaskUsed: boolean;
  chosenColor: CrossColorName;
  chosenSlot: SlotName;
  optimalColor: CrossColorName;
  optimalSlot: SlotName;
  optimalScore: number;
  chosenScore: number;
}
