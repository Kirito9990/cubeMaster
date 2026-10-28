import os
import threading
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .analysis import ENGINE, analyze_scramble
from .coach import LLMConfig, generate_comment
from .schemas import AnalyzeRequest, AnalyzeResponse, CoachComment, CoachRequest
from .scramble import ScrambleError, generate_wca_scramble, normalize_scramble


@asynccontextmanager
async def lifespan(_app: FastAPI):
    stop = threading.Event()
    if os.getenv("CUBEMASTER_WARM_CACHE", "0") == "1":
        threading.Thread(target=ENGINE.warm_pair_cache, kwargs={"stop": stop}, daemon=True).start()
    yield
    stop.set()


app = FastAPI(title="CubeMaster C+1 Review & Trainer API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "CUBEMASTER_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _analyze(
    raw_scramble: str,
    color_mode: str = "white",
    cross_colors: Optional[List[str]] = None,
) -> AnalyzeResponse:
    try:
        clean = normalize_scramble(raw_scramble)
    except ScrambleError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err
    return analyze_scramble(clean, color_mode=color_mode, cross_colors=cross_colors)


@app.get("/api/health")
def health():
    cfg = LLMConfig.from_env()
    return {
        "status": "ok",
        "llm": {"configured": cfg is not None, "model": cfg.model if cfg else None},
        "pair_cache_entries": ENGINE.cache_size(),
    }


@app.get("/api/scramble")
def get_random_scramble(length: int = 20):
    return {"scramble": generate_wca_scramble(length=length)}


@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    return _analyze(req.scramble, color_mode=req.color_mode, cross_colors=req.cross_colors)


@app.post("/api/coach", response_model=CoachComment)
def coach(req: CoachRequest) -> CoachComment:
    return generate_comment(_analyze(req.scramble, color_mode=req.color_mode, cross_colors=req.cross_colors))
