export const AREAS = [
  { id: "spark", name: "スパーク", color: "#ffc977", glyph: "✦" },
  { id: "link", name: "リンク", color: "#75ead2", glyph: "⠿" },
  { id: "gear", name: "ギア", color: "#8bbcff", glyph: "◈" },
];
export const divisors = (n) =>
  Array.from({ length: n - 1 }, (_, i) => i + 2).filter((f) => n % f === 0);
const target = (n, extra = {}) => ({ n, phase: 0, origin: null, ...extra });
const bank = Object.fromEntries(AREAS.map((a) => [a.id, []]));
function add(rule, spec, complexity = 0) {
  const max = Math.max(...spec.ammo);
  const difficulty = Math.min(
    5,
    Math.max(
      1,
      [12, 18, 24, 30, 36].findIndex((limit) => max <= limit) + 1 + complexity,
    ),
  );
  const id = `${rule}:${JSON.stringify(spec)}`;
  bank[rule].push({ ...spec, id, area: rule, difficulty });
}
for (let n = 3; n <= 36; n++) {
  for (let a = 1; a < n; a++) {
    add("spark", { ammo: [a, n - a], targets: [target(n)], family: "join" });
    if (a < n - a)
      add(
        "spark",
        { ammo: [n], targets: [target(a), target(n - a)], family: "split" },
        1,
      );
  }
  if (n >= 6)
    add(
      "spark",
      { ammo: [1, 2, n - 3], targets: [target(n)], family: "join" },
      1,
    );
}
for (let f = 2; f <= 6; f++)
  for (let q = 2; q <= 12; q++)
    for (let r = 0; r < f; r++) {
      const n = f * q + r;
      if (n > 36) continue;
      const targets = [
        target(q * (f - 1), { kind: "divide", input: n, width: f }),
        target(q, { phase: 1 }),
      ];
      if (r) targets.push(target(r, { phase: 1 }));
      add(
        "link",
        { ammo: [n], targets, gates: [f], family: r ? "remainder" : "divide" },
        r && n > 12 ? 1 : 0,
      );
      if (!r)
        for (let g = 2; g < q; g++)
          if (q % g === 0)
            add(
              "link",
              {
                ammo: [n],
                gates: [f, g],
                family: "chain",
                targets: [
                  targets[0],
                  target(q - q / g, {
                    phase: 1,
                    kind: "divide",
                    input: q,
                    width: g,
                  }),
                  target(q / g, { phase: 2 }),
                ],
              },
              1,
            );
    }
for (let a = 4; a <= 36; a++)
  for (let b = a + 1; b <= 36; b++) {
    const common = divisors(a).filter((f) => b % f === 0);
    if (common.length)
      add(
        "gear",
        {
          ammo: [a, b],
          targets: [target(a + b, { kind: "gear" })],
          family: "common",
        },
        common.length > 2 ? 1 : 0,
      );
  }
export const PROBLEM_BANK = bank;
export function generateProblem(
  ruleId,
  difficulty = 1,
  seed = 0,
  recentHistory = [],
) {
  if (!bank[ruleId]) throw new RangeError("Unknown rule");
  difficulty = Math.max(1, Math.min(5, Math.trunc(difficulty) || 1));
  const candidates = bank[ruleId].filter((p) => p.difficulty === difficulty);
  const pool = candidates.length
    ? candidates
    : bank[ruleId].filter(
        (p) =>
          p.difficulty === Math.min(...bank[ruleId].map((p) => p.difficulty)),
      );
  const fresh = pool.filter((p) => !recentHistory.includes(p.id));
  const choices = fresh.length ? fresh : pool;
  let h = 2166136261;
  for (const ch of String(seed))
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const result = structuredClone(choices[h % choices.length]);
  return { ...result, difficulty, seed };
}
