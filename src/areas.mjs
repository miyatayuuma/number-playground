import { AREAS, MISSIONS, createState, moveChunk, splitChunk, chooseSize, fire, groups, sum, reward } from './rules.mjs';

const app = document.querySelector('#app');
const STORAGE = 'core-break-adventure-v1';
let progress = {}, storageAvailable = true, state = null, busy = false, generation = 0;
let sound = false, audio;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE) || '{}');
  for (const area of AREAS) {
    progress[area.id] = MISSIONS[area.id].map((_, i) => Number.isInteger(saved?.[area.id]?.[i]) && saved[area.id][i] >= 1 && saved[area.id][i] <= 3 ? saved[area.id][i] : 0);
  }
} catch { storageAvailable = false; }
for (const area of AREAS) progress[area.id] ||= Array(MISSIONS[area.id].length).fill(0);
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const areaOf = id => AREAS.find(a => a.id === id);
const dots = (n, extra = '') => `<span class="dot-field ${extra}" aria-hidden="true">${'<i class="unit-dot"></i>'.repeat(n)}</span>`;
const selected = yes => yes ? 'true' : 'false';
const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n);
function tone(good = true) {
  if (!sound) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audio ||= new Audio();
    audio.resume().catch(() => {});
    for (let i = 0; i < (good ? 3 : 1); i++) {
      const o = audio.createOscillator(), gain = audio.createGain(), t = audio.currentTime + i * .075;
      o.type = 'sine'; o.frequency.value = good ? [440, 554, 660][i] : 180;
      gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(.035, t + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, t + .18);
      o.connect(gain).connect(audio.destination); o.start(t); o.stop(t + .2);
    }
  } catch { /* Sound is optional. */ }
}
document.querySelector('#sound').addEventListener('click', e => {
  sound = !sound; e.currentTarget.textContent = `音 ${sound ? 'ON' : 'OFF'}`;
  e.currentTarget.setAttribute('aria-pressed', selected(sound));
  e.currentTarget.setAttribute('aria-label', sound ? '音を消す' : '音を出す');
  if (sound) tone();
});
function saveWin() {
  const list = progress[state.area]; list[state.index] = Math.max(list[state.index], reward(state));
  try { localStorage.setItem(STORAGE, JSON.stringify(progress)); } catch { storageAvailable = false; }
}
function heroArt() {
  return `<div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><span class="orbit-label">BUILD · LINK · BREAK</span><div class="hero-cluster cluster-a">${dots(5)}</div><span class="hero-plus">+</span><div class="hero-cluster cluster-b">${dots(3)}</div><div class="hero-core"><span>CORE</span><strong>8</strong>${dots(8)}</div><span class="art-coordinate">01 / ∞</span></div>`;
}
function home() {
  document.body.dataset.screen = 'home';
  state = null;
  document.documentElement.style.setProperty('--accent', '#f5c968');
  const cleared = Object.values(progress).flat().filter(Boolean).length;
  app.innerHTML = `<section class="hero"><div class="hero-copy"><p class="eyebrow"><span class="live-dot"></span> 数のちからで、突破せよ。</p><h1>そのドットが、<br>きみの<span>武器になる。</span></h1><p class="hero-description">あわせる。そろえる。ひみつを見抜く。<br>4つのエリアで、数の新しいちからを手に入れよう。</p><div class="hero-notes"><span>時間制限なし</span><span>どこからでも遊べる</span></div></div>${heroArt()}</section>
    <section class="worlds" aria-labelledby="worlds-heading"><div class="section-heading"><div><p class="eyebrow">SELECT YOUR AREA</p><h2 id="worlds-heading">エリアをえらぼう</h2></div><span class="overall-progress">${String(cleared).padStart(2, '0')} <small>/ 36 CLEAR</small></span></div><div class="world-grid">${AREAS.map((a, i) => {
    const count = progress[a.id].filter(Boolean).length;
    return `<a class="world-card" href="#${a.id}" style="--card-accent:${a.color}"><div class="world-card-top"><span class="world-number">0${i + 1} / ${a.en}</span><span class="world-icon" aria-hidden="true">${a.icon}</span></div><h3>${a.name}</h3><p class="world-verb">${a.verb}</p><p class="world-detail">${a.detail}</p><div class="world-bottom"><span class="mini-progress" aria-label="${count}ステージクリア">${MISSIONS[a.id].map((_, j) => `<i class="${progress[a.id][j] ? 'filled' : ''}"></i>`).join('')}</span><span class="world-arrow" aria-hidden="true">↗</span></div></a>`;
  }).join('')}</div></section><aside class="classic-banner"><div><span class="eyebrow">ORIGINAL CHALLENGE</span><h2>いつもの、コアブレイク。</h2><p>CASUAL / NORMAL / EXPERT / BLITZ</p></div><a class="outline-button" href="classic.html">クラシックで遊ぶ ↗</a></aside>${storageAvailable ? '' : '<p class="storage-note">クリア記録は、この画面を開いている間だけ残ります。</p>'}`;
}
function stageMenu(id) {
  document.body.dataset.screen = 'menu';
  state = null;
  const a = areaOf(id), scores = progress[id], next = scores.findIndex(v => !v);
  document.documentElement.style.setProperty('--accent', a.color);
  app.innerHTML = `<section class="area-menu"><a class="back-link" href="#">← エリアをえらぶ</a><div class="area-title"><span class="large-icon" aria-hidden="true">${a.icon}</span><div><p class="eyebrow">${a.en} / 9 STAGES</p><h1>${a.name}</h1><p>${a.intro}</p></div></div><div class="area-rules"><span>◉ ${id === 'spark' || id === 'link' ? 'まちがえても、くみなおせる' : '誤発射4回で敗北・同じ問題で再挑戦'}</span><span>◷ 時間制限なし</span><span>✦ 発射まで、何度でも試せる</span></div><a class="primary continue-button" href="#${id}/${(next < 0 ? 0 : next) + 1}">${next > 0 ? 'つづきから' : next < 0 ? 'もういちど' : 'はじめる'} <span>→</span></a><div class="stage-grid">${MISSIONS[id].map((m, i) => `<a class="stage-card ${scores[i] ? 'cleared' : ''}" href="#${id}/${i + 1}"><span class="stage-number">${String(i + 1).padStart(2, '0')}</span><div><span class="stage-tier">${['はじめの一歩', '技をひろげる', '最後のシールド'][Math.floor(i / 3)]}</span><h2>${m.title}</h2></div><span class="stage-stars" aria-label="星${scores[i]}個">${stars(scores[i])}</span></a>`).join('')}</div><p class="menu-note">すきなステージから遊べます。星は発射の成功で獲得。組み替えは何度でも。</p></section>`;
}
function objective() {
  const m = state.mission;
  if (m.kind === 'spark') return `${m.target} こに あわせよう`;
  if (m.kind === 'gear') return m.largest ? '最大の共通のまとまりで突破' : '両方を同じ大きさで、余りなく';
  if (m.kind === 'core') return state.phase === 'square' ? '同じ積の2組で、正方形をつくれ' : m.square ? '素数に分解 → スクエアをつくれ' : '素数で分解 → PRIMEで突破';
  return { size: `${m.target} こずつ・あまりなし`, shots: `${m.target} はつ・あまりなし`, exact: 'すきな大きさで・あまりなし', remainder: `${m.target} こずつ・のこりはいくつ？`, parity: '2こずつ・ぐうすう？ きすう？' }[m.rule];
}
function enemySVG() {
  return `<svg viewBox="0 0 140 120" class="sentinel" aria-hidden="true"><path class="sentinel-wing" d="M29 26 8 46l10 42 22 7M111 26l21 20-10 42-22 7"/><path class="sentinel-face" d="m70 10 38 22 10 45-28 30H50L22 77l10-45Z"/><path class="sentinel-brow" d="m35 48 26 9-10 14-16-4m70-19-26 9 10 14 16-4"/><path class="sentinel-mark" d="m60 84 10 6 10-6M70 22v11"/></svg>`;
}
function chip(n, source, i) {
  return `<div class="chunk-wrap"><button type="button" class="chunk shot" data-action="move" data-source="${source}" data-index="${i}" aria-label="${n}こを${source === 'ammo' ? 'はずす' : 'たす'}">${dots(n)}<span><b>${n}</b><small>${source === 'ammo' ? '− はずす' : '＋ たす'}</small></span></button>${n > 1 ? `<button type="button" class="split-button" data-action="split" data-source="${source}" data-index="${i}" aria-label="${n}このかたまりを1こずつにばらす">ばらす</button>` : ''}</div>`;
}
function sparkBoard() {
  return `<div class="tray-label"><h2>たま <strong>${sum(state.ammo)}</strong><small>こ</small></h2><span>おすと、はずせる ↓</span></div><div class="ammo-tray" data-testid="ammo">${state.ammo.length ? state.ammo.map((v, i) => chip(v, 'ammo', i)).join('') : '<p class="empty-tray">てもちから ドットを たそう</p>'}</div><div class="tray-label reserve-label"><h2>てもち <strong>${sum(state.reserve)}</strong><small>こ</small></h2><span>おすと、たせる ↑</span></div><div class="reserve-tray" data-testid="reserve">${state.reserve.length ? state.reserve.map((v, i) => chip(v, 'reserve', i)).join('') : '<p class="empty-tray">ぜんぶ たまに なったよ</p>'}</div>`;
}
function groupBoard(n, size, unit = 1, label = '') {
  const { count, rest } = groups(n, size);
  const unitHTML = () => unit === 1 ? '<i class="unit-dot"></i>' : `<span class="nested-unit">${dots(unit)}</span>`;
  const shots = Array.from({ length: count }, () => `<span class="shot group-shot ${unit > 1 ? 'nested-shot' : ''}" aria-label="${size * unit}個のドット">${Array.from({ length: size }, unitHTML).join('')}</span>`).join('');
  const remaining = Array.from({ length: rest }, unitHTML).join('');
  return `<section class="core-tray"><div class="tray-label"><h2>${label || 'ドット'} <strong>${n * unit}</strong><small>こ</small></h2><span>${unit > 1 ? `${n}まとまり × ${unit}こ` : `${size}こずつの たま`}</span></div><div class="group-tray" data-total="${n * unit}">${shots}${rest ? `<span class="remainder-box"><small>のこり</small><span class="remainder-dots">${remaining}</span></span>` : ''}</div><p class="group-caption">${count} ${unit > 1 ? '組' : 'はつ'}${unit > 1 ? `（1組 = ${size}まとまり）` : ''}<span>のこりは ${rest} ${unit > 1 ? 'まとまり' : 'こ'}</span></p></section>`;
}
function factorTrail() {
  return `<div class="factor-trail"><span>分解ルート</span><strong>${state.mission.n}</strong><span>=</span>${[...state.factors, ...(state.phase === 'play' ? [state.n] : [])].map((f, i) => `${i ? '<span>×</span>' : ''}<b>${f}</b>`).join('')}</div>`;
}
function squareBoard() {
  const left = state.squareSide.reduce((p, i) => p * state.factors[i], 1);
  const right = state.factors.reduce((p, v, i) => state.squareSide.includes(i) ? p : p * v, 1);
  const pitch = Math.min(12, 240 / right, 160 / left);
  return `${factorTrail()}<p class="board-help">素数のチップをおすと、反対の組に移せます。</p><div class="factor-sides">${[false, true].map((isLeft, sideIndex) => {
    const value = isLeft ? left : right;
    return `<section><h2>${sideIndex ? 'B' : 'A'}の組 <strong>積 ${value}</strong></h2><div class="factor-chips">${state.factors.map((f, i) => state.squareSide.includes(i) === isLeft ? `<button class="factor-chip" data-action="factor" data-index="${i}" aria-label="素数${f}を反対の組へ">${f}<small>↔</small></button>` : '').join('') || '<span class="empty-factor">空の組の積は 1</span>'}</div></section>`;
  }).join('')}</div><p class="rectangle-equation">${right} × ${left} = ${state.mission.n}</p><div class="rectangle-preview" style="--columns:${right};--dot-size:${pitch * .7}px;--dot-gap:${pitch * .3}px" aria-label="横${right}個、縦${left}個、全部で${state.mission.n}個のドット">${'<i class="unit-dot"></i>'.repeat(state.mission.n)}</div><p class="board-help">積を同じにして、スクエア・ロックを解除しよう。</p>`;
}
function sizeControls() {
  const max = state.area === 'gear' ? Math.min(...state.mission.numbers) : state.area === 'core' ? Math.min(19, state.n - 1) : 9;
  const min = state.area === 'gear' ? 1 : 2;
  return `<fieldset class="size-control"><legend>${state.area === 'core' ? '素数の大きさで分ける' : '1ぱつの 大きさをえらぶ'}</legend><div class="size-options">${Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => i + min).map(n => `<button type="button" data-action="size" data-value="${n}" aria-pressed="${selected(state.size === n)}">${n}</button>`).join('')}</div></fieldset>`;
}
function answerControls() {
  const m = state.mission;
  if (m.rule === 'remainder') return `<fieldset class="answer-control"><legend>のこった数は？</legend><div class="size-options">${Array.from({ length: state.size }, (_, n) => `<button data-action="remainder" data-value="${n}" aria-pressed="${selected(state.remainder === n)}">${n}</button>`).join('')}</div></fieldset>`;
  if (m.rule === 'parity') return `<fieldset class="answer-control"><legend>この数は？</legend><div class="parity-options"><button data-action="parity" data-value="even" aria-pressed="${selected(state.parity === 'even')}">ぐうすう<span>ペアで ぴったり</span></button><button data-action="parity" data-value="odd" aria-pressed="${selected(state.parity === 'odd')}">きすう<span>ひとり のこる</span></button></div></fieldset>`;
  return '';
}
function resultPanel() {
  const won = state.phase === 'won', a = areaOf(state.area), last = state.index === MISSIONS[state.area].length - 1;
  return `<section class="result-panel ${won ? 'victory' : 'defeat'}" tabindex="-1"><p class="eyebrow">${won ? 'SHIELD BROKEN' : 'TRY AGAIN'}</p><h2>${won ? last ? `${a.name} 突破！` : 'やった！ シールド突破！' : 'もういちど、作戦を立てよう。'}</h2>${won ? `<div class="result-stars" aria-label="星${reward(state)}個">${stars(reward(state))}</div><p class="result-equation">${escape(state.equation)}</p>${state.mission.square ? `<div class="completed-square" style="--columns:${Math.sqrt(state.mission.n)}" aria-label="${Math.sqrt(state.mission.n)}かける${Math.sqrt(state.mission.n)}の正方形">${'<i class="unit-dot"></i>'.repeat(state.mission.n)}</div>` : ''}` : `<p>${escape(state.feedback)}</p>`}<div class="result-actions">${won ? `<a class="primary" href="#${state.area}${last ? '' : `/${state.index + 2}`}">${last ? 'ステージをえらぶ' : 'つぎのステージ'} →</a>` : ''}<button class="${won ? 'outline-button' : 'primary'}" data-action="retry">${won ? 'もういちど遊ぶ' : '同じ問題で再挑戦'}</button><a class="quiet" href="#">エリアをえらぶ</a></div>${storageAvailable ? '' : '<p class="storage-note">このブラウザでは記録を保存できません。画面を閉じると記録が消えます。</p>'}</section>`;
}
function renderBattle(keepFocus = true) {
  document.body.dataset.screen = 'battle';
  const focus = keepFocus && app.contains(document.activeElement) ? { ...document.activeElement.dataset } : null;
  const a = areaOf(state.area), m = state.mission, terminal = ['won', 'lost'].includes(state.phase), hard = ['gear', 'core'].includes(state.area);
  document.documentElement.style.setProperty('--accent', a.color);
  const board = terminal ? resultPanel() : state.area === 'spark' ? sparkBoard() : state.phase === 'square' ? squareBoard() : state.area === 'gear' ? m.numbers.map((n, i) => groupBoard(n, state.size, 1, `コア ${i ? 'B' : 'A'}`)).join('') : `${state.area === 'core' ? factorTrail() : ''}${groupBoard(state.n, state.size, state.area === 'core' ? m.n / state.n : 1)}`;
  app.innerHTML = `<section class="battle-page"><nav class="battle-nav"><a class="back-link" href="#${state.area}">← ${a.name}</a><span>${String(state.index + 1).padStart(2, '0')} <small>/ 09</small></span><a class="quiet" href="#">エリア</a></nav><div class="mission-heading"><p class="eyebrow">${a.en} / STAGE ${state.index + 1}</p><h1>${m.title}</h1></div><div class="battle-frame"><section class="enemy-zone ${terminal && state.phase === 'won' ? 'enemy-defeated' : ''}"><div class="enemy-orbit"></div>${enemySVG()}<div class="enemy-info"><span class="eyebrow">${state.index === 8 ? 'AREA GUARDIAN' : 'SHIELD SENTINEL'}</span><p class="shield-condition">${objective()}</p>${state.area === 'spark' ? `<div class="target-dots" aria-label="目標${m.target}個">${dots(m.target, 'target-field')}</div>` : ''}<div class="battle-status">${hard ? `<span class="health" aria-label="シールド残り${Math.max(0, 4 - state.misses)}"><span>自分のシールド</span>${Array.from({ length: 4 }, (_, i) => `<i class="${i < 4 - state.misses ? 'active' : ''}"></i>`).join('')}</span>` : '<span>✦ なんどでも、くみなおせる</span>'}</div></div></section><div class="battle-workspace">${board}</div>${terminal ? '' : `<div class="control-deck">${state.area !== 'spark' && state.phase !== 'square' ? sizeControls() + answerControls() : ''}<div class="feedback" role="status" aria-live="polite"><p>${escape(state.feedback)}</p>${state.equation ? `<span class="equation">${escape(state.equation)}</span>` : ''}</div><div class="fire-row"><button class="quiet reset-button" data-action="reset">組み直す ↺</button><button class="primary fire-button" data-action="fire">${state.phase === 'square' ? 'スクエア発射' : 'はっしゃ！'} <span>↗</span></button>${state.area === 'core' && state.phase === 'play' ? '<button class="prime-button" data-action="prime">PRIME <span>素数で必殺</span></button>' : ''}</div><p class="control-note">${state.area === 'core' ? '1は素数ではありません。まとまりの中も、1ドット＝1。' : 'ドット1こが「1」。発射するまで、何度でも試せます。'}</p></div>`}</div></section>`;
  if (terminal) app.querySelector('.result-panel').focus({ preventScroll: true });
  else if (focus?.action) {
    const target = [...app.querySelectorAll('[data-action]')].find(el => Object.entries(focus).every(([k, v]) => el.dataset[k] === v));
    target?.focus({ preventScroll: true });
  }
}
function resetArrangement() {
  const fresh = createState(state.area, state.index);
  // Rearranging never erases a shot, damage, or an earned factor.
  if (state.area === 'spark') { state.ammo = fresh.ammo; state.reserve = fresh.reserve; }
  state.size = fresh.size; state.remainder = null; state.parity = null; state.squareSide = [];
  state.feedback = state.phase === 'square' ? '素数を分けて、同じ積の2組をつくろう。' : state.mission.hint;
  state.equation = state.area === 'core' ? `${state.mission.n} = ${[...state.factors, ...(state.phase === 'square' ? [] : [state.n])].join(' × ')}` : '';
  state.moves++; renderBattle();
}
async function animateShot(result, action) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const target = document.querySelector('.sentinel'), rect = target.getBoundingClientRect();
  if (!result.ok) {
    await target.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 280 }).finished.catch(() => {});
    return;
  }
  const source = [...app.querySelectorAll(state.area === 'spark' ? '.ammo-tray .shot' : action === 'prime' ? '.shot, .remainder-box' : '.shot, .factor-chip')];
  if (!source.length) {
    await target.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(3)' }, { filter: 'brightness(1)' }], { duration: 420 }).finished.catch(() => {});
    return;
  }
  await Promise.all(source.map((el, i) => {
    const r = el.getBoundingClientRect(), clone = el.cloneNode(true);
    clone.classList.add('flying-shot'); clone.setAttribute('aria-hidden', 'true'); clone.removeAttribute('data-action'); clone.tabIndex = -1;
    Object.assign(clone.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, '--accent': areaOf(state.area).color });
    document.body.append(clone);
    el.style.visibility = 'hidden';
    const animation = clone.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${rect.x + rect.width / 2 - r.x - r.width / 2}px,${rect.y + rect.height / 2 - r.y - r.height / 2}px) scale(.15)`, opacity: 0 }], { duration: 430, delay: Math.min(i * 28, 320), easing: 'cubic-bezier(.5,0,.8,.5)' });
    return animation.finished.catch(() => {}).finally(() => { clone.remove(); el.style.visibility = ''; });
  }));
}
app.addEventListener('click', async e => {
  const button = e.target.closest('button[data-action]');
  if (!button || !state || busy) return;
  const { action, source, index, value } = button.dataset;
  if (action === 'retry') { state = createState(state.area, state.index); renderBattle(false); return; }
  if (!['play', 'square'].includes(state.phase)) return;
  if (action === 'move') { moveChunk(state, source, Number(index)); state.feedback = 'いいね。ぴったりに なったら、はっしゃ！'; renderBattle(); }
  if (action === 'split') { splitChunk(state, source, Number(index)); state.feedback = '1こずつに なったよ。たしたり はずしたり してみよう。'; renderBattle(); }
  if (action === 'size') { chooseSize(state, Number(value)); state.feedback = state.mission.hint; state.equation = ''; renderBattle(); }
  if (action === 'remainder') { state.remainder = Number(value); renderBattle(); }
  if (action === 'parity') { state.parity = value; renderBattle(); }
  if (action === 'factor' && state.phase === 'square') {
    const i = Number(index), current = state.squareSide.indexOf(i);
    if (current < 0) state.squareSide.push(i); else state.squareSide.splice(current, 1);
    state.moves++; renderBattle();
  }
  if (action === 'reset') resetArrangement();
  if (action === 'fire' || action === 'prime') {
    const token = generation, result = fire(state, action === 'prime' ? 'prime' : 'group');
    if (result.ignored) return;
    if (result.incomplete) { state.feedback = result.reason; renderBattle(); return; }
    busy = true;
    app.querySelectorAll('button[data-action]').forEach(b => { b.disabled = true; });
    tone(result.ok);
    if (result.complete) saveWin();
    try { await animateShot(result, action); } finally {
      if (token === generation) { busy = false; renderBattle(false); }
    }
  }
});
function route() {
  generation++; busy = false;
  document.querySelectorAll('.flying-shot').forEach(el => { el.getAnimations().forEach(a => a.cancel()); el.remove(); });
  const [id, stage] = location.hash.slice(1).split('/');
  if (!areaOf(id)) home();
  else if (!stage || !/^\d+$/.test(stage) || Number(stage) < 1 || Number(stage) > MISSIONS[id].length) stageMenu(id);
  else { state = createState(id, Number(stage) - 1); renderBattle(false); }
  window.scrollTo(0, 0);
  const heading = app.querySelector('h1');
  if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
}
window.addEventListener('hashchange', route);
route();
