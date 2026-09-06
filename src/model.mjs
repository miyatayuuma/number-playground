import { STAGES } from "./stages.mjs";
export function createRun(index) {
  const stage = STAGES[index];
  if (!stage) throw new RangeError("Unknown stage");
  let unit = 0;
  const dots = [],
    pieces = stage.ammo.map((n, origin) => {
      const ids = Array.from({ length: n }, () => {
        const id = unit++;
        dots.push({ id, origin });
        return id;
      });
      return { id: origin, ids };
    });
  return {
    index,
    stage,
    dots,
    pieces,
    nextId: pieces.length,
    targets: stage.targets.map((t) => ({ ...t, complete: false, loaded: [] })),
    spent: [],
    misses: 0,
    gateIndex: 0,
    status: "play",
  };
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
  return run.stage.gates?.[Math.min(run.gateIndex, run.stage.gates.length - 1)];
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
  if (!p.ids.length) run.pieces.splice(run.pieces.indexOf(p), 1);
}
function add(run, ids) {
  if (!ids.length) return null;
  const p = { id: run.nextId++, ids: [...ids] };
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
  return { ok: true, pieceId: targetId, type: "merge" };
}
function reject(run) {
  run.misses++;
  if (["gear", "core"].includes(run.stage.area) && run.misses >= 4)
    run.status = "lost";
  return { ok: false, type: "miss" };
}
function accepts(run, targetIndex, ids) {
  const t = run.targets[targetIndex];
  return (
    t &&
    activeTargets(run).includes(targetIndex) &&
    ids.length === t.n &&
    (t.origin === null || ids.every((id) => run.dots[id].origin === t.origin))
  );
}
function fill(run, targetIndex, ids) {
  const t = run.targets[targetIndex];
  t.complete = true;
  if (run.stage.charge) t.loaded = [...ids];
  else run.spent.push(...ids);
  let type = run.stage.charge ? "load" : "hit",
    fired = ids;
  if (run.targets.every((t) => t.complete)) {
    run.status = "won";
    if (run.stage.charge) {
      fired = run.targets.flatMap((t) => t.loaded);
      run.spent.push(...fired);
      run.targets.forEach((t) => {
        t.loaded = [];
      });
      type = "burst";
    }
  }
  return {
    ok: true,
    type,
    ids: [...fired],
    inputIds: [...ids],
    targetIndex,
    complete: run.status === "won",
    charge: run.stage.charge,
  };
}
export function fire(run, pieceId, ids, targetIndex) {
  if (!validSelection(run, pieceId, ids)) return { ok: false, ignored: true };
  if (!accepts(run, targetIndex, ids)) return reject(run);
  take(run, pieceId, ids);
  return fill(run, targetIndex, ids);
}
export function divide(run, pieceId, ids) {
  if (!validSelection(run, pieceId, ids)) return { ok: false, ignored: true };
  const f = gateFactor(run);
  if (!f) return { ok: false, ignored: true };
  const q = Math.floor(ids.length / f),
    r = ids.length % f;
  const kept = [],
    shot = [],
    rest = ids.slice(q * f);
  for (let i = 0; i < q * f; i++) (i % f === 0 ? kept : shot).push(ids[i]);
  const targetIndex = activeTargets(run).find((i) => accepts(run, i, shot));
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
  return [
    ...run.pieces.flatMap((p) => p.ids),
    ...run.targets.flatMap((t) => t.loaded),
    ...run.spent,
  ];
}
