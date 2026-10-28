"""Zero-dependency CLI & stdio worker for CubeMaster backend analysis.
Allows Next.js API routes to run 6-color C+1 analysis directly via system python3
even when uvicorn/FastAPI is not running in a separate terminal.
"""
import json
import sys
from typing import Any, Dict

from .analysis import analyze_scramble
from .coach import generate_comment
from .scramble import ScrambleError, generate_wca_scramble, normalize_scramble


def _serialize(obj: Any) -> Dict[str, Any]:
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    if hasattr(obj, "dict"):
        return obj.dict()
    raise TypeError(f"Cannot serialize {type(obj)}")


def handle_request(req: Dict[str, Any]) -> Dict[str, Any]:
    action = req.get("action", "analyze")
    try:
        if action == "scramble":
            length = int(req.get("length", 20))
            return {"ok": True, "status": 200, "data": {"scramble": generate_wca_scramble(length=length)}}

        raw_scramble = req.get("scramble", "")
        color_mode = req.get("color_mode", "white")
        cross_colors = req.get("cross_colors")
        clean = normalize_scramble(raw_scramble)
        analysis = analyze_scramble(clean, color_mode=color_mode, cross_colors=cross_colors)

        if action == "coach":
            comment = generate_comment(analysis)
            return {"ok": True, "status": 200, "data": _serialize(comment)}

        return {"ok": True, "status": 200, "data": _serialize(analysis)}
    except ScrambleError as err:
        return {"ok": False, "status": 422, "detail": str(err)}
    except Exception as exc:
        return {"ok": False, "status": 500, "detail": f"{type(exc).__name__}: {exc}"}


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "--once":
        payload = json.loads(sys.argv[2]) if len(sys.argv) > 2 else json.loads(sys.stdin.read())
        out = handle_request(payload)
        sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
        sys.stdout.flush()
        return

    # Persistent line-delimited JSON-RPC worker mode
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            req_id = req.get("id")
            res = handle_request(req)
            res["id"] = req_id
        except Exception as exc:
            res = {"id": None, "ok": False, "status": 500, "detail": str(exc)}
        sys.stdout.write(json.dumps(res, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
