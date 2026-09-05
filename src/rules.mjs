export const AREAS = [
  { id: 'spark', name: 'スパーク', en: 'SPARK', verb: 'あわせて、ぴったり！', detail: 'たす・ひく・まとまりをつくる', color: '#f5c968', icon: '✦', intro: 'かずを あわせて、シールドを こわそう。' },
  { id: 'link', name: 'リンク', en: 'LINK', verb: 'そろえて、れんしゃ！', detail: 'かける・わける・あまりをみつける', color: '#72dfc2', icon: '⠿', intro: 'おなじ かずずつ ならべて、れんしゃしよう。' },
  { id: 'gear', name: 'ギア', en: 'GEAR', verb: 'みつけて、れんけい！', detail: '約数・共通のまとまり・最大公約数', color: '#86b6ff', icon: '⚙', intro: '2つのコアに共通する、分け方を探そう。' },
  { id: 'core', name: 'コア', en: 'CORE', verb: 'みぬいて、かくしんへ！', detail: '素数・素因数分解・平方数', color: '#c4a0ff', icon: '◇', intro: '数の中にかくれた、素数の構造を見抜こう。' },
];
const spark = (title, ammo, reserve, target, hint) => ({ kind: 'spark', title, ammo, reserve, target, hint });
const link = (title, n, rule, target, hint) => ({ kind: 'link', title, n, rule, target, hint });
const gear = (title, numbers, largest, hint) => ({ kind: 'gear', title, numbers, largest, hint });
const core = (title, n, square = false) => ({ kind: 'core', title, n, square, hint: square ? '素数で分解したあと、同じ積の2組をつくろう。' : '素数の大きさで分けよう。残りも素数になったら PRIME！' });
export const MISSIONS = {
  spark: [
    spark('あと 2 で！', [5, 3], [2, 1, 4], 10, 'てもちの かたまりを おすと、たせるよ。'),
    spark('2 こ はずそう', [10, 2], [1, 3], 10, 'たまの かたまりを おすと、てもとに もどるよ。'),
    spark('2つを あわせて', [4], [3, 3, 5], 10, 'かたまりは いくつでも つかえるよ。'),
    spark('5 の ちから', [2], [3, 1, 4], 5, '5 の まとまりを つくろう。'),
    spark('10 を こえて', [10, 3], [2, 1, 4], 15, '10 の かたまりを のこして、あと いくつ？'),
    spark('おおきな かたまり', [10, 5, 3], [1, 2], 13, 'ひとつずつ かぞえず、かたまりを はずしてみよう。'),
    spark('2れん チャージ', [5], [5, 5, 3], 15, '2つの かたまりを あわせて チャージ。'),
    spark('いれかえよう', [10, 4], [5, 2], 15, 'はずしてから たすと、ぴったりに できるよ。'),
    spark('ダブル・スパーク', [10, 3], [5, 2, 4], 20, '10 を 2つぶん！ さいごの シールドだ。'),
  ],
  link: [
    link('3こずつの たま', 12, 'size', 3, '1ぱつの 中に いくつ入れるか えらぼう。'),
    link('4はつの れんしゃ', 20, 'shots', 4, 'ぜんぶ つかって、4はつに わけよう。'),
    link('べつの ならべかた', 12, 'exact', null, '2こずつ？ 3こずつ？ あまらなければ OK。'),
    link('ペアの ひみつ', 14, 'parity', 2, '2こずつにしたとき、あまりがなければ「ぐうすう」。'),
    link('ひとり のこる？', 15, 'parity', 2, '2こずつにしたとき、1このこれば「きすう」。'),
    link('あまりも はっけん', 13, 'remainder', 3, '3こずつにして、のこったドットの数をえらぼう。'),
    link('5こずつに わけよう', 23, 'remainder', 5, 'のこったドットは、たまの外に見えるよ。'),
    link('6はつの シールド', 42, 'shots', 6, 'おなじ大きさの たまを、6はつつくろう。'),
    link('リンク・バースト', 36, 'exact', null, 'あまりなしで、すきな れんしゃを つくろう。'),
  ],
  gear: [
    gear('ふたつの コア', [12, 18], false, '両方を同じ大きさで、余りなく分けよう。'),
    gear('別の連携ルート', [16, 24], false, '2以外にも、共通する分け方がある。'),
    gear('3のつながり', [15, 21], false, '片方だけでなく、両方の余りを見よう。'),
    gear('最大の一撃', [18, 24], true, '両方を分けられる、いちばん大きな数は？'),
    gear('ギアを広げて', [20, 30], true, '大きな共通のまとまりほど、一発が大きくなる。'),
    gear('同じかたち', [24, 36], true, '並べ直しは何度でもできる。'),
    gear('小さな共通点', [14, 25], true, '大きなまとまりが合わないときは、1も試そう。'),
    gear('連携の分かれ道', [30, 45], false, '共通の約数なら、どの分け方でも突破できる。'),
    gear('ギア・オーバードライブ', [36, 48], true, '最大公約数で、2つのコアを連携させよう。'),
  ],
  core: [
    core('素数のかけら', 12), core('PRIMEを見抜け', 13), core('別の分解ルート', 30),
    core('同じ素数がひそむ', 18), core('素数のシールド', 35), core('かくれた素数', 77),
    core('スクエア・ロック', 36, true), core('ふたつの同じ積', 100, true), core('コア・ブレイク', 144, true),
  ],
};
export const sum = values => values.reduce((a, b) => a + b, 0);
export function isPrime(n) {
  if (!Number.isInteger(n) || n < 2) return false;
  for (let p = 2; p * p <= n; p++) if (n % p === 0) return false;
  return true;
}
export function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
export function groups(n, size) {
  if (!Number.isInteger(n) || n < 0 || !Number.isInteger(size) || size < 1) throw new RangeError('Invalid grouping');
  return { count: Math.floor(n / size), rest: n % size };
}
export function createState(area, index = 0) {
  const mission = MISSIONS[area]?.[index];
  if (!mission) throw new RangeError('Unknown mission');
  return {
    area, index, mission, size: area === 'gear' ? 2 : area === 'core' ? 2 : 3,
    ammo: [...(mission.ammo || [])], reserve: [...(mission.reserve || [])],
    n: mission.n, factors: [], remainder: null, parity: null, squareSide: [],
    phase: 'play', misses: 0, moves: 0, attacks: 0, equation: '', feedback: mission.hint,
  };
}
export function moveChunk(state, source, index) {
  if (state.phase !== 'play' || state.area !== 'spark' || !['ammo', 'reserve'].includes(source)) return false;
  const from = state[source], to = state[source === 'ammo' ? 'reserve' : 'ammo'];
  if (!Number.isInteger(index) || index < 0 || index >= from.length) return false;
  const before = sum(state.ammo), [value] = from.splice(index, 1);
  to.push(value); state.moves++;
  state.equation = `${before} ${source === 'reserve' ? '+' : '−'} ${value} = ${sum(state.ammo)}`;
  return true;
}
export function splitChunk(state, source, index) {
  if (state.phase !== 'play' || state.area !== 'spark' || !['ammo', 'reserve'].includes(source)) return false;
  const value = state[source][index];
  if (!Number.isInteger(index) || !value || value === 1) return false;
  state[source].splice(index, 1, ...Array(value).fill(1)); state.moves++;
  state.equation = `${value} = ${Array(value).fill(1).join(' + ')}`;
  return true;
}
export function chooseSize(state, size) {
  const limit = state.area === 'gear' ? Math.min(...state.mission.numbers) : state.area === 'core' ? Math.min(19, state.n - 1) : 9;
  const minimum = state.area === 'gear' ? 1 : 2;
  if (state.phase !== 'play' || !Number.isInteger(size) || size < minimum || size > limit) return false;
  state.size = size; state.remainder = null; state.parity = null; state.moves++; return true;
}
function miss(state, reason) {
  state.misses++;
  if (['gear', 'core'].includes(state.area) && state.misses >= 4) state.phase = 'lost';
  state.feedback = reason;
  return { ok: false, reason, lost: state.phase === 'lost' };
}
function win(state, equation) {
  state.phase = 'won'; state.equation = equation; state.feedback = 'シールド突破！';
  return { ok: true, complete: true, equation };
}
export function fire(state, action = 'group') {
  if (!['play', 'square'].includes(state.phase)) return { ok: false, ignored: true };
  const m = state.mission, f = state.size;
  if (m.rule === 'remainder' && state.remainder === null) return { ok: false, incomplete: true, reason: 'のこった数をえらぼう。' };
  if (m.rule === 'parity' && state.parity === null) return { ok: false, incomplete: true, reason: 'ぐうすう・きすうをえらぼう。' };
  state.attacks++;
  if (m.kind === 'spark') {
    const n = sum(state.ammo);
    return n === m.target ? win(state, `${m.target} = ${state.ammo.join(' + ')}`) : miss(state, n < m.target ? `あと ${m.target - n} こ。ドットを たしてみよう。` : `${n - m.target} こ おおいよ。はずしてみよう。`);
  }
  if (m.kind === 'link') {
    const { count, rest } = groups(m.n, f);
    const equation = `${m.n} = ${f} × ${count}${rest ? ` + ${rest}` : ''}`;
    state.equation = equation;
    let correct = false;
    if (m.rule === 'exact') correct = rest === 0;
    if (m.rule === 'size') correct = f === m.target && rest === 0;
    if (m.rule === 'shots') correct = count === m.target && rest === 0;
    if (m.rule === 'remainder') correct = f === m.target && state.remainder === rest;
    if (m.rule === 'parity') correct = f === 2 && state.parity === (m.n % 2 ? 'odd' : 'even');
    return correct ? win(state, equation) : miss(state, 'シールドの条件と、たまの大きさ・のこりを見くらべよう。');
  }
  if (m.kind === 'gear') {
    const [a, b] = m.numbers;
    state.equation = m.numbers.map(n => `${n} = ${f} × ${Math.floor(n / f)}${n % f ? ` + ${n % f}` : ''}`).join(' ／ ');
    if (a % f || b % f) return miss(state, '余りがあるコアがある。両方をぴったり分けよう。');
    if (m.largest && f !== gcd(a, b)) return miss(state, '共通の約数を発見！ このシールドには、さらに大きいまとまりが必要。');
    return win(state, state.equation);
  }
  if (state.phase === 'square') {
    const left = state.squareSide.reduce((p, i) => p * state.factors[i], 1);
    const selected = new Set(state.squareSide);
    const right = state.factors.reduce((p, v, i) => selected.has(i) ? p : p * v, 1);
    if (left !== right) return miss(state, `積が ${left} と ${right}。同じ積の2組に分けよう。`);
    return win(state, `${m.n} = ${state.factors.join(' × ')} = ${left} × ${right}`);
  }
  if (action === 'prime') {
    if (!isPrime(state.n)) return miss(state, state.n === 1 ? '1は素数ではないよ。' : 'まだ分けられる。素数は、1と自分以外では割り切れない数。');
    state.factors.push(state.n);
    state.equation = `${m.n} = ${state.factors.join(' × ')}`;
    if (m.square) {
      state.phase = 'square'; state.squareSide = [];
      state.feedback = '素数を左右に分けて、同じ積を2組つくろう。';
      return { ok: true, square: true, equation: state.equation };
    }
    return win(state, state.equation);
  }
  if (!isPrime(f)) return miss(state, 'このエリアの弾は素数だけ。別の大きさを試そう。');
  if (f >= state.n || state.n % f) return miss(state, 'この素数では分けきれない。残りが素数なら PRIME！');
  state.factors.push(f); state.n /= f;
  state.equation = `${m.n} = ${[...state.factors, state.n].join(' × ')}`;
  state.feedback = '分解成功！ 残りも分ける？ それとも PRIME？';
  state.size = 2;
  return { ok: true, complete: false, equation: state.equation };
}
export function reward(state) { return Math.max(1, 3 - Math.min(2, state.misses)); }
