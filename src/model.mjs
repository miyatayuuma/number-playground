import { gcd } from "./math.mjs";


function createPackState(stage, ids) {
  const nodes = Object.fromEntries(
    ids.map((rawId, order) => [
      `d${rawId}`,
      {
        id: `d${rawId}`,
        level: 0,
        ids: [rawId],
        children: [],
        order,
        macro: false,
        base: 1,
      },
    ]),
  );
  return {
    base: stage.startRadix ?? stage.radices[0],
    phase: "pack",
    settled: true,
    numberMassRawIds: [...ids],
    discoveredLevels: [0],
    active: [],
    nodes,
    nextMacroId: 0,
    nextOrder: ids.length,
    target: createPackTarget(stage),
  };
}

function canonicalDigitsForQuantity(quantity, radix) {
  if (
    !Number.isInteger(quantity) ||
    quantity < 0 ||
    !Number.isInteger(radix) ||
    radix < 2
  )
    throw new RangeError(
      "PACK canonical digits require a non-negative quantity and valid radix",
    );
  if (quantity === 0) return [0];
  const lowToHigh = [];
  while (quantity > 0) {
    lowToHigh.push(quantity % radix);
    quantity = Math.floor(quantity / radix);
  }
  return lowToHigh.reverse();
}

export function packCanonicalDigits(quantity, radix) {
  return canonicalDigitsForQuantity(quantity, radix);
}

function createPackTarget(stage) {
  const quantity = stage.quantity || stage.ammo.reduce((sum, n) => sum + n, 0),
    radix = stage.targetRadix;
  if (!stage.radices.includes(radix))
    throw new RangeError("PACK target radix must be selectable");
  return { radix, digits: canonicalDigitsForQuantity(quantity, radix), activated: false };
}

function requirePack(run) {
  if (run?.stage?.area !== "pack" || !run.pack)
    throw new RangeError("PACK run required");
  return run.pack;
}

export function activePackItems(run) {
  const pack = requirePack(run);
  return pack.active
    .map((id) => pack.nodes[id])
    .sort((a, b) => a.level - b.level || a.order - b.order);
}

export function packUnitSize(base, level) {
  if (!Number.isInteger(base) || base < 2 || !Number.isInteger(level) || level < 0)
    throw new RangeError("PACK unit size requires a radix and non-negative level");
  return base ** level;
}

export function packLevelItems(run, level) {
  if (!Number.isInteger(level) || level < 0) return [];
  return activePackItems(run).filter((item) => item.level === level);
}

function packNodeRawIds(pack, itemId, visiting = new Set()) {
  if (visiting.has(itemId)) return null;
  const item = pack.nodes[itemId];
  if (!item) return null;
  visiting.add(itemId);
  if (!item.macro) {
    visiting.delete(itemId);
    return item.level === 0 && item.ids.length === 1 ? [...item.ids] : null;
  }
  const children = [];
  for (const childId of item.children) {
    const child = pack.nodes[childId],
      ids = packNodeRawIds(pack, childId, visiting);
    if (
      !ids ||
      child.level !== item.level - 1 ||
      (child.macro && child.base !== item.base)
    ) {
      visiting.delete(itemId);
      return null;
    }
    children.push(...ids);
  }
  visiting.delete(itemId);
  if (
    item.children.length !== item.base ||
    children.length !== item.ids.length ||
    children.some((id, index) => id !== item.ids[index])
  )
    return null;
  return children;
}

function packStateSnapshot(pack) {
  const active = [...pack.active],
    discoveredLevels = [...pack.discoveredLevels],
    counts = new Map();
  for (const id of active) {
    const item = pack.nodes[id];
    counts.set(item.level, (counts.get(item.level) || 0) + 1);
  }
  const max = Math.max(0, ...discoveredLevels);
  return {
    active,
    numberMassRawIds: [...pack.numberMassRawIds],
    discoveredLevels,
    settled: pack.settled,
    lowToHighDigits: Array.from({ length: max + 1 }, (_, level) =>
      counts.get(level) || 0,
    ),
  };
}

export function isCanonicalPack(run) {
  if (run?.stage?.area !== "pack" || !run.pack) return false;
  const pack = run.pack;
  if (
    !Array.isArray(pack.active) ||
    !Array.isArray(pack.numberMassRawIds) ||
    !Array.isArray(pack.discoveredLevels) ||
    pack.active.some((id) => !pack.nodes[id])
  )
    return false;
  const active = activePackItems(run),
    levels = [...pack.discoveredLevels].sort((a, b) => a - b),
    expectedLevels = Array.from({ length: levels.length }, (_, index) => index);
  if (
    levels.some((level, index) => level !== expectedLevels[index]) ||
    levels[0] !== 0
  )
    return false;
  for (const item of active) {
    if (
      pack.nodes[item.id] !== item ||
      !levels.includes(item.level) ||
      !packNodeRawIds(pack, item.id)
    )
      return false;
  }
  const allIds = [
      ...pack.numberMassRawIds,
      ...active.flatMap((item) => item.ids),
    ],
    expected = run.dots.map((dot) => dot.id),
    counts = new Map();
  for (const item of active)
    counts.set(item.level, (counts.get(item.level) || 0) + 1);
  return (
    allIds.length === expected.length &&
    new Set(allIds).size === allIds.length &&
    allIds.every((id) => expected.includes(id)) &&
    [...counts.values()].every((count) => count < pack.base)
  );
}

export function packDigits(run) {
  const pack = requirePack(run),
    counts = new Map();
  for (const item of activePackItems(run))
    counts.set(item.level, (counts.get(item.level) || 0) + 1);
  const max = Math.max(0, ...pack.discoveredLevels);
  return Array.from({ length: max + 1 }, (_, level) =>
    counts.get(level) || 0,
  ).reverse();
}

export function matchPackTarget(run) {
  if (
    run?.stage?.area !== "pack" ||
    run.status !== "play" ||
    run.pack.phase !== "pack" ||
    run.pack.numberMassRawIds.length !== 0 ||
    run.pack.settled !== true ||
    !isCanonicalPack(run)
  )
    return { ok: false, reason: "not-settled" };

  const digits = packDigits(run),
    target = run.pack.target;
  if (target.activated || !sameDigits(target.digits, digits))
    return { ok: false, reason: "no-match" };
  target.activated = true;
  return { ok: true, targetRadix: target.radix };
}

function sameDigits(a, b) {
  return a.length === b.length && a.every((digit, index) => digit === b[index]);
}

export function settlePackTransition(run) {
  if (run?.stage?.area !== "pack" || !run.pack || !isCanonicalPack(run))
    return false;
  run.pack.settled = true;
  return true;
}

export function beginPackTransition(run) {
  if (run?.stage?.area !== "pack" || !run.pack || !isCanonicalPack(run))
    return false;
  run.pack.settled = false;
  return true;
}

export function packTargetActivated(run) {
  return (
    run?.stage?.area === "pack" &&
    run.pack.target?.activated === true
  );
}

export function buildPackAttackPlan(run) {
  if (
    run?.status !== "play" ||
    run.pack?.phase !== "pack" ||
    run.pack.numberMassRawIds.length !== 0 ||
    run.pack.settled !== true ||
    !packTargetActivated(run) ||
    !isCanonicalPack(run)
  )
    return { ok: false, reason: "target-not-activated-or-unsettled" };
  const payloads = activePackItems(run)
      .sort((a, b) => b.level - a.level || a.order - b.order)
      .map((item) => ({
        itemId: item.id,
        level: item.level,
        rawIds: [...item.ids],
        weight: item.ids.length,
      })),
    rawIds = payloads.flatMap((payload) => payload.rawIds);
  if (rawIds.length !== run.dots.length || new Set(rawIds).size !== rawIds.length)
    return { ok: false, reason: "identity-accounting-failed" };
  return { ok: true, rawIds, payloads };
}

export function beginPackAttack(run) {
  const plan = buildPackAttackPlan(run);
  if (!plan.ok) return plan;
  run.pack.phase = "attack";
  run.pack.attack = {
    payloads: plan.payloads.map((payload) => ({ ...payload, rawIds: [...payload.rawIds] })),
    impactedItemIds: [],
    resolvedRawIds: [],
  };
  run.status = "attack";
  return plan;
}

export function resolvePackAttackPayload(run, itemId) {
  const pack = run?.pack,
    attack = pack?.attack,
    payload = attack?.payloads.find((candidate) => candidate.itemId === itemId);
  if (
    run?.status !== "attack" || pack.phase !== "attack" || !payload ||
    attack.impactedItemIds.includes(itemId) ||
    payload.rawIds.some((id) => attack.resolvedRawIds.includes(id))
  ) return { ok: false };
  attack.impactedItemIds.push(itemId);
  attack.resolvedRawIds.push(...payload.rawIds);
  const complete =
    attack.resolvedRawIds.length === run.dots.length &&
    new Set(attack.resolvedRawIds).size === run.dots.length &&
    run.dots.every((dot) => attack.resolvedRawIds.includes(dot.id));
  if (complete) {
    pack.phase = "break";
    run.status = "break";
  }
  return { ok: true, complete, resolvedCount: attack.resolvedRawIds.length };
}

export function completePackBreak(run) {
  const attack = run?.pack?.attack;
  if (
    run?.stage?.area !== "pack" || run.status !== "break" ||
    run.pack.phase !== "break" || !attack ||
    attack.resolvedRawIds.length !== run.dots.length ||
    new Set(attack.resolvedRawIds).size !== run.dots.length ||
    !run.dots.every((dot) => attack.resolvedRawIds.includes(dot.id))
  ) return false;
  run.pack.phase = "next";
  run.status = "won";
  return true;
}

export function pourPackMass(run, targetLevel = 0, maxRawCount = Infinity) {
  const pack = requirePack(run),
    unitSize = packUnitSize(pack.base, targetLevel);
  if (
    run.status !== "play" ||
    pack.phase !== "pack" ||
    !pack.discoveredLevels.includes(targetLevel)
  )
    return { ok: false, reason: "level-not-discovered" };
  const limit =
    maxRawCount === Infinity
      ? Infinity
      : Number.isInteger(maxRawCount) && maxRawCount > 0
        ? maxRawCount
        : 0,
    availableRawCount = Math.min(pack.numberMassRawIds.length, limit),
    currentDigit = pack.active.filter(
      (id) => pack.nodes[id].level === targetLevel,
    ).length,
    neededUnits = pack.base - currentDigit,
    availableUnits = Math.floor(availableRawCount / unitSize),
    feedUnits = Math.min(neededUnits, availableUnits),
    consumedCount = feedUnits * unitSize;
  if (!consumedCount) return { ok: false, reason: "insufficient-mass" };

  const initialState = packStateSnapshot(pack),
    consumedRawIds = pack.numberMassRawIds.slice(0, consumedCount),
    remaining = pack.numberMassRawIds.slice(consumedCount),
    steps = [];
  const snapshot = (type, detail) =>
    steps.push({ type, ...detail, state: packStateSnapshot(pack) });
  const carryReadyLevel = (level) => {
    let nextLevel = level;
    while (pack.active.filter((id) => pack.nodes[id].level === nextLevel).length >= pack.base) {
      const children = pack.active
          .map((id) => pack.nodes[id])
          .filter((item) => item.level === nextLevel)
          .sort((a, b) => a.order - b.order)
          .slice(0, pack.base),
        childSet = new Set(children.map((item) => item.id)),
        itemId = `m${pack.nextMacroId++}`,
        ids = children.flatMap((item) => item.ids),
        item = {
          id: itemId,
          level: nextLevel + 1,
          ids,
          children: children.map((child) => child.id),
          order: pack.nextOrder++,
          macro: true,
          base: pack.base,
        };
      pack.nodes[itemId] = item;
      pack.active = pack.active.filter((id) => !childSet.has(id));
      pack.active.push(itemId);
      if (!pack.discoveredLevels.includes(item.level)) {
        pack.discoveredLevels.push(item.level);
        pack.discoveredLevels.sort((a, b) => a - b);
      }
      snapshot("carry", {
        fromLevel: nextLevel,
        toLevel: nextLevel + 1,
        itemId,
        childItemIds: item.children,
        rawIds: [...ids],
      });
      nextLevel++;
    }
  };

  const buildUnit = (level, rawIds) => {
    if (level === 0) return `d${rawIds[0]}`;
    const childRawCount = packUnitSize(pack.base, level - 1),
      children = Array.from({ length: pack.base }, (_, index) =>
        buildUnit(
          level - 1,
          rawIds.slice(index * childRawCount, (index + 1) * childRawCount),
        ),
      ),
      itemId = `m${pack.nextMacroId++}`,
      item = {
        id: itemId,
        level,
        ids: children.flatMap((childId) => pack.nodes[childId].ids),
        children,
        order: pack.nextOrder++,
        macro: true,
        base: pack.base,
      };
    pack.nodes[itemId] = item;
    return itemId;
  };

  if (targetLevel === 0) {
    for (const rawId of consumedRawIds) {
      pack.numberMassRawIds.shift();
      const nodeId = `d${rawId}`;
      pack.active.push(nodeId);
      pack.nodes[nodeId].order = pack.nextOrder++;
      snapshot("input", { rawId, targetLevel, rawIds: [rawId] });
      carryReadyLevel(0);
    }
  } else {
    const rawPerUnit = packUnitSize(pack.base, targetLevel);
    for (let offset = 0; offset < consumedRawIds.length; offset += rawPerUnit) {
      const rawIds = consumedRawIds.slice(offset, offset + rawPerUnit);
      pack.numberMassRawIds.splice(0, rawPerUnit);
      const itemId = buildUnit(targetLevel, rawIds),
        item = pack.nodes[itemId];
      item.order = pack.nextOrder++;
      pack.active.push(itemId);
      snapshot("input", { itemId, targetLevel, rawIds });
      carryReadyLevel(targetLevel);
    }
  }
  pack.active.sort(
    (a, b) =>
      pack.nodes[a].level - pack.nodes[b].level ||
      pack.nodes[a].order - pack.nodes[b].order,
  );
  return {
    ok: true,
    type: "pour",
    targetLevel,
    unitSize,
    initialState,
    consumedRawIds,
    remainingRawIds: remaining,
    steps,
    complete: pack.numberMassRawIds.length === 0,
    feedUnits,
    neededUnits,
    availableUnits,
    carryReached: feedUnits === neededUnits,
    canonical: isCanonicalPack(run),
  };
}

export function setPackBase(run, base) {
  const pack = requirePack(run),
    allowed = [...new Set(run.stage.radices)];
  if (run.status !== "play" || !allowed.includes(base) || base === pack.base)
    return false;
  pack.base = base;
  pack.numberMassRawIds = run.dots.map((dot) => dot.id);
  pack.active = [];
  pack.discoveredLevels = [0];
  pack.phase = "pack";
  pack.settled = true;
  return true;
}


export function createRun(stage) {
  if (!stage) throw new RangeError("Unknown stage");
  let unit = 0;
  const dots = [],
    pieces = stage.ammo.map((n, origin) => {
      const ids = Array.from({ length: n }, () => {
        const id = unit++;
        dots.push({ id, origin });
        return id;
      });
      return { id: origin, ids, width: 0 };
    });
  const run = {
    width: 0,
    stage,
    dots,
    pieces,
    nextId: pieces.length,
    targets: stage.targets.map((t) => ({
      ...t,
      complete: false,
    })),
    spent: [],
    misses: 0,
    gateIndex: 0,
    status: "play",
  };
  if (stage.area === "pack") run.pack = createPackState(stage, pieces[0].ids);
  return run;
}
export function activeTargets(run) {
  const phase = Math.min(
    ...run.targets.filter((t) => !t.complete).map((t) => t.phase),
  );
  return run.targets.flatMap((t, i) =>
    !t.complete && t.phase === phase ? [i] : [],
  );
}
export function gateFactor(run) {
  return run.stage.gates?.[run.gateIndex];
}
function validSelection(run, pieceId, ids) {
  const p = run.pieces.find((p) => p.id === pieceId);
  return (
    run.status === "play" &&
    p &&
    ids.length &&
    new Set(ids).size === ids.length &&
    ids.every((id) => p.ids.includes(id))
  );
}
function take(run, pieceId, ids) {
  const p = run.pieces.find((p) => p.id === pieceId),
    set = new Set(ids);
  p.ids = p.ids.filter((id) => !set.has(id));
  p.width = 0;
  if (!p.ids.length) run.pieces.splice(run.pieces.indexOf(p), 1);
}
function add(run, ids) {
  if (!ids.length) return null;
  const p = { id: run.nextId++, ids: [...ids], width: 0 };
  run.pieces.push(p);
  return p.id;
}
export function split(run, pieceId, ids) {
  if (!validSelection(run, pieceId, ids)) return { ok: false };
  const p = run.pieces.find((p) => p.id === pieceId);
  if (p.ids.length === ids.length) return { ok: true, pieceId };
  take(run, pieceId, ids);
  return { ok: true, pieceId: add(run, ids), type: "split" };
}
export function merge(run, sourceId, ids, targetId) {
  if (run.stage.area !== "spark") return { ok: false };
  const t = run.pieces.find((p) => p.id === targetId);
  if (
    sourceId === targetId ||
    !t ||
    !validSelection(run, sourceId, ids) ||
    t.ids.length + ids.length > 36
  )
    return { ok: false };
  take(run, sourceId, ids);
  t.ids.push(...ids);
  t.width = 0;
  return { ok: true, pieceId: targetId, type: "merge" };
}
function reject(run) {
  return { ok: false, type: "miss" };
}
export function setWidth(run, pieceId, width) {
  if (run.status !== "play") return false;
  const p = run.pieces.find((p) => p.id === pieceId);
  if (!p) return false;
  const max =
    run.stage.area === "gear"
      ? Math.min(...run.pieces.map((p) => p.ids.length))
      : p.ids.length;
  width = Math.max(0, Math.min(max, Math.round(width)));
  if (run.stage.area === "gear") {
    run.width = width;
    for (const q of run.pieces) q.width = width;
  } else p.width = width;
  return true;
}
function accepts(run, targetIndex, ids, width = 0) {
  const t = run.targets[targetIndex];
  if (!t || !activeTargets(run).includes(targetIndex) || ids.length !== t.n)
    return false;
  if (t.kind === "divide" || t.kind === "gear") return false;
  return true;
}
function fill(run, targetIndex, ids) {
  const t = run.targets[targetIndex];
  t.complete = true;
  run.spent.push(...ids);
  if (run.targets.every((t) => t.complete)) run.status = "won";
  return {
    ok: true,
    type: "hit",
    ids: [...ids],
    inputIds: [...ids],
    targetIndex,
    complete: run.status === "won",
  };
}
export function fire(run, pieceId, ids, targetIndex) {
  if (!validSelection(run, pieceId, ids)) return { ok: false, ignored: true };
  const p = run.pieces.find((p) => p.id === pieceId),
    t = run.targets[targetIndex];
  if (!t || !activeTargets(run).includes(targetIndex)) return reject(run);
  if (t.kind === "gear") {
    const f = run.width;
    if (f < 2 || run.pieces.length !== 2) return reject(run);
    const sizes = run.pieces.map((p) => p.ids.length);
    if (sizes.some((n) => n % f)) return reject(run);

    const greatest = gcd(sizes[0], sizes[1]),
      groups = run.pieces.flatMap((p) =>
        Array.from({ length: p.ids.length / f }, (_, i) =>
          p.ids.slice(i * f, (i + 1) * f),
        ),
      ),
      all = run.pieces.flatMap((p) => p.ids),
      outcome = f === greatest ? "win" : "repel";

    if (outcome === "win") {
      run.pieces = [];
      run.spent.push(...all);
      t.complete = true;
      run.status = "won";
    }

    return {
      ok: true,
      type: "volley",
      outcome,
      factor: f,
      greatest,
      ids: all,
      groups,
      targetIndex,
      complete: outcome === "win",
    };
  }
  if (
    !accepts(run, targetIndex, ids, ids.length === p.ids.length ? p.width : 0)
  )
    return reject(run);
  take(run, pieceId, ids);
  return fill(run, targetIndex, ids);
}
export function divide(run, pieceId, ids) {
  if (!validSelection(run, pieceId, ids)) return { ok: false, ignored: true };
  const f = gateFactor(run);
  const piece = run.pieces.find((p) => p.id === pieceId);
  if (piece.width !== f || ids.length !== piece.ids.length) return reject(run);
  if (!f) return { ok: false, ignored: true };
  const q = Math.floor(ids.length / f),
    r = ids.length % f;
  const kept = [],
    shot = [],
    rest = ids.slice(q * f);
  for (let i = 0; i < q * f; i++) (i % f === 0 ? kept : shot).push(ids[i]);
  const targetIndex = activeTargets(run).find(
    (i) =>
      run.targets[i].kind === "divide" &&
      run.targets[i].n === shot.length &&
      run.targets[i].input === ids.length,
  );
  if (!q || targetIndex === undefined)
    return { ...reject(run), factor: f, quotient: q, remainder: r };
  take(run, pieceId, ids);
  const quotientId = add(run, kept),
    remainderId = add(run, rest);
  run.gateIndex++;
  return {
    ...fill(run, targetIndex, shot),
    type: "divide",
    factor: f,
    quotient: q,
    remainder: r,
    kept,
    rest,
    quotientId,
    remainderId,
    allIds: [...ids],
  };
}
export function accountedIds(run) {
  if (run?.stage?.area === "pack" && run.pack)
    return [
      ...run.pack.numberMassRawIds,
      ...activePackItems(run).flatMap((item) => item.ids),
    ];
  return [...run.pieces.flatMap((p) => p.ids), ...run.spent];
}
