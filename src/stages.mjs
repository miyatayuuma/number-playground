import { gcd } from "./math.mjs";
import { factors } from "./shapes.mjs";
import { packCanonicalDigits } from "./model.mjs";

export const AREAS = [
  { id: "spark", name: "スパーク", color: "#ffc977", glyph: "✦" },
  { id: "link", name: "ラック", color: "#75ead2", glyph: "⠿" },
  { id: "gear", name: "ギア", color: "#8bbcff", glyph: "◈" },
  { id: "pack", name: "パック", color: "#f3a6ff", glyph: "◉" },
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
const sparkIds = new Set();
function addSpark(spec, difficulty) {
  const total = spec.ammo.reduce((sum, n) => sum + n, 0),
    required = spec.targets.reduce((sum, t) => sum + t.n, 0);
  if (
    total !== required ||
    spec.ammo.some((n) => !Number.isInteger(n) || n <= 0) ||
    spec.targets.some((t) => !Number.isInteger(t.n) || t.n <= 0)
  )
    throw new RangeError("SPARK problem must conserve a positive raw quantity");
  const id = `spark:${difficulty}:${JSON.stringify(spec)}`;
  if (sparkIds.has(id)) return;
  sparkIds.add(id);
  bank.spark.push({ ...spec, id, area: "spark", difficulty });
}
function sparkDirectPart(n) {
  if (n === 4) return 2;
  const fs = factors(n);
  return fs.length > 1 ? n / fs[0] : 1;
}
function sparkFinePart(n) {
  const fs = factors(n);
  if (fs.at(-1) === 4) return 2;
  return fs.length > 1 ? fs.at(-1) : 1;
}
const balancedAmmo = (n) => [Math.floor(n / 2), Math.ceil(n / 2)];
const sequentialTargets = (n, reverse = false) => {
  const part = sparkDirectPart(n),
    pair = reverse ? [n - part, part] : [part, n - part];
  return pair.map((value, phase) => target(value, { phase }));
};
const joinDecompositionTargets = (n) => {
  const part = sparkFinePart(n);
  return [target(n - part), target(part, { phase: 1 })];
};
const parallelTargets = (n) => {
  const part = sparkDirectPart(n);
  return [target(part), target(n - part)];
};

// D1 deliberately permits "join everything, then fire everything".
for (let n = 3; n <= 6; n++)
  for (let a = 1; a < n; a++)
    addSpark({ ammo: [a, n - a], targets: [target(n)], family: "join" }, 1);

// D2 keeps addition dominant while introducing sequential decomposition.
for (let n = 5; n <= 9; n++) {
  addSpark({ ammo: [1, n - 1], targets: [target(n)], family: "join" }, 2);
  addSpark({ ammo: [2, n - 2], targets: [target(n)], family: "join" }, 2);
  addSpark(
    { ammo: [n], targets: sequentialTargets(n), family: "sequential-split" },
    2,
  );
}
addSpark({ ammo: [3, 5], targets: [target(8)], family: "join" }, 2);
addSpark({ ammo: [3, 6], targets: [target(9)], family: "join" }, 2);
for (const n of [7, 8])
  addSpark(
    {
      ammo: balancedAmmo(n),
      targets: joinDecompositionTargets(n),
      family: "join-decomposition",
    },
    2,
  );

// D3 makes decomposition the normal case while keeping a minority of joins.
for (let n = 7; n <= 12; n++) {
  addSpark({ ammo: [1, n - 1], targets: [target(n)], family: "join" }, 3);
  addSpark(
    { ammo: [n], targets: sequentialTargets(n), family: "sequential-split" },
    3,
  );
  addSpark(
    {
      ammo: [n],
      targets: sequentialTargets(n, true),
      family: "sequential-split",
    },
    3,
  );
  addSpark(
    {
      ammo: balancedAmmo(n),
      targets: joinDecompositionTargets(n),
      family: "join-decomposition",
    },
    3,
  );
}
addSpark({ ammo: [2, 7], targets: [target(9)], family: "join" }, 3);
addSpark(
  { ammo: [12], targets: parallelTargets(12), family: "parallel-split" },
  3,
);

// D4 removes normal one-shot addition. Parallel split remains a minority width exercise.
for (let n = 10; n <= 18; n++) {
  addSpark(
    { ammo: [n], targets: sequentialTargets(n), family: "sequential-split" },
    4,
  );
  addSpark(
    {
      ammo: [n],
      targets: sequentialTargets(n, true),
      family: "sequential-split",
    },
    4,
  );
  addSpark(
    {
      ammo: balancedAmmo(n),
      targets: joinDecompositionTargets(n),
      family: "join-decomposition",
    },
    4,
  );
}
for (const n of [10, 12, 15, 18])
  addSpark(
    { ammo: [n], targets: parallelTargets(n), family: "parallel-split" },
    4,
  );

// D5 raises quantity and allows modest depth without growing target-tree width.
for (let n = 14; n <= 24; n++) {
  addSpark(
    { ammo: [n], targets: sequentialTargets(n), family: "sequential-split" },
    5,
  );
  addSpark(
    {
      ammo: [n],
      targets: sequentialTargets(n, true),
      family: "sequential-split",
    },
    5,
  );
  const first = sparkDirectPart(n),
    remaining = n - first,
    second = sparkDirectPart(remaining),
    third = remaining - second;
  addSpark(
    {
      ammo: [n],
      targets: [
        target(first),
        target(second, { phase: 1 }),
        target(third, { phase: 2 }),
      ],
      family: "sequential-split",
    },
    5,
  );

  const tail = sparkDirectPart(n);
  if (tail >= 2) {
    const tailFirst = sparkDirectPart(tail),
      tailSecond = tail - tailFirst;
    if (tailSecond > 0)
      addSpark(
        {
          ammo: balancedAmmo(n),
          targets: [
            target(n - tail),
            target(tailFirst, { phase: 1 }),
            target(tailSecond, { phase: 2 }),
          ],
          family: "join-decomposition",
        },
        5,
      );
  }
}
for (const n of [14, 18, 22, 24])
  addSpark(
    { ammo: [n], targets: parallelTargets(n), family: "parallel-split" },
    5,
  );
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

const gearSpecs = [],
  gearSeen = new Set();
for (let g = 2; g <= 12; g++)
  for (let x = 1; g * x <= 36; x++)
    for (let y = x + 1; g * y <= 36; y++) {
      if (gcd(x, y) !== 1) continue;
      const a = g * x,
        b = g * y;
      if (a < 4 || gcd(a, b) !== g) continue;
      // Keep GCD=2 as a minority instead of letting even/even pairs dominate.
      if (g === 2 && (x + y) % 4 !== 0) continue;
      const key = `${a}:${b}`;
      if (gearSeen.has(key)) continue;
      gearSeen.add(key);
      const lower = divisors(g).filter((f) => f < g).length;
      gearSpecs.push({
        ammo: [a, b],
        gcd: g,
        lower,
        targets: [target(a + b, { kind: "gear" })],
        family: "common",
      });
    }

gearSpecs.sort((a, b) => {
  const scoreA = Math.max(...a.ammo) + a.lower * 6 + a.gcd * 0.15,
    scoreB = Math.max(...b.ammo) + b.lower * 6 + b.gcd * 0.15;
  return scoreA - scoreB || a.ammo[0] - b.ammo[0] || a.ammo[1] - b.ammo[1];
});
gearSpecs.forEach((spec, i) => {
  const difficulty = Math.min(5, Math.floor((i * 5) / gearSpecs.length) + 1),
    clean = { ...spec };
  delete clean.lower;
  const id = `gear:${JSON.stringify(clean)}`;
  bank.gear.push({ ...clean, id, area: "gear", difficulty });
});

const PACK_RADICES = Object.freeze([2, 3, 4, 5, 6, 7, 8, 9, 10]);
const PACK_PROFILES = Object.freeze({
  1: { minQuantity: 3, maxQuantity: 12, minRadix: 2, maxRadix: 5, minPlaces: 2, maxPlaces: 2, noZero: true },
  2: { minQuantity: 5, maxQuantity: 17, minRadix: 2, maxRadix: 6, minPlaces: 2, maxPlaces: 3, noMiddleZero: true },
  3: { minQuantity: 8, maxQuantity: 22, minRadix: 2, maxRadix: 8, minPlaces: 2, maxPlaces: 4, minNonZeroPlaces: 2 },
  4: { minQuantity: 10, maxQuantity: 27, minRadix: 2, maxRadix: 10, minPlaces: 2, maxPlaces: 4, minNonZeroPlaces: 2 },
  5: { minQuantity: 12, maxQuantity: 31, minRadix: 2, maxRadix: 10, minPlaces: 2, maxPlaces: 5 },
});

export function classifyPackCandidate(quantity, targetRadix) {
  const digits = packCanonicalDigits(quantity, targetRadix),
    zeroCount = digits.filter((digit) => digit === 0).length;
  return {
    quantity,
    targetRadix,
    digits,
    placeCount: digits.length,
    zeroCount,
    middleZero: digits.slice(1, -1).includes(0),
    nonZeroPlaceCount: digits.length - zeroCount,
  };
}

function packCandidateAllowed(candidate, difficulty) {
  const profile = PACK_PROFILES[difficulty];
  return (
    candidate.quantity >= profile.minQuantity &&
    candidate.quantity <= profile.maxQuantity &&
    candidate.targetRadix >= profile.minRadix &&
    candidate.targetRadix <= profile.maxRadix &&
    candidate.targetRadix <= candidate.quantity &&
    candidate.placeCount >= profile.minPlaces &&
    candidate.placeCount <= profile.maxPlaces &&
    (!profile.noZero || candidate.zeroCount === 0) &&
    (!profile.noMiddleZero || !candidate.middleZero) &&
    (!profile.minNonZeroPlaces || candidate.nonZeroPlaceCount >= profile.minNonZeroPlaces)
  );
}

function makePackCandidateBank() {
  const candidates = [];
  for (let quantity = 3; quantity <= 31; quantity++)
    for (const targetRadix of PACK_RADICES) {
      if (quantity < targetRadix) continue;
      candidates.push({
        id: `pack:q${quantity}:b${targetRadix}`,
        area: "pack",
        ammo: [quantity],
        quantity,
        radices: PACK_RADICES,
        targetRadix,
        family: "radix",
        targets: [],
      });
    }
  return candidates;
}
bank.pack.push(...makePackCandidateBank());

function seededHash(seed) {
  let hash = 2166136261;
  for (const ch of String(seed))
    hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

export function packCandidatesForDifficulty(difficulty = 1) {
  const level = Math.max(1, Math.min(5, Math.trunc(difficulty) || 1));
  return bank.pack.filter((candidate) =>
    packCandidateAllowed(
      classifyPackCandidate(candidate.quantity, candidate.targetRadix),
      level,
    ),
  );
}

function selectPackProblem(difficulty, seed, recentHistory) {
  const pool = packCandidatesForDifficulty(difficulty);
  let choices = pool.filter((candidate) => !recentHistory.includes(candidate.id));
  if (!choices.length) choices = pool;

  const recentCandidates = [...recentHistory]
    .reverse()
    .map((id) => /^pack:q(\d+):b(\d+)$/.exec(id))
    .filter(Boolean),
    recentCandidate = recentCandidates[0];
  if (recentCandidates.length) {
    const recentQuantities = new Set(
      recentCandidates.slice(0, 2).map((candidate) => Number(candidate[1])),
    );
    const alternativeQuantity = choices.filter(
      (candidate) => !recentQuantities.has(candidate.quantity),
    );
    if (alternativeQuantity.length) choices = alternativeQuantity;
    const alternativeRadix = choices.filter(
      (candidate) => candidate.targetRadix !== Number(recentCandidate[2]),
    );
    if (alternativeRadix.length) choices = alternativeRadix;
  }

  const selected = choices[seededHash(seed) % choices.length],
    startChoices = PACK_RADICES.filter(
      (radix) => radix !== selected.targetRadix && radix <= selected.quantity,
    ),
    eligibleStarts = startChoices.length
      ? startChoices
      : PACK_RADICES.filter((radix) => radix !== selected.targetRadix),
    startRadix = eligibleStarts[
      seededHash(`${seed}|pack-start`) % eligibleStarts.length
    ];
  return { ...structuredClone(selected), difficulty, seed, startRadix };
}

export const PROBLEM_BANK = bank;
export function generateProblem(
  ruleId,
  difficulty = 1,
  seed = 0,
  recentHistory = [],
) {
  if (!bank[ruleId]) throw new RangeError("Unknown rule");
  if (ruleId === "pack") {
    difficulty = Math.max(1, Math.min(5, Math.trunc(difficulty) || 1));
    return selectPackProblem(difficulty, seed, recentHistory);
  }
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
  const result = structuredClone(choices[seededHash(seed) % choices.length]);
  return { ...result, difficulty, seed };
}
