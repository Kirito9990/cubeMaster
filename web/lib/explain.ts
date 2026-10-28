import type { InsertionHighlight, OrientationResult, PairCard, Route } from "./types";

const FACE_NAMES: Record<string, string> = {
  U: "顶层 (U)",
  D: "底层 (D)",
  R: "右层 (R)",
  L: "左层 (L)",
  F: "前层 (F)",
  B: "后层 (B)",
};

const ROTATION_EXPLANATIONS: Record<string, string> = {
  "": "无需整体翻转魔方，直接保持打乱后的白顶绿前姿态",
  z2: "把魔方上下翻转 180°（让白色中心块朝下做底）",
  "x'": "把魔方向自己方向翻滚 90°（让绿色中心块朝下做底）",
  x: "把魔方向远离自己方向翻滚 90°（让蓝色中心块朝下做底）",
  z: "把魔方向右倾斜翻转 90°（让红色中心块朝下做底）",
  "z'": "把魔方向左倾斜翻转 90°（让橙色中心块朝下做底）",
  y: "水平顺时针转魔方 90°（把原本右边的面转到正前方）",
  "y'": "水平逆时针转魔方 90°（把原本左边的面转到正前方）",
  y2: "水平旋转魔方 180°（把原本背面的面转到正前方）",
};

const LOCATION_LABELS: Record<string, string> = {
  UFR: "顶层前右角 (UFR)",
  UFL: "顶层前左角 (UFL)",
  UBR: "顶层后右角 (UBR)",
  UBL: "顶层后左角 (UBL)",
  DFR: "底层前右槽内 (DFR)",
  DFL: "底层前左槽内 (DFL)",
  DBR: "底层后右槽内 (DBR)",
  DBL: "底层后左槽内 (DBL)",
  UF: "顶层前棱 (UF)",
  UB: "顶层后棱 (UB)",
  UR: "顶层右棱 (UR)",
  UL: "顶层左棱 (UL)",
  FR: "前右中层槽内 (FR)",
  FL: "前左中层槽内 (FL)",
  BR: "后右中层槽内 (BR)",
  BL: "后左中层槽内 (BL)",
  DF: "底层前棱 (DF)",
  DB: "底层后棱 (DB)",
  DR: "底层右棱 (DR)",
  DL: "底层左棱 (DL)",
};

const SLOT_FULL_NAMES: Record<string, string> = {
  FR: "前右槽 (FR)",
  FL: "前左槽 (FL)",
  BR: "后右槽 (BR)",
  BL: "后左槽 (BL)",
};

export interface MoveStepExplanation {
  token: string;
  title: string;
  detail: string;
}

export function explainSingleMove(token: string): MoveStepExplanation {
  const clean = token.trim();
  if (ROTATION_EXPLANATIONS[clean]) {
    return {
      token: clean,
      title: `整体转体 ${clean}`,
      detail: ROTATION_EXPLANATIONS[clean],
    };
  }
  const face = clean[0];
  const suffix = clean.slice(1);
  const faceLabel = FACE_NAMES[face] ?? `${face} 层`;
  let dir = "顺时针转 90°";
  if (suffix === "'") dir = "逆时针转 90°";
  if (suffix === "2") dir = "转动 180°（连拨两下）";
  return {
    token: clean,
    title: `${faceLabel}${dir}`,
    detail: `转动${faceLabel}，方向为${dir}`,
  };
}

export function explainAlgTokens(alg: string): MoveStepExplanation[] {
  if (!alg || !alg.trim()) return [];
  return alg.trim().split(/\s+/).map(explainSingleMove);
}

export function humanLocation(loc: string): string {
  return LOCATION_LABELS[loc] ?? loc;
}

export function humanSlotName(slot: string): string {
  return SLOT_FULL_NAMES[slot] ?? slot;
}

export function explainHolding(orientation: OrientationResult): {
  headline: string;
  subline: string;
} {
  const colorLabel = orientation.cross_color_label || "白底";
  const frontZh = orientation.label.split(" ")[0] || "绿前";
  const rotTokens = orientation.inspection_alg.trim().split(/\s+/).filter(Boolean);
  const rotText =
    rotTokens.length === 0
      ? "保持白顶绿前打乱后的原始拿法（黄面已经在底部，绿面朝向自己）"
      : rotTokens.map((t) => ROTATION_EXPLANATIONS[t] || t).join("，然后");

  return {
    headline: `${colorLabel}朝下，${frontZh}朝向自己`,
    subline: rotText,
  };
}

export function explainCrossPlain(route: Route): {
  shortText: string;
  detailText: string;
} {
  if (!route.cross || route.cross_moves === 0) {
    return {
      shortText: "底十字已经天然完成，0 步直接做第一组 F2L",
      detailText: "打乱后底十字四个棱块已经全部归位，无需任何十字步数。",
    };
  }
  const tokens = route.cross.trim().split(/\s+/);
  const hasB = tokens.some((t) => t.startsWith("B"));
  const shortText = `共 ${route.cross_moves} 步完成底十字${hasB ? "（含后层 B 动作，注意手法衔接）" : "，全部为顺手外层动作"}`;
  const detailText = hasB
    ? `这套十字公式（${route.cross}）共 ${route.cross_moves} 步。其中包含后层 B 转动，做的时候可以用无名指或顺势推拨，避免中途换手。做完最后一步「${tokens[tokens.length - 1]}」时，四个底棱全部对齐中心块。`
    : `这套十字公式（${route.cross}）共 ${route.cross_moves} 步，完全避开了别手的盲区动作，手指连贯性很好。在落最后一步「${tokens[tokens.length - 1]}」的同时，眼睛可以提前追踪第一组 F2L 的角块和棱块。`;
  return { shortText, detailText };
}

export function explainPairPlain(pair: PairCard): {
  oneLiner: string;
  startPositionText: string;
  pairingLogicText: string;
  visionAdviceText: string;
} {
  const slotName = humanSlotName(pair.slot);
  const cornerLoc = humanLocation(pair.corner_location);
  const edgeLoc = humanLocation(pair.edge_location);

  if (!pair.rul_alg || pair.rul_moves === null) {
    return {
      oneLiner: `${slotName} 棱块色向不顺（需要整体转魔方 y 或用 F/B 变向），不建议做第一组`,
      startPositionText: `做完十字后，这组的角块在「${cornerLoc}」，棱块在「${edgeLoc}」。`,
      pairingLogicText:
        "由于棱块朝向是反的（Bad EO），如果强行不转魔方，没法只靠左、右、顶三层（R、U、L）把它还原进槽，必须整体转体 y 换个方向或者做 F/B 翻转棱块，在实战第一组会明显拖慢节奏。",
      visionAdviceText: "建议在 15 秒观察期直接跳过这一组，优先选择能直插的其他槽位或换一个起手朝向。",
    };
  }

  const tokens = pair.rul_alg.trim().split(/\s+/);
  const trigger = pair.trigger;
  const setupTokens = trigger ? tokens.slice(0, Math.max(0, tokens.length - 3)) : tokens;
  const setupAlg = setupTokens.join(" ");

  let oneLiner = "";
  if (pair.rul_moves <= 4) {
    oneLiner = `${pair.rul_moves} 步直接入${slotName}，角棱已成型或一步配对，全程不用转魔方`;
  } else if (pair.rul_moves <= 6) {
    oneLiner = `${pair.rul_moves} 步顺手配对入${slotName}，只转左右顶三层，不用整体转魔方`;
  } else {
    oneLiner = `${pair.rul_moves} 步先拆开粘连块再入${slotName}，无需转魔方但步数稍多`;
  }

  const startPositionText = `做完底十字这一刻，这组 F2L 的角块位于「${cornerLoc}」，棱块位于「${edgeLoc}」${
    pair.both_in_u ? "（两个块都在顶层，低头做完十字抬头就能一眼看到，完全不用去底下找块）" : "（其中一个块还在槽位/底层，做十字时要留意它的位置）"
  }。`;

  let pairingLogicText = "";
  if (trigger && setupAlg) {
    pairingLogicText = `公式拆解为两段：先做「${setupAlg}」（${setupTokens.length} 步）把角块和棱块在顶层调整成可直接入槽的配对状态，紧接着用标准入槽动作「${trigger}」（3 步）顺势推进${slotName}。全程只动 R / U / L 层，手不用离开魔方换握。`;
  } else if (trigger && !setupAlg) {
    pairingLogicText = `做完十字后角块与棱块已经天然配好，直接用 3 步标准动作「${trigger}」就能一步入${slotName}！`;
  } else {
    pairingLogicText = `通过「${pair.rul_alg}」（共 ${pair.rul_moves} 步）完成配对并直接归位到${slotName}，全程只用到左右顶层转动，不需要整体转体 y。`;
  }

  const visionAdviceText = pair.is_back_slot
    ? `这组最终落入后方的「${slotName}」。先把后面的槽填好有个巨大好处：前面两个槽位（FR/FL）完全空着不挡视线，你边做这组的时候眼睛看着前面，第 2 组 F2L 的块一目了然，衔接不会卡顿。`
    : `这组落入前方的「${slotName}」。做最后两步入槽时，视线可以提前往顶层后半部分和剩余空槽扫视，提前锁定第 2 组 F2L。`;

  return {
    oneLiner,
    startPositionText,
    pairingLogicText,
    visionAdviceText,
  };
}

export function explainInsertionPlain(h: InsertionHighlight): {
  title: string;
  body: string;
} {
  const prefix = h.original_cross.split(" ").slice(0, -1).join(" ");
  const slotName = humanSlotName(h.slot);
  return {
    title: `在十字最后一步「${h.final_move}」前加一个「${h.auf}」，省去拆块直接省下 ${h.before_moves - h.after_moves} 步`,
    body: `如果按原来的十字「${h.original_cross}」直接收尾，${slotName}的角块（${humanLocation(
      h.before_corner_location,
    )}）和棱块（${humanLocation(h.before_edge_location)}）会卡在一起，需要 ${h.before_moves} 步（${
      h.before_alg
    }）先拆开再重配。但如果你在做十字前段「${prefix || "前序步"}」之后、落最后一步「${
      h.final_move
    }」之前，顺手拨一下顶层「${h.auf}」，就能在完成十字的同时把这两个块错开到舒服的位置，接下来只需要 ${
      h.after_moves
    } 步（${h.after_alg}）就能直接插进${slotName}！`,
  };
}
