import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, MISSIONS, createState, moveChunk, splitChunk, chooseSize, fire, groups, sum, isPrime, gcd, reward } from '../src/rules.mjs';

function solveCore(s) {
  while (!isPrime(s.n)) {
    const f = Array.from({ length: s.n - 2 }, (_, i) => i + 2).find(v => isPrime(v) && s.n % v === 0);
    assert.ok(chooseSize(s, f));
    assert.equal(fire(s).ok, true);
    assert.equal(s.factors.reduce((a, b) => a * b, 1) * s.n, s.mission.n);
  }
  const r = fire(s, 'prime');
  if (!s.mission.square) return r;
  assert.equal(s.phase, 'square');
  const seen = {};
  s.squareSide = s.factors.flatMap((p, i) => { seen[p] = (seen[p] || 0) + 1; return seen[p] % 2 ? [i] : []; });
  return fire(s);
}

test('every one of the 36 missions is solvable with exposed controls', () => {
  assert.equal(Object.values(MISSIONS).flat().length, 36);
  for (const a of AREAS) for (let i = 0; i < MISSIONS[a.id].length; i++) {
    const s = createState(a.id, i), m = s.mission;
    if (a.id === 'spark') {
      while (s.ammo.length) moveChunk(s, 'ammo', 0);
      for (let j = s.reserve.length - 1; j >= 0; j--) splitChunk(s, 'reserve', j);
      for (let j = 0; j < m.target; j++) assert.ok(moveChunk(s, 'reserve', 0));
      assert.equal(fire(s).ok, true);
    } else if (a.id === 'core') assert.equal(solveCore(s).ok, true);
    else {
      const candidates = a.id === 'gear' ? Array.from({ length: Math.min(...m.numbers) }, (_, j) => j + 1) : [2,3,4,5,6,7,8,9];
      const valid = candidates.filter(f => {
        const t = createState(a.id, i); chooseSize(t, f);
        t.remainder = m.n % f; t.parity = m.n % 2 ? 'odd' : 'even';
        return fire(t).ok;
      });
      assert.ok(valid.length, `${a.id}/${i + 1} needs a solution`);
      chooseSize(s, valid[0]); s.remainder = m.n % valid[0]; s.parity = m.n % 2 ? 'odd' : 'even';
      assert.equal(fire(s).ok, true);
    }
    assert.equal(s.phase, 'won', `${a.id}/${i + 1}`);
    assert.equal(reward(s), 3);
  }
});

test('spark additions, removals, splits and retries conserve every dot', () => {
  const s = createState('spark'), total = sum(s.ammo) + sum(s.reserve);
  for (let i = 0; i < 100; i++) {
    const source = i % 2 ? 'ammo' : 'reserve';
    if (i % 3 === 0) splitChunk(s, source, 0); else moveChunk(s, source, 0);
    assert.equal(sum(s.ammo) + sum(s.reserve), total);
  }
  assert.equal(s.misses, 0);
  const bad = createState('spark');
  for (let i = 0; i < 10; i++) fire(bad);
  assert.equal(bad.phase, 'play');
  assert.equal(sum(bad.ammo) + sum(bad.reserve), total);
  assert.equal(moveChunk(bad, 'ammo', -1), false);
  assert.equal(moveChunk(bad, 'other', 0), false);
});

test('opening spark stages exercise +2, −2 and two chunks', () => {
  let s = createState('spark', 0); moveChunk(s, 'reserve', 0); assert.equal(s.equation, '8 + 2 = 10'); assert.equal(fire(s).ok, true);
  s = createState('spark', 1); moveChunk(s, 'ammo', 1); assert.equal(s.equation, '12 − 2 = 10'); assert.equal(fire(s).ok, true);
  s = createState('spark', 2); moveChunk(s, 'reserve', 0); moveChunk(s, 'reserve', 0); assert.equal(fire(s).ok, true);
});

test('all grouping previews conserve quantity including remainder', () => {
  for (let n = 0; n <= 144; n++) for (let f = 1; f <= 48; f++) {
    const g = groups(n, f); assert.equal(g.count * f + g.rest, n); assert.ok(g.rest < f);
  }
  assert.throws(() => groups(12, 0), RangeError);
});

test('remainder and parity missions need an answer; missing is never damage', () => {
  const s = createState('link', 5);
  assert.equal(fire(s).incomplete, true); assert.equal(s.misses, 0); assert.equal(s.attacks, 0);
  s.remainder = 1; assert.equal(fire(s).ok, true);
  const t = createState('link', 4); chooseSize(t, 2); t.parity = 'even'; assert.equal(fire(t).ok, false);
  t.parity = 'odd'; assert.equal(fire(t).ok, true);
});

test('alternate exact groupings and common divisors are accepted', () => {
  for (const f of [2,3,4,6]) {
    const s = createState('link', 2); chooseSize(s, f); assert.equal(fire(s).ok, true);
  }
  for (const f of [1,2,3,6]) {
    const s = createState('gear', 0); chooseSize(s, f); assert.equal(fire(s).ok, true);
  }
  const s = createState('gear', 3); chooseSize(s, 3); assert.equal(fire(s).ok, false);
  chooseSize(s, 6); assert.equal(fire(s).ok, true);
  const t = createState('gear', 6); chooseSize(t, 1); assert.equal(fire(t).ok, true); assert.equal(gcd(14,25), 1);
});

test('advanced lanes lose after exactly four wrong shots; edits are free', () => {
  for (const area of ['gear', 'core']) {
    const s = createState(area);
    for (let i = 0; i < 50; i++) chooseSize(s, 5);
    assert.equal(s.misses, 0);
    for (let i = 0; i < 3; i++) { assert.equal(fire(s).ok, false); assert.equal(s.phase, 'play'); }
    assert.equal(fire(s).lost, true); assert.equal(s.phase, 'lost');
    assert.equal(fire(s).ignored, true); assert.equal(s.misses, 4);
  }
});

test('prime rules reject 0, 1 and composites, and preserve factor products', () => {
  for (const n of [-1,0,1,4,9,15,2.5]) assert.equal(isPrime(n), false);
  for (const n of [2,3,7,13,19]) assert.equal(isPrime(n), true);
  const s = createState('core', 0); chooseSize(s, 4); assert.equal(fire(s).ok, false);
  assert.equal(fire(s, 'prime').ok, false); chooseSize(s, 3); assert.equal(fire(s).ok, true);
  assert.equal(s.n, 4); assert.deepEqual(s.factors, [3]); chooseSize(s, 2); assert.equal(fire(s).ok, true);
  assert.equal(s.n, 2); assert.equal(fire(s, 'prime').complete, true); assert.equal(s.phase, 'won');
  assert.equal(fire(s, 'prime').ignored, true);
});

test('square phase compares products, including repeated prime tokens', () => {
  const s = createState('core', 6);
  for (const f of [2,2,3]) { chooseSize(s, f); assert.equal(fire(s).ok, true); }
  assert.equal(fire(s, 'prime').square, true);
  assert.deepEqual(s.factors, [2,2,3,3]);
  assert.equal(fire(s).ok, false); assert.equal(s.phase, 'square');
  s.squareSide = [0,2]; assert.equal(fire(s).complete, true);
  assert.match(s.equation, /6 × 6$/);
});

test('state creation never mutates mission data or another run', () => {
  const a = createState('spark'), b = createState('spark');
  moveChunk(a, 'reserve', 0); assert.deepEqual(b.reserve, [2,1,4]);
  assert.deepEqual(MISSIONS.spark[0].reserve, [2,1,4]);
  assert.throws(() => createState('unknown')); assert.throws(() => createState('spark', 99));
});
