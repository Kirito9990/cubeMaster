import random
import re
from typing import List, Optional

MAX_SCRAMBLE_MOVES = 60

_TOKEN_RE = re.compile(r"^([UDLRFB])(2|'|2'|)$")
_PRIME_CHARS = str.maketrans({"′": "'", "’": "'", "‘": "'", "`": "'", "ʼ": "'"})

FACES = ["U", "D", "R", "L", "F", "B"]
SUFFIXES = ["", "'", "2"]
OPPOSITE_FACE = {"U": "D", "D": "U", "R": "L", "L": "R", "F": "B", "B": "F"}


class ScrambleError(ValueError):
    pass


def normalize_scramble(raw: str) -> str:
    if raw is None:
        raise ScrambleError("打乱不能为空 (scramble is empty)")
    text = raw.translate(_PRIME_CHARS).strip()
    if not text:
        raise ScrambleError("打乱不能为空 (scramble is empty)")

    tokens: List[str] = []
    for tok in text.split():
        m = _TOKEN_RE.match(tok)
        if not m:
            raise ScrambleError(
                f"非法转动 '{tok}':仅支持 WCA 3x3 外层转动 U D L R F B 及后缀 ' / 2 "
                f"(invalid move '{tok}')"
            )
        face, suffix = m.groups()
        tokens.append(face + ("2" if suffix == "2'" else suffix))

    if len(tokens) > MAX_SCRAMBLE_MOVES:
        raise ScrambleError(f"打乱过长:最多 {MAX_SCRAMBLE_MOVES} 步 (scramble too long)")
    return " ".join(tokens)


def generate_wca_scramble(length: int = 20, seed: Optional[int] = None) -> str:
    rng = random.Random(seed)
    moves: List[str] = []
    prev_face = ""
    prev2_face = ""
    for _ in range(max(1, min(length, MAX_SCRAMBLE_MOVES))):
        candidates = [
            f for f in FACES
            if f != prev_face and not (prev_face == OPPOSITE_FACE.get(f) and prev2_face == f)
        ]
        face = rng.choice(candidates)
        suffix = rng.choice(SUFFIXES)
        moves.append(face + suffix)
        prev2_face = prev_face
        prev_face = face
    return " ".join(moves)
