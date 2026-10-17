// Independent check of the Python engine with cubing.js' own 3x3x3 model.
// Usage (backend running on :8000):  npm run verify:playback -- [randomCount]
import { Alg } from "cubing/alg";
import { cube3x3x3 } from "cubing/puzzles";

const API = process.env.CUBEMASTER_BACKEND_URL ?? "http://127.0.0.1:8000";
const RANDOM_COUNT = Number(process.argv[2] ?? 25);
const FIXED = [
  "D L' F2 R' B2 L' U2 F2 R B2 R2 D2 B2 F' L' R' U' B L B2 R2",
  "F2 U2 D R D' B F' U' F D2 F2 U' R B' R' L' F' U' R L F",
  "F' L R2 U' R' U2 B' F2 U L' R' B' U D B' F2 R B2 F2 U' D",
];

// cubing.js orbit order: EDGES UF UR UB UL DF DR DB DL FR FL BR BL, CORNERS UFR URB UBL ULF DRF DFL DLB DBR.
// Slot positions in the solving frame (cross on D after the inspection rotation):
const SLOT_EDGE = { FR: 8, FL: 9, BR: 10, BL: 11 };
const SLOT_CORNER = { FR: 4, FL: 5, BL: 6, BR: 7 };

const kpuzzle = await cube3x3x3.kpuzzle();
const solved = kpuzzle.defaultPattern();

function randomScramble(n = 21) {
  const faces = "UDLRFB", axis = { U: 0, D: 0, L: 1, R: 1, F: 2, B: 2 };
  const out = [];
  let last = null, prev = null;
  while (out.length < n) {
    const f = faces[Math.floor(Math.random() * 6)];
    if (f === last || (prev && axis[f] === axis[last] && axis[last] === axis[prev])) continue;
    prev = last; last = f;
    out.push(f + ["", "'", "2"][Math.floor(Math.random() * 3)]);
  }
  return out.join(" ");
}

const isHome = (pattern, orbit, pos) =>
  pattern.patternData[orbit].pieces[pos] === pos && pattern.patternData[orbit].orientation[pos] === 0;

// Where a solving-frame position ends up after undoing the inspection rotation.
function homePosition(inspection, orbit, pos) {
  const p = solved.applyAlg(new Alg(inspection).invert());
  return p.patternData[orbit].pieces.indexOf(pos);
}

function check(scramble, inspection, solution, slot) {
  const end = solved.applyAlg(scramble).applyAlg(inspection).applyAlg(solution).applyAlg(new Alg(inspection).invert());
  const crossOk = [0, 1, 2, 3].every((i) => isHome(end, "EDGES", i)); // white cross is U in WCA orientation
  if (!slot) return crossOk;
  const e = homePosition(inspection, "EDGES", SLOT_EDGE[slot]);
  const c = homePosition(inspection, "CORNERS", SLOT_CORNER[slot]);
  return crossOk && isHome(end, "EDGES", e) && isHome(end, "CORNERS", c);
}

// The checker must reject unsolved states, otherwise a pass means nothing.
if (check(FIXED[0], "z2 y2", "", null) || check(FIXED[0], "z2 y2", "D' R' D2 B' F' R", "BL")) {
  throw new Error("verifier sanity check failed: accepted an unsolved cross/pair");
}
if (!check(FIXED[0], "z2 y2", "D' R' D2 B' F' R L2 U L U' L2", "BL")) {
  throw new Error("verifier sanity check failed: rejected the known demo solution");
}

let checks = 0;
const failures = [];
const scrambles = [...FIXED, ...Array.from({ length: RANDOM_COUNT }, () => randomScramble())];
for (const scramble of scrambles) {
  const res = await fetch(`${API}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scramble }),
  });
  if (!res.ok) throw new Error(`${res.status} for ${scramble}`);
  const data = await res.json();
  const record = (ok, what) => { checks++; if (!ok) failures.push(`${scramble} :: ${what}`); };

  const pb = data.playback;
  const playbackSolution = [pb.cross, pb.pair].filter(Boolean).join(" ");
  record(pb.alg === [pb.inspection, playbackSolution].filter(Boolean).join(" "), "playback alg composition");
  record(check(scramble, pb.inspection, playbackSolution, pb.pair_slot), `playback ${pb.alg}`);

  for (const o of data.orientations) {
    for (const r of o.routes) {
      record(check(scramble, o.inspection_alg, r.cross, null), `cross ${o.inspection_alg} ${r.cross}`);
      for (const p of r.pairs) {
        if (p.rul_alg === null) continue;
        record(check(scramble, o.inspection_alg, `${r.cross} ${p.rul_alg}`, p.slot), `${o.inspection_alg} ${r.cross} | ${p.slot} ${p.rul_alg}`);
      }
    }
  }
  for (const h of data.insertion_highlights) {
    const insp = ["z2", h.rotation].filter(Boolean).join(" ");
    record(check(scramble, insp, h.full_solution, h.slot), `highlight ${insp} ${h.full_solution} -> ${h.slot}`);
  }
}

console.log(`cubing.js verified ${checks} cross/pair solutions across ${scrambles.length} scrambles; failures: ${failures.length}`);
if (failures.length) {
  console.log(failures.slice(0, 20).join("\n"));
  process.exit(1);
}
