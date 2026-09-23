import { AREAS } from "./stages.mjs";

export const SAVE_KEY = "core-break-flow-v4";
export const LEGACY_SAVE_KEY = "core-break-flow-v3";

const freshRule = () => ({
  difficulty: 1,
  promotionEvidence: [],
  reissues: 0,
  recent: [],
});

export function freshProgress() {
  return Object.fromEntries(AREAS.map(({ id }) => [id, freshRule()]));
}

export function restoreProgress(data) {
  const out = freshProgress();
  for (const id of Object.keys(out)) {
    const p = data?.[id];
    if (!p) continue;
    out[id] = {
      difficulty: Math.max(1, Math.min(5, Math.trunc(p.difficulty) || 1)),
      promotionEvidence: Array.isArray(p.promotionEvidence)
        ? [...new Set(p.promotionEvidence.filter((x) => typeof x === "string"))].slice(-2)
        : [],
      reissues: Math.max(0, Math.min(2, Math.trunc(p.reissues) || 0)),
      recent: Array.isArray(p.recent)
        ? p.recent.filter((x) => typeof x === "string").slice(-10)
        : [],
    };
  }
  return out;
}

export function recordClear(p, problemId, mastery) {
  p.reissues = 0;
  if (!mastery || p.difficulty >= 5 || typeof problemId !== "string") return p;
  if (!p.promotionEvidence.includes(problemId)) p.promotionEvidence.push(problemId);
  if (p.promotionEvidence.length >= 3) {
    p.difficulty = Math.min(5, p.difficulty + 1);
    p.promotionEvidence = [];
    p.reissues = 0;
  }
  return p;
}

export function masteryEligible(rule, evidence) {
  if (rule === "pack")
    return (evidence?.wrongCompletedRadices?.size ?? Number.POSITIVE_INFINITY) <= 1;
  return (evidence?.rejectedAttacks ?? 0) === 0;
}

export function recordReissue(p) {
  p.reissues++;
  if (p.reissues >= 3) {
    p.difficulty = Math.max(1, p.difficulty - 1);
    p.promotionEvidence = [];
    p.reissues = 0;
  }
  return p;
}

export function resetRule(progress, id) {
  if (Object.hasOwn(progress, id)) progress[id] = freshRule();
  return progress;
}
