import json
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

import httpx

from .schemas import AnalyzeResponse, CoachComment, InsertionHighlight

SYSTEM_PROMPT = (
    "你是一名三阶魔方 Sub-8 级别的顶尖选手兼教练，擅长 CFOP 的 C+1（十字 + 第一组 F2L）规划与色向中立决策。"
    "你会收到由求解引擎计算出的结构化数据，所有转动序列、步数和槽位都已验证正确。"
    "请只输出一句自然、口语化、像顶尖选手复盘时说的中文点评（不超过 80 个汉字），"
    "不要分点、不要换行、不要加引号，禁止编造数据里没有的转动或步数，转动记号保持原样（如 R、U'、y2）。"
)

INSERTION_EXAMPLE = (
    "在这把打乱中，如果在最后一步 R 之前加一个 U'，可以把原本卡在前槽的粘连块完美导向 BL 后槽，实现 5 步无转体直插。"
)


@dataclass
class LLMConfig:
    base_url: str
    api_key: str
    model: str
    timeout: float

    @classmethod
    def from_env(cls) -> Optional["LLMConfig"]:
        key = os.getenv("CUBEMASTER_LLM_API_KEY") or os.getenv("OPENAI_API_KEY")
        if not key:
            return None
        base = (
            os.getenv("CUBEMASTER_LLM_BASE_URL")
            or os.getenv("OPENAI_BASE_URL")
            or "https://api.openai.com/v1"
        )
        return cls(
            base_url=base.rstrip("/"),
            api_key=key,
            model=os.getenv("CUBEMASTER_LLM_MODEL", "gpt-4o-mini"),
            timeout=float(os.getenv("CUBEMASTER_LLM_TIMEOUT", "20")),
        )


def slot_side(slot: str) -> str:
    return "后槽" if slot[0] == "B" else "前槽"


def stuck_phrase(corner_loc: str, edge_loc: str) -> str:
    for loc in (edge_loc, corner_loc):
        if "U" in loc:
            continue
        slot = loc.replace("D", "")
        if len(slot) == 2:
            return f"卡在 {slot} {slot_side(slot)}"
    return "压在顶层"


def pick_highlight(analysis: AnalyzeResponse) -> Optional[InsertionHighlight]:
    if not analysis.insertion_highlights:
        return None
    best_rot = analysis.best_orientation.rotation
    best_col = analysis.best_orientation.cross_color
    same = [
        h for h in analysis.insertion_highlights
        if h.rotation == best_rot and h.cross_color == best_col
    ]
    return (same or analysis.insertion_highlights)[0]


def insertion_facts(h: InsertionHighlight) -> Dict[str, Any]:
    return {
        "底色": h.cross_color_label,
        "朝向": h.orientation_label,
        "原十字": h.original_cross,
        "十字最后一步": h.final_move,
        "插入的AUF": h.auf,
        "插入后十字": h.new_cross,
        "原首组": {
            "槽位": h.slot, "步数": h.before_moves, "解法": h.before_alg,
            "角块位置": h.before_corner_location, "棱块位置": h.before_edge_location,
            "状态": "粘连/卡槽，需要拆解",
        },
        "插入后首组": {
            "槽位": h.slot, "是否后槽": h.is_back_slot, "步数": h.after_moves,
            "解法": h.after_alg, "收尾 trigger": h.after_trigger, "无转体": True,
        },
        "是否优于原最佳首组": h.improves_first_pair,
    }


def general_facts(analysis: AnalyzeResponse) -> Dict[str, Any]:
    o, r = analysis.best_orientation, analysis.best_route
    p = r.first_pair
    return {
        "色向模式": analysis.color_mode,
        "推荐底色": analysis.cross_color_label,
        "推荐朝向": o.label,
        "观察转体": o.inspection_alg,
        "十字": r.cross, "十字步数": r.cross_moves,
        "首组": {
            "槽位": p.slot, "是否后槽": p.is_back_slot, "步数": p.rul_moves,
            "解法": p.rul_alg, "Good EO": p.edge_good_eo, "收尾 trigger": p.trigger,
        },
        "C+1 综合分": r.total_score,
        "四向排名": [{"朝向": x.label, "综合分": x.best_route.total_score} for x in analysis.orientations],
        "多底色排名": [
            {"底色": s.cross_color_label, "最优十字步数": s.optimal_cross_moves, "最高综合分": s.best_total_score}
            for s in analysis.color_summaries
        ],
    }


def insertion_template(h: InsertionHighlight, multi_color: bool = False) -> str:
    phrase = stuck_phrase(h.before_corner_location, h.before_edge_location)
    prefix = f"{h.cross_color_label}·{h.orientation_label}" if multi_color else h.orientation_label
    return (
        f"在这把打乱中 ({prefix})，如果在最后一步 {h.final_move} 之前加一个 {h.auf}，"
        f"可以把原本{phrase}、要 {h.before_moves} 步拆解的粘连块完美导向 {h.slot} {slot_side(h.slot)}，"
        f"实现 {h.after_moves} 步无转体直插 ({h.after_alg})。"
    )


def general_template(analysis: AnalyzeResponse) -> str:
    o, r = analysis.best_orientation, analysis.best_route
    p = r.first_pair
    cross = r.cross or "(十字已完成)"
    multi_color = len(analysis.color_summaries) > 1
    color_prefix = f"【色向优选：{analysis.cross_color_label}】" if multi_color else ""
    if p.rul_alg is None:
        return (
            f"{color_prefix}推荐{o.label}起手，十字 {cross} ({r.cross_moves} 步)，"
            f"但四个槽位都是 Bad EO，观察期建议多追一组或接受一次转体。"
        )
    style = "无转体直插" if p.comfortable else "无转体但偏绕的拆解"
    back = "，还顺带把后槽先解决、留足前方视野" if p.is_back_slot else ""
    return (
        f"{color_prefix}推荐{o.label}起手：十字 {cross} ({r.cross_moves} 步) 后直接接 {p.slot} {slot_side(p.slot)}"
        f" {p.rul_moves} 步{style} ({p.rul_alg}){back}，C+1 综合分 {r.total_score}。"
    )


def template_comment(analysis: AnalyzeResponse, fallback_reason: Optional[str] = None) -> CoachComment:
    h = pick_highlight(analysis)
    multi_color = len(analysis.color_summaries) > 1
    if h is not None:
        return CoachComment(
            text=insertion_template(h, multi_color=multi_color),
            source="template",
            kind="insertion",
            fallback_reason=fallback_reason,
        )
    return CoachComment(
        text=general_template(analysis),
        source="template",
        kind="color_neutral" if multi_color else "general",
        fallback_reason=fallback_reason,
    )


def build_messages(analysis: AnalyzeResponse) -> Tuple[str, list, Optional[InsertionHighlight]]:
    h = pick_highlight(analysis)
    if h is not None:
        kind = "insertion"
        user = (
            "下面是引擎检测到的「十字最后一步前插入 AUF」优化案例：原本 7 步以上的粘连首组，"
            "在十字最后一步前加一个 U/U' 后变成 5 步标准直插。\n"
            f"结构化数据：\n{json.dumps(insertion_facts(h), ensure_ascii=False, indent=2)}\n\n"
            f"参考风格（不要照抄数据）：{INSERTION_EXAMPLE}\n"
            "请用一句话点评这个优化，必须提到插入的 AUF、十字最后一步和目标槽位。"
        )
    else:
        kind = "color_neutral" if len(analysis.color_summaries) > 1 else "general"
        user = (
            "下面是这把打乱的 C+1 复盘结论（没有检测到插入 AUF 的优化案例）。\n"
            f"结构化数据：\n{json.dumps(general_facts(analysis), ensure_ascii=False, indent=2)}\n\n"
            "请用一句话点评推荐起手底色、朝向和首组，必须提到首组槽位。"
        )
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}]
    return kind, messages, h


def clean_llm_text(text: str) -> str:
    text = text.strip().splitlines()[0].strip() if text.strip() else ""
    text = text.strip("\"'「」")
    return text.replace('"', "").replace("'", "")


def validate_llm_text(text: str, analysis: AnalyzeResponse, h: Optional[InsertionHighlight]) -> bool:
    if not text or len(text) > 200:
        return False
    if h is not None:
        return h.auf in text and h.final_move in text and h.slot in text
    p = analysis.best_route.first_pair
    return p.slot in text


def generate_comment(
    analysis: AnalyzeResponse, client: Optional[httpx.Client] = None
) -> CoachComment:
    cfg = LLMConfig.from_env()
    if cfg is None:
        return template_comment(analysis, fallback_reason="no_api_key")

    kind, messages, h = build_messages(analysis)
    own = client is None
    if own:
        client = httpx.Client(timeout=cfg.timeout)

    try:
        try:
            resp = client.post(
                f"{cfg.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {cfg.api_key}"},
                json={"model": cfg.model, "messages": messages, "temperature": 0.4, "max_tokens": 200},
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
        finally:
            if own:
                client.close()
    except httpx.HTTPStatusError:
        return template_comment(analysis, fallback_reason="llm_http_error")
    except Exception as exc:
        return template_comment(analysis, fallback_reason=f"llm_error: {type(exc).__name__}")

    text = clean_llm_text(content or "")
    if not validate_llm_text(text, analysis, h):
        return template_comment(analysis, fallback_reason="llm_output_failed_validation")
    return CoachComment(text=text, source="llm", kind=kind, model=cfg.model)
