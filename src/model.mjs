import { gcd } from "./math.mjs";

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
  return {
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
