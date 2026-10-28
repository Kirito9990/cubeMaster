import re
from typing import List

MAX_SCRAMBLE_MOVES = 60

_TOKEN_RE = re.compile(r"^([UDLRFB])(2|'|2'|)$")
_PRIME_CHARS = str.maketrans({"’": "'", "‘": "'", "′": "'", "`": "'", "＇": "'"})


class ScrambleError(ValueError):
    pass


def normalize_scramble(raw: str) -> str:
    """Validate a WCA 3x3 scramble and return it in canonical form.

    The engine's ``Cube3D.move_single`` only understands outer face turns with
    an optional ``'`` or ``2`` suffix (``Rw``/``M``/``2'`` would be silently
    misread), so anything else is rejected here.
    """
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
                f"非法转动 '{tok}'：仅支持 WCA 3x3 外层转动 U D L R F B 及后缀 ' / 2 "
                f"(invalid move '{tok}')"
            )
        face, suffix = m.groups()
        tokens.append(face + ("2" if suffix == "2'" else suffix))

    if len(tokens) > MAX_SCRAMBLE_MOVES:
        raise ScrambleError(f"打乱过长：最多 {MAX_SCRAMBLE_MOVES} 步 (scramble too long)")
    return " ".join(tokens)
