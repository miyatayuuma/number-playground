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
    base: stage.radices[0],
    step: 0,
    phase: "pack",
    active: ids.map((id) => `d${id}`),
    nodes,
    nextMacroId: 0,
    locks: [],
  };
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

export function isCanonicalPack(run) {
  if (run?.stage?.area !== "pack" || !run.pack) return false;
  const pack = run.pack;
  if (!Array.isArray(pack.active) || pack.active.some((id) => !pack.nodes[id]))
    return false;
  const active = pack.active
      .map((id) => pack.nodes[id])
      .sort((a, b) => a.level - b.level || a.order - b.order),
    byLevel = new Map();
  for (const item of active) {
    if (!item || pack.nodes[item.id] !== item) return false;
    byLevel.set(item.level, (byLevel.get(item.level) || 0) + 1);
    if (!packNodeRawIds(pack, item.id)) return false;
  }
  if ([...byLevel.values()].some((count) => count >= pack.base)) return false;
  const ids = active.flatMap((item) => item.ids),
    expected = run.dots.map((dot) => dot.id);
  return (
    ids.length === expected.length &&
    new Set(ids).size === ids.length &&
    ids.every((id) => expected.includes(id))
  );
}

export function isPackAttackReady(run) {
  return (
    run?.status === "settling" &&
    run.pack?.phase === "attack-ready" &&
    isCanonicalPack(run)
  );
}

export function buildPackAttackPlan(run) {
  if (!isPackAttackReady(run))
    return { ok: false, reason: "not-canonical-or-unsettled" };
  const pack = run.pack,
    digits = packDigits(run),
    payloads = activePackItems(run)
      .sort((a, b) => b.level - a.level || a.order - b.order)
      .map((item) => ({
        itemId: item.id,
        level: item.level,
        targetLayer: item.level,
        rawIds: [...item.ids],
        weight: item.ids.length,
      })),
    rawIds = payloads.flatMap((payload) => payload.rawIds);
  if (rawIds.length !== run.dots.length || new Set(rawIds).size !== rawIds.length)
    return { ok: false, reason: "identity-accounting-failed" };
  return {
    ok: true,
    base: pack.base,
    placeCount: digits.length,
    rawIds,
    payloads,
  };
}

export function beginPackAttack(run) {
  const plan = buildPackAttackPlan(run);
  if (!plan.ok) return plan;
  run.pack.phase = "attack";
  run.pack.attack = {
    placeCount: plan.placeCount,
    payloads: plan.payloads.map((payload) => ({
      ...payload,
      rawIds: [...payload.rawIds],
    })),
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
    run?.status !== "attack" ||
    pack.phase !== "attack" ||
    !payload ||
    attack.impactedItemIds.includes(itemId) ||
    payload.rawIds.some((id) => attack.resolvedRawIds.includes(id))
  )
    return { ok: false };
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
    run?.stage?.area !== "pack" ||
    run.status !== "break" ||
    run.pack.phase !== "break" ||
    !attack ||
    attack.resolvedRawIds.length !== run.dots.length ||
    new Set(attack.resolvedRawIds).size !== run.dots.length ||
    !run.dots.every((dot) => attack.resolvedRawIds.includes(dot.id))
  )
    return false;
  run.pack.phase = "next";
  run.status = "won";
  return true;
}

// Deterministic complete bundles are useful for model inspection and keyboard
// access, but the pointer interaction never exposes these as preselected groups.
export function packableGroups(run) {
  const pack = requirePack(run);
  if (run.status !== "play" || pack.phase !== "pack") return [];
  const levels = [...new Set(activePackItems(run).map((item) => item.level))],
    groups = [];
  for (const level of levels) {
    const items = activePackItems(run)
      .filter((item) => item.level === level)
      .sort((a, b) => a.order - b.order);
    for (let i = 0; i + pack.base <= items.length; i += pack.base) {
      const chunk = items.slice(i, i + pack.base);
      groups.push({
        level,
        itemIds: chunk.map((item) => item.id),
        ids: chunk.flatMap((item) => item.ids),
      });
    }
  }
  return groups;
}

export function packDigits(run) {
  const pack = requirePack(run),
    items = activePackItems(run),
    expectedMax = Math.floor(
      Math.log(run.stage.quantity || run.dots.length) / Math.log(pack.base),
    ),
    maxLevel = Math.max(expectedMax, ...items.map((item) => item.level), 0),
    lowToHigh = Array.from({ length: maxLevel + 1 }, (_, level) =>
      items.filter((item) => item.level === level).length,
    );
  return lowToHigh.reverse();
}

const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";
export function radixNotation(digits, base) {
  return `${digits.join("")}${String(base)
    .split("")
    .map((digit) => SUBSCRIPT[Number(digit)])
    .join("")}`;
}

function settlePack(run, result) {
  const pack = requirePack(run);
  if (packableGroups(run).length) return result;
  const digits = packDigits(run);
  if (digits.some((digit) => digit >= pack.base)) return result;
  const lock = {
    base: pack.base,
    digits,
    notation: radixNotation(digits, pack.base),
  };
  pack.locks.push(lock);
  result.lock = structuredClone(lock);
  result.locked = true;
  if (pack.step === run.stage.radices.length - 1) {
    pack.phase = "attack-ready";
    run.status = "settling";
    result.attackReady = true;
  } else {
    pack.phase = "unpack";
  }
  return result;
}

export function normalizePackSelection(run, itemIds) {
  const pack = requirePack(run);
  if (run.status !== "play" || pack.phase !== "pack")
    return { ok: false, ignored: true };

  const unique = [...new Set(itemIds)];
  if (!unique.length || unique.length !== itemIds.length)
    return { ok: false, type: "miss" };
  const items = unique.map((id) => pack.nodes[id]);
  if (
    items.some((item, index) => !item || !pack.active.includes(unique[index]))
  )
    return { ok: false, type: "miss" };

  const level = items[0].level;
  if (items.some((item) => item.level !== level))
    return { ok: false, type: "miss" };
  items.sort((a, b) => a.order - b.order);

  const bundleCount = Math.floor(items.length / pack.base),
    carryCount = bundleCount * pack.base,
    carried = items.slice(0, carryCount),
    remainder = items.slice(carryCount),
    selectedIds = items.flatMap((item) => item.ids),
    result = {
      ok: true,
      type: "normalize",
      level,
      carryLevel: level + 1,
      selectedItemIds: items.map((item) => item.id),
      ids: selectedIds,
      bundles: [],
      remainderItemIds: remainder.map((item) => item.id),
      complete: false,
      locked: false,
    };

  if (!bundleCount) return result;

  const childSet = new Set(carried.map((item) => item.id));
  pack.active = pack.active.filter((id) => !childSet.has(id));

  for (let index = 0; index < bundleCount; index++) {
    const children = carried.slice(index * pack.base, (index + 1) * pack.base),
      id = `m${pack.step}-${pack.nextMacroId++}`,
      node = {
        id,
        level: level + 1,
        ids: children.flatMap((item) => item.ids),
        children: children.map((item) => item.id),
        order: Math.min(...children.map((item) => item.order)),
        macro: true,
        base: pack.base,
      };
    pack.nodes[id] = node;
    pack.active.push(id);
    result.bundles.push({
      itemId: id,
      childItemIds: [...node.children],
      ids: [...node.ids],
      representative: node.ids[0],
    });
  }

  pack.active.sort(
    (a, b) =>
      pack.nodes[a].order - pack.nodes[b].order ||
      pack.nodes[a].level - pack.nodes[b].level,
  );
  return settlePack(run, result);
}

// Kept as a thin compatibility alias for the first prototype's test helpers.
export function packGroup(run, itemIds) {
  return normalizePackSelection(run, itemIds);
}

export function unpackPackItem(run, itemId) {
  const pack = requirePack(run),
    node = pack.nodes[itemId];
  if (
    run.status !== "play" ||
    !node?.macro ||
    !pack.active.includes(itemId) ||
    (pack.phase !== "pack" && pack.phase !== "unpack")
  )
    return { ok: false, type: "miss" };
  const index = pack.active.indexOf(itemId);
  pack.active.splice(index, 1, ...node.children);
  pack.active.sort(
    (a, b) =>
      pack.nodes[a].order - pack.nodes[b].order ||
      pack.nodes[a].level - pack.nodes[b].level,
  );
  if (
    pack.phase === "unpack" &&
    pack.active.every((id) => pack.nodes[id].level === 0)
  )
    pack.phase = "choose";
  return {
    ok: true,
    type: "unpack",
    itemId,
    childItemIds: [...node.children],
    ids: [...node.ids],
    level: node.level - 1,
    representative: node.ids[0],
  };
}

export function setPackBase(run, base) {
  const pack = requirePack(run),
    next = run.stage.radices[pack.step + 1];
  if (
    run.status !== "play" ||
    pack.phase !== "choose" ||
    base !== next ||
    !pack.active.every((id) => pack.nodes[id].level === 0)
  )
    return false;
  pack.step++;
  pack.base = base;
  pack.phase = "pack";
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
  return [...run.pieces.flatMap((p) => p.ids), ...run.spent];
}
