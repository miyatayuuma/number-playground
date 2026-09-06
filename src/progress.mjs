import { AREAS } from "./stages.mjs";
export const SAVE_KEY = "core-break-flow-v3";
export function freshProgress() {
  return Object.fromEntries(
    AREAS.map((a) => [
      a.id,
      { difficulty: 1, wins: 0, retries: 0, recent: [] },
    ]),
  );
}
export function restoreProgress(data) {
  const out = freshProgress();
  for (const id of Object.keys(out)) {
    const p = data?.[id];
    if (!p) continue;
    out[id] = {
      difficulty: Math.max(1, Math.min(5, Math.trunc(p.difficulty) || 1)),
      wins: Math.max(0, Math.min(2, Math.trunc(p.wins) || 0)),
      retries: Math.max(0, Math.min(1, Math.trunc(p.retries) || 0)),
      recent: Array.isArray(p.recent)
        ? p.recent.filter((x) => typeof x === "string").slice(-10)
        : [],
    };
  }
  return out;
}
export function recordResult(p, won) {
  if (won) {
    p.retries = 0;
    p.wins++;
    if (p.wins >= 3) {
      p.difficulty = Math.min(5, p.difficulty + 1);
      p.wins = 0;
    }
  } else {
    p.wins = 0;
    p.retries++;
    if (p.retries >= 2) {
      p.difficulty = Math.max(1, p.difficulty - 1);
      p.retries = 0;
    }
  }
}
