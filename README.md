# CubeMaster · C+1 智能复盘

A Sub-15 speedcubing review tool for **C+1** (Cross + first F2L pair). Paste a WCA scramble and it will:

- solve the optimal white cross for all four pre-rotations (none / `y` / `y'` / `y2`, white on bottom),
- score every slot's first pair with the existing `CPlusOneTutor` (`<R,U,L>` rotation-free, Good EO, ≤ 6 moves = comfortable),
- rank the four orientations and pick the best C+1 route,
- detect **"insert U/U' before the last cross move"** cases that turn a 7+ move stuck pair into a ≤ 5 move standard insert,
- play the recommended Cross + first pair as one continuous solution on a 3D cube (cubing.js),
- add a one-sentence Chinese coach review (OpenAI-compatible LLM, with an offline template fallback).

The validated core engine `c_plus_1_engine.py` is reused as-is (not modified).

## Layout

```
cubeMaster/
├── c_plus_1_engine.py        # original engine (unchanged): Cube3D, FastSolverEngine, CPlusOneTutor
├── backend/                  # FastAPI service
│   ├── app.py                # routes: /api/health, /api/analyze, /api/coach
│   ├── analysis.py           # 4 orientations × optimal crosses × CPlusOneTutor, AUF-insertion detection
│   ├── engine_adapter.py     # CachedSolverEngine (memoized pair search) + FastCube (fast clone)
│   ├── coach.py              # LLM prompt/validation + deterministic Chinese templates
│   ├── scramble.py           # WCA scramble validation/normalisation
│   └── schemas.py            # pydantic response models
├── tests/                    # pytest: API + engine re-verification
├── web/                      # Next.js 16 + Tailwind 4 + cubing.js frontend
│   ├── app/                  # page.tsx / layout.tsx / globals.css
│   ├── components/           # ReviewApp, CubePlayer (twisty-player), tutor panel cards
│   ├── lib/                  # API client, types, playback segments
│   └── scripts/verify-playback.mjs   # cross-checks engine answers with cubing.js' own cube model
├── requirements.txt
└── .env.example
```

## Run on Windows (PowerShell)

Prerequisites: Python 3.11+ and Node.js 20+.

### 1. Backend (FastAPI, port 8000)

```powershell
cd C:\Users\cuber\Desktop\cubeMaster
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```

Check it: <http://127.0.0.1:8000/api/health> and the interactive docs at <http://127.0.0.1:8000/docs>.

### 2. Frontend (Next.js, port 3000)

In a second terminal:

```powershell
cd C:\Users\cuber\Desktop\cubeMaster\web
npm install
npm run dev
```

Open <http://localhost:3000>. The Next dev server proxies `/api/*` to the backend
(override the target with `$env:CUBEMASTER_BACKEND_URL="http://host:port"` before `npm run dev`).

### 3. Tests

```powershell
cd C:\Users\cuber\Desktop\cubeMaster
.\.venv\Scripts\python.exe -m pytest

# Optional, with the backend running: re-check every returned cross/pair with cubing.js
cd web
npm run verify:playback -- 25     # 3 fixed + 25 random scrambles
```

## AI coach (LLM) configuration

Without an API key the coach uses a deterministic Chinese template, so the app works fully offline.
To use an LLM, copy `.env.example` to `.env`, fill in the values and start the backend with `--env-file`:

```powershell
Copy-Item .env.example .env   # then edit .env
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --port 8000 --env-file .env
```

| Variable | Default | Notes |
| --- | --- | --- |
| `CUBEMASTER_LLM_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible `/chat/completions` endpoint (DeepSeek, DashScope/Qwen, Ollama, LM Studio, …). Falls back to `OPENAI_BASE_URL`. |
| `CUBEMASTER_LLM_API_KEY` | – | Falls back to `OPENAI_API_KEY`. Empty = template coach. |
| `CUBEMASTER_LLM_MODEL` | `gpt-4o-mini` | |
| `CUBEMASTER_LLM_TIMEOUT` | `20` | seconds |
| `CUBEMASTER_WARM_CACHE` | `0` | `1` = pre-solve all `<R,U,L>` pair states in a background thread (~30 s CPU) |

The prompt only contains engine-verified structured data. The reply must mention the inserted AUF, the final cross move and the
target slot (or the first-pair slot for general reviews); otherwise the backend falls back to the template and reports
`fallback_reason`.

## API

`POST /api/analyze` `{"scramble": "D L' F2 R' ..."}` returns (abridged):

- `orientations[]`: ranked by C+1 total score. Each has `rotation`, `inspection_alg` (e.g. `z2 y2`), `front_color`, `label`,
  `optimal_cross_moves`, `best_route`, `routes[]` (all optimal crosses the engine returned, up to 6).
- `route`: `cross`, `cross_ergonomic_score`, `c1_score`, `total_score`, `first_pair`, `pairs[]` (4 slot cards),
  `auf_variants[]` (U / U' / U2 inserted before the final cross move), `insertion_highlights[]`, `playback_alg`, `verified`.
- pair card: `slot`, `rul_alg`, `rul_moves`, `category` (`excellent` ≤ 4 · `comfortable` 5–6 · `stuck` ≥ 7 · `bad_eo`),
  `comfortable`, `back_slot_priority` (comfortable BL/BR), `rotation_free_trigger`, `trigger` (closing insert such as `R U' R'`),
  piece locations, `verified`.
- `insertion_highlights[]`: `original_cross`, `auf`, `final_move`, `new_cross`, `slot`, `before_moves`/`before_alg`,
  `after_moves`/`after_alg`, `improves_first_pair`, `playback_alg`, `verified`.
- `best_orientation`, `best_route`, `playback` (`setup_alg` + continuous `alg` for twisty-player), `coach` (template), `elapsed_ms`.

`POST /api/coach` `{"scramble": "..."}` returns `{text, source: "llm"|"template", kind: "insertion"|"general", model, fallback_reason}`.

Invalid scrambles return `422`. Only outer face turns `U D L R F B` with `'`/`2` are accepted (the engine's move parser
would silently misread `Rw`, slices, rotations or `2'`; `2'` is normalised to `2`).

## Definitions used

- **Orientation**: scrambles are applied in WCA orientation (white top, green front), then `z2` puts white on the bottom
  and `y`/`y'`/`y2` choose the front colour (`y` → orange front, `y'` → red front, `y2` → blue front).
- **Total C+1 score**: `0.4 × cross_ergonomic_score + 0.6 × first-pair c1_score`, the same weighting as the engine's demo.
- **AUF insertion case**: for each optimal cross, `CPlusOneTutor.optimize_last_cross_step` inserts `U`/`U'` before the
  final cross move (keeping the cross solved). A highlight is raised when a slot that needed **≥ 7** `<R,U,L>` moves
  becomes a **≤ 5** move insert. Thresholds live in `backend/analysis.py`.
