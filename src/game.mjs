import { generateProblem, AREAS } from "./stages.mjs";
import {
  createRun,
  activeTargets,
  gateFactor,
  split,
  merge,
  fire,
  divide,
  setWidth,
  pourPackMass,
  setPackBase,
  beginPackTransition,
  settlePackTransition,
  packCompletionNotation,
  matchPackTarget,
  beginPackAttack,
  resolvePackAttackPayload,
  completePackBreak,
} from "./model.mjs";
import { shape, arrayShape } from "./shapes.mjs";
import { PeelGesture, finerSelection } from "./gestures.mjs";
import { PackWorld as World } from "./pack-view.mjs";
import {
  SAVE_KEY,
  freshProgress,
  restoreProgress,
  recordResult,
} from "./progress.mjs";
const canvas = document.querySelector("#world"),
  overlay = document.querySelector("#overlay");
const world = new World(canvas),
  KEY = SAVE_KEY;
let progress = freshProgress(),
  ruleId = null,
  widthPointer = null,
  packPointer = false,
  peel = null,
  serial = 0,
  sound = true,
  audio,
  run,
  pointer = null,
  selected = null,
  epoch = 0,
  menu = null;
try {
  const data = JSON.parse(localStorage.getItem(KEY) || "{}");
  progress = restoreProgress(data.progress);
  const legacy = JSON.parse(
    localStorage.getItem("core-break-tactile-v2") || "{}",
  );
  if (data.sound === undefined) data.sound = legacy.sound;
  sound = data.sound !== false;
} catch {}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ progress, sound }));
  } catch {}
}
function tone(type = "pick", n = 1) {
  if (!sound) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audio ||= new Audio();
    audio.resume().catch(() => {});
    const notes =
      type === "miss"
        ? [110, 85]
        : type === "hit"
          ? [180, 360, 540]
          : type === "merge"
            ? [330, 440, 660]
            : type === "split"
              ? [660, 440]
              : [290 + Math.min(n, 20) * 16];
    notes.forEach((freq, i) => {
      const t = audio.currentTime + i * 0.052,
        o = audio.createOscillator(),
        g = audio.createGain();
      o.type = type === "hit" ? "triangle" : "sine";
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(
        freq * (type === "hit" ? 0.6 : 1.1),
        t + 0.14,
      );
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.2);
    });
  } catch {}
}
world.onCue = (type) => tone(type);
const icon = (name) =>
  ({
    play: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M7 4v16l13-8z"/></svg>',
    next: '<svg viewBox="0 0 24 24" width="27" height="27" aria-hidden="true"><path d="m8 4 8 8-8 8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: "×",
    replay: "↻",
    map: "⠿",
    sound: sound ? "♪" : "♩",
    back: "←",
  })[name];
function syncHUD() {
  const a = AREAS.find((a) => a.id === run.stage.area),
    steps = document.querySelector("#steps");
  document.documentElement.style.setProperty("--accent", a.color);
  document.querySelector("#stage-name").textContent = a.name;
  if (run.stage.area === "pack") {
    steps.textContent = "";
    steps.setAttribute("aria-label", "パック");
  } else {
    steps.textContent =
      "◆".repeat(run.stage.difficulty) + "◇".repeat(5 - run.stage.difficulty);
    steps.setAttribute("aria-label", `難易度 ${run.stage.difficulty} / 5`);
  }
}
function announce(text) {
  document.querySelector("#announcement").textContent = text;
}
function keyboardUI() {
  const controls = document.querySelector("#keyboard-controls");
  if (run.stage.area === "pack") {
    if (run.status !== "play" || world.busy) {
      controls.innerHTML = "";
      return;
    }
    const state = world.read().pack;
    const options = state.allowedRadices,
      radix = `<label>現在の基数 <input data-pack-radix type="range" min="${options[0]}" max="${options.at(-1)}" step="1" value="${state.base}" aria-label="現在の基数"></label>`,
      inputs = state.directInputLevels
        .map(
          (level) =>
            `<button data-pack-input="${level}">Number Massを${level + 1}番目のplaceへ流す</button>`,
        )
        .join("");
    controls.innerHTML = radix + inputs;
    return;
  }

  const buttons = run.pieces
    .map(
      (p) =>
        `<button data-piece="${p.id}">${p.ids.length}の塊を${selected ? "合わせる" : "選ぶ"}</button>`,
    )
    .join("");
  const parts = selected
    ? world
        .read()
        .pieces.find((p) => p.id === selected.pieceId)
        ?.parts.map(
          (p, i) => `<button data-part="${i}">${p.n}の部分をつかむ</button>`,
        )
        .join("") || ""
    : "";
  const targets = activeTargets(run)
    .map(
      (i) =>
        `<button data-target="${i}">${run.targets[i].n}の標的に撃つ</button>`,
    )
    .join("");
  controls.innerHTML =
    buttons +
    (run.stage.area === "spark"
      ? ""
      : run.pieces
          .map(
            (p) =>
              `<button data-width="${p.id}" data-delta="-1">${p.ids.length}の列幅を減らす</button><button data-width="${p.id}" data-delta="1">${p.ids.length}の列幅を増やす</button>`,
          )
          .join("")) +
    parts +
    targets +
    (gateFactor(run)
      ? `<button data-gate="1">${gateFactor(run)}の分割ゲートに通す</button>`
      : "") +
    (selected ? '<button data-release="1">手元に分けて置く</button>' : "");
}
function closeMenu() {
  if (!ruleId) return;
  overlay.hidden = true;
  overlay.innerHTML = "";
  menu = null;
  world.paused = document.hidden;
  canvas.focus({ preventScroll: true });
  if (run?.status === "won" && !world.busy) queueMicrotask(nextProblem);
}
function openPanel(html, kind) {
  if (pointer !== null) cancelPointer();
  pointer = null;
  peel = null;
  widthPointer = null;
  world.widthAdjustCandidate = null;
  world.widthAdjusting = false;
  world.widthAdjustPieceId = null;
  packPointer = false;
  world.cancelPackControl?.();
  selected = null;
  if (!world.busy) world.cancel();
  world.paused = true;
  menu = kind;
  overlay.innerHTML = html;
  overlay.hidden = false;
  overlay.querySelector("button")?.focus();
}
function packGlyphPositions(total, base) {
  const places = Math.floor(Math.log(total) / Math.log(base)) + 1,
    slotXs = [-36, -12, 12, 36].slice(4 - places),
    positions = Array(total);
  let remaining = total,
    raw = 0;
  for (let level = places - 1; level >= 0; level--) {
    const power = base ** level,
      digit = Math.floor(remaining / power),
      slotIndex = places - 1 - level,
      centers = digit ? shape(digit, digit === 1 ? 1 : 7.5).dots : [];
    remaining %= power;
    for (let unit = 0; unit < digit; unit++) {
      const children = shape(power, Math.min(6.2, 2.4 + level * 1.9)).dots;
      for (const child of children)
        positions[raw++] = {
          x: slotXs[slotIndex] + centers[unit].x + child.x,
          y: centers[unit].y + child.y,
        };
    }
  }
  return positions;
}

function packGlyph() {
  const bases = [2, 3, 4, 5],
    layouts = Object.fromEntries(
      bases.map((base) => [base, packGlyphPositions(13, base)]),
    ),
    slots = [-36, -12, 12, 36]
      .map(
        (x) =>
          `<rect class="pack-demo-slot" x="${x - 9}" y="-18" width="18" height="36" rx="7"/>`,
      )
      .join(""),
    dots = Array.from({ length: 13 }, (_, i) => {
      const p2 = layouts[2][i],
        p3 = layouts[3][i],
        p4 = layouts[4][i],
        p5 = layouts[5][i];
      return `<circle class="pack-demo-dot" cx="0" cy="0" r="1.55" style="--p2x:${p2.x}px;--p2y:${p2.y}px;--p3x:${p3.x}px;--p3y:${p3.y}px;--p4x:${p4.x}px;--p4y:${p4.y}px;--p5x:${p5.x}px;--p5y:${p5.y}px;animation-delay:${(i % 4) * 18}ms"/>`;
    }).join("");
  return `<svg class="pack-demo" viewBox="-55 -48 110 96" aria-hidden="true"><g class="pack-demo-slots">${slots}</g>${dots}</svg>`;
}

function areaGlyph(rule) {
  if (rule === "pack") return packGlyph();
  const dots = [];
  if (rule === "spark") {
    const end = shape(8, 27);
    let index = 0;
    for (const [n, x] of [
      [5, -25],
      [3, 25],
    ])
      for (const p of shape(n, 14).dots) {
        const e = end.dots[index++];
        dots.push({ x: p.x + x, y: p.y, mx: e.x, my: e.y, ex: e.x, ey: e.y });
      }
  } else if (rule === "link") {
    shape(12, 29).dots.forEach((p, i) => {
      const x = ((i % 3) - 1) * 10,
        y = (Math.floor(i / 3) - 1.5) * 10;
      dots.push({
        x: p.x,
        y: p.y,
        mx: x,
        my: y,
        ex: x,
        ey: i % 3 ? y - 29 : y,
      });
    });
  } else if (rule === "gear") {
    for (const [n, cx] of [
      [12, -25],
      [20, 25],
    ])
      shape(n, 17).dots.forEach((p, i) => {
        const x = cx + ((i % 4) - 1.5) * 5.5,
          y = (Math.floor(i / 4) - (n / 4 - 1) / 2) * 6;
        dots.push({ x: p.x + cx, y: p.y, mx: x, my: y, ex: x, ey: y - 20 });
      });
  }
  return `<svg viewBox="-55 -48 110 96" aria-hidden="true">${dots.map((d, i) => `<circle class="demo-dot" cx="${d.x}" cy="${d.y}" r="${rule === "gear" ? 1.7 : 2.5}" style="--mx:${d.mx - d.x}px;--my:${d.my - d.y}px;--dx:${d.ex - d.x}px;--dy:${d.ey - d.y}px;animation-delay:${Math.floor(i / 4) * 25}ms"/>`).join("")}</svg>`;
}
function areaMenu() {
  document.body.classList.toggle("entrance", !ruleId);
  openPanel(
    `<section class="panel"><div class="panel-header"><span class="panel-title">CORE BREAK</span>${ruleId ? '<button class="icon" data-menu="close" aria-label="戻る">×</button>' : ""}</div><div class="area-grid">${AREAS.map((a) => `<button class="area-tile rule-choice" data-rule="${a.id}" style="--tile:${a.color}" aria-label="${a.name}"><div class="area-glyph">${areaGlyph(a.id)}</div><span class="area-title">${a.name}</span></button>`).join("")}</div><div class="panel-footer"><a class="classic-link" href="classic.html">クラシック ↗</a></div></section>`,
    "areas",
  );
}
function pauseMenu() {
  if (!ruleId) return;
  openPanel(
    `<section class="panel"><div class="panel-header"><span class="panel-title">CORE BREAK</span><button class="icon" data-menu="close" aria-label="再開">×</button></div><div class="pause-actions"><button class="large-action primary" data-menu="close" aria-label="再開">${icon("play")}</button><button class="large-action" data-menu="retry" aria-label="${ruleId === "pack" ? "最初からやり直す" : "別の問題にする"}">${icon("replay")}</button><button class="large-action" data-menu="sound" aria-label="${sound ? "音を消す" : "音を出す"}" aria-pressed="${sound}">${icon("sound")}${sound ? "" : "̸"}</button><button class="large-action" data-menu="areas" aria-label="ルールを選ぶ">${icon("map")}</button></div></section>`,
    "pause",
  );
}
function start(id, changeHash = true, restartProblem = null) {
  epoch++;
  world.token = epoch;
  pointer = null;
  peel = null;
  widthPointer = null;
  world.widthAdjustCandidate = null;
  world.widthAdjusting = false;
  world.widthAdjustPieceId = null;
  packPointer = false;
  selected = null;
  ruleId = id;
  document.body.classList.remove("entrance");
  const p = progress[id],
    problem = restartProblem
      ? structuredClone(restartProblem)
      : generateProblem(
          id,
          p?.difficulty || 1,
          `${Date.now()}-${serial++}`,
          p?.recent || [],
        );
  if (p && !restartProblem) {
    p.recent.push(problem.id);
    p.recent = p.recent.slice(-10);
    save();
  }
  run = createRun(problem);
  world.setRun(run);
  closeMenu();
  syncHUD();
  keyboardUI();
  if (changeHash) history.replaceState(null, "", `#${id}`);
  announce(
    id === "pack"
      ? AREAS.find((a) => a.id === id).name
      : `${AREAS.find((a) => a.id === id).name} 難易度 ${problem.difficulty}`,
  );
}
function nextProblem() {
  if (run.status === "won" && !world.busy && !menu) start(ruleId);
}
async function transferPackMass(level) {
  if (run.stage.area !== "pack" || world.busy || run.status !== "play")
    return false;
  const result = pourPackMass(run, level);
  if (!result.ok) return false;
  beginPackTransition(run);
  const token = epoch;
  tone("merge");
  const packing = world.animatePack(result);
  keyboardUI();
  await packing;
  if (token !== epoch) return false;
  settlePackTransition(run);
  selected = null;
  const notation = packCompletionNotation(run);
  if (notation) {
    world.showPackCompletionNotation(notation);
    announce(`${notation.quantity} は ${notation.radix}進数で ${notation.digits}`);
  } else {
    announce("");
  }
  const match = matchPackTarget(run);
  if (match.ok) {
    const activating = world.playPackTargetActivation();
    keyboardUI();
    if (!(await activating) || token !== epoch) return false;
    const plan = beginPackAttack(run);
    if (!plan.ok)
      throw new Error(`PACK target matched without attack plan: ${plan.reason}`);
    keyboardUI();
    world.sync();
    if (
      !(await world.animatePackAttack(
        plan,
        (itemId) => resolvePackAttackPayload(run, itemId),
      )) || token !== epoch
    )
      return false;
    if (!(await world.animatePackBreak()) || token !== epoch) return false;
    if (!completePackBreak(run)) throw new Error("PACK BREAK failed to settle");
    recordResult(progress.pack, true);
    save();
    syncHUD();
    announce("攻撃。BREAK。");
    keyboardUI();
    nextProblem();
    return true;
  }
  keyboardUI();
  return true;
}
async function drop(destination) {
  const drag = world.drag;
  if (!drag || world.busy || run.status !== "play") return;
  const { pieceId, ids, x, y } = drag;
  const token = epoch;
  if (destination.kind === "cancel") {
    world.cancel();
    selected = null;
    keyboardUI();
    return;
  }
  if (run.stage.area === "pack" && destination.kind === "pack-input") {
    if (!(await transferPackMass(destination.level))) {
      tone("miss");
      world.cancel();
      selected = null;
      keyboardUI();
    }
    return;
  }
  if (destination.kind === "space") {
    const result = split(run, pieceId, ids);
    if (result.ok) {
      world.placeApart(result.pieceId, {
        x: x + drag.offsets.reduce((v, o) => v + o.x, 0) / ids.length,
        y: y + drag.offsets.reduce((v, o) => v + o.y, 0) / ids.length,
      });
      tone(result.type === "split" ? "split" : "pick", ids.length);
      if (result.type === "split") world.burst(x, y, world.color, 0.35);
    }
    world.cancel();
    selected = null;
    keyboardUI();
    return;
  }
  if (destination.kind === "merge") {
    const result = merge(run, pieceId, ids, destination.pieceId);
    if (result.ok) {
      const center = world.positions.get(result.pieceId);
      tone("merge");
      world.burst(center.x, center.y, world.color, 0.65);
      announce(`${run.pieces.find((p) => p.id === result.pieceId).ids.length}`);
    }
    world.cancel();
    selected = null;
    keyboardUI();
    return;
  }
  const targetIndex =
    destination.index ??
    (destination.kind === "gate"
      ? activeTargets(run).find((i) => run.targets[i].kind === "divide")
      : 0);
  const targetPosition = world.targetPoint(targetIndex || 0);
  const result =
    destination.kind === "gate"
      ? divide(run, pieceId, ids)
      : fire(run, pieceId, ids, destination.index);
  result.targetPoint = targetPosition;
  tone(result.ok ? "hit" : "miss");
  if (run.status === "won") {
    recordResult(progress[ruleId], true);
    save();
    syncHUD();
  }
  await world.animate(result);
  if (token !== epoch) return;
  selected = null;
  keyboardUI();
  announce(
    result.ok
      ? run.status === "won"
        ? "クリア"
        : result.type === "divide"
          ? `${result.quotient}、あまり${result.remainder}`
          : "命中"
      : "弾が戻りました",
  );
  if (run.status === "won") nextProblem();
}
function point(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
canvas.addEventListener("pointerdown", (e) => {
  if (
    pointer !== null ||
    world.busy ||
    world.paused ||
    run.status !== "play"
  )
    return;
  const p = point(e);
  if (run.stage.area === "pack" && world.packControlHit?.(p.x, p.y)) {
    e.preventDefault();
    pointer = e.pointerId;
    packPointer = true;
    canvas.setPointerCapture(pointer);
    world.beginPackControl(p.x);
    tone("pick");
    return;
  }
  const handle = world.handleHit(p.x, p.y);
  if (handle) {
    e.preventDefault();
    pointer = e.pointerId;
    canvas.setPointerCapture(pointer);
    widthPointer = {
      ...handle,
      startX: p.x,
      startWidth: run.stage.area === "gear" ? run.width : handle.value,
      candidate: run.stage.area === "gear" ? run.width : handle.value,
      area: run.stage.area,
    };
    world.widthAdjustCandidate = widthPointer.candidate;
    tone("pick");
    return;
  }
  const hit = world.hit(p.x, p.y);
  if (!hit) return;
  e.preventDefault();
  pointer = e.pointerId;
  canvas.setPointerCapture(pointer);
  tone("pick", hit.ids.length);
  world.begin(hit, p.x, p.y);
  peel =
    (run.stage.area === "spark" || run.stage.area === "pack") &&
    hit.kind !== "grip" &&
    hit.children?.length
      ? {
          gesture: new PeelGesture(p.x, p.y, e.timeStamp),
          normal: hit,
          x: p.x,
          y: p.y,
        }
      : null;
  selected = hit;
});
function updatePeel(p, time) {
  if (peel && peel.gesture.update(p.x, p.y, time)) {
    const finer = finerSelection(
      peel.normal,
      peel.x,
      peel.y,
      p.x - peel.x,
      p.y - peel.y,
    );
    if (finer) {
      world.retarget(finer);
      selected = finer;
      tone("split");
      world.burst(finer.anchor.x, finer.anchor.y, world.color, 0.3);
    }
  }
}
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== pointer) return;
  const p = point(e);
  if (packPointer) {
    world.movePackControl(p.x);
    return;
  }
  if (widthPointer) {
    const width = Math.max(
      0,
      Math.min(
        widthPointer.max,
        widthPointer.startWidth + Math.round((p.x - widthPointer.startX) / 12),
      ),
    );
    const piece = run.pieces.find((p) => p.id === widthPointer.pieceId);
    if (widthPointer.area === "gear") {
      if (widthPointer.candidate !== width) {
        widthPointer.candidate = width;
        world.widthAdjustCandidate = width;
        world.sync();
        tone("pick", width);
      }
    } else if (piece && piece.width !== width) {
      widthPointer.candidate = width;
      setWidth(run, piece.id, width);
      world.sync();
      tone("pick", width);
      keyboardUI();
    }
    return;
  }
  updatePeel(p, e.timeStamp);
  world.move(p.x, p.y);
});
canvas.addEventListener("pointerup", (e) => {
  if (e.pointerId !== pointer) return;
  const p = point(e);
  updatePeel(p, e.timeStamp);
  peel = null;
  if (packPointer) {
    const nextBase = world.endPackControl();
    packPointer = false;
    pointer = null;
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
    const previousBase = run.pack.base;
    if (nextBase && setPackBase(run, nextBase)) {
      tone("merge");
      const token = epoch,
        transition = world.radixChanged?.(previousBase, nextBase);
      world.sync();
      keyboardUI();
      announce("");
      Promise.resolve(transition).then((completed) => {
        if (completed && token === epoch) {
          settlePackTransition(run);
          keyboardUI();
        }
      });
    }
    return;
  }
  pointer = null;
  if (widthPointer) {
    const adjustment = widthPointer;
    widthPointer = null;
    world.widthAdjustCandidate = null;
    if (
      adjustment.area === "gear" &&
      adjustment.candidate !== adjustment.startWidth
    ) {
      setWidth(run, adjustment.pieceId, adjustment.candidate);
      world.sync();
      tone("merge", adjustment.candidate);
    } else if (adjustment.area === "link") world.sync();
    keyboardUI();
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
    return;
  }
  if (canvas.hasPointerCapture(e.pointerId))
    canvas.releasePointerCapture(e.pointerId);
  if (
    !world.drag ||
    Math.hypot(p.x - world.drag.startX, p.y - world.drag.startY) < 9
  ) {
    world.cancel();
    selected = null;
    keyboardUI();
    return;
  }
  world.move(p.x, p.y);
  drop(world.dropTarget(p.x, p.y)).catch(failSafe);
});
function cancelPointer() {
  peel = null;
  if (pointer !== null) {
    pointer = null;
    if (packPointer) {
      packPointer = false;
      world.cancelPackControl?.();
    }
    if (widthPointer) {
      if (widthPointer.area === "link")
        setWidth(run, widthPointer.pieceId, widthPointer.startWidth);
      widthPointer = null;
    }
    world.widthAdjustCandidate = null;
    world.widthAdjusting = false;
    world.widthAdjustPieceId = null;
    world.sync();
    selected = null;
    world.cancel();
    keyboardUI();
  }
}
canvas.addEventListener("pointercancel", cancelPointer);
canvas.addEventListener("lostpointercapture", cancelPointer);
world.onResize = () => {
  cancelPointer();
  if (world.busy) {
    world.token = ++epoch;
    world.busy = false;
    world.previewPackState = null;
    world.massAnchorOverride = null;
    world.clearPackReadoutPresentation?.();
    for (const d of world.units.values()) {
      d.manual = false;
      d.flight = false;
      d.keep = false;
      d.vx = 0;
      d.vy = 0;
    }
    world.sync();
    if (run.stage.area === "pack" && run.status === "play")
      settlePackTransition(run);
    keyboardUI();
    if (run.status === "won") nextProblem();
  }
};
function failSafe(error) {
  console.error(error);
  if (run?.stage.area === "pack") {
    world.token = ++epoch;
    world.busy = false;
    world.previewPackState = null;
    world.massAnchorOverride = null;
    world.clearPackReadoutPresentation?.();
    for (const d of world.units.values()) d.manual = false;
    if (run?.stage.area === "pack" && run.status === "play")
      settlePackTransition(run);
    world.sync();
    keyboardUI();
    return;
  }
  world.token = ++epoch;
  world.busy = false;
  world.cancel();
  if (run.status === "won") nextProblem();
}
document.querySelector("#areas").onclick = areaMenu;
document.querySelector("#pause").onclick = pauseMenu;
overlay.addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  if (button.dataset.rule) {
    start(button.dataset.rule);
    return;
  }
  const action = button.dataset.menu;
  if (action === "close") closeMenu();
  if (action === "retry") {
    if (ruleId === "pack") start(ruleId, true, run.stage);
    else {
      recordResult(progress[ruleId], false);
      save();
      start(ruleId);
    }
  }
  if (action === "areas") areaMenu();
  if (action === "sound") {
    sound = !sound;
    save();
    pauseMenu();
    if (sound) tone("merge");
  }
});
document.querySelector("#keyboard-controls").addEventListener("click", (e) => {
  if (world.busy || world.paused) return;
  const b = e.target.closest("button");
  if (!b) return;
  if (run.stage.area === "pack") {
    if (b.dataset.packInput !== undefined)
      transferPackMass(Number(b.dataset.packInput)).catch(failSafe);
    return;
  }
  if (b.dataset.width !== undefined) {
    const p = run.pieces.find((p) => p.id === Number(b.dataset.width));
    setWidth(run, p.id, p.width + Number(b.dataset.delta));
    world.sync();
    keyboardUI();
    document
      .querySelector(`[data-width="${p.id}"][data-delta="${b.dataset.delta}"]`)
      ?.focus();
    return;
  }
  if (b.dataset.piece !== undefined) {
    const id = Number(b.dataset.piece),
      p = run.pieces.find((p) => p.id === id),
      pos = world.positions.get(id);
    if (selected && selected.pieceId !== id) {
      drop({ kind: "merge", pieceId: id });
      return;
    }
    selected = { pieceId: id, ids: [...p.ids], anchor: pos };
    world.begin(selected, pos.x, pos.y);
    keyboardUI();
  } else if (b.dataset.part !== undefined && selected) {
    const part = world.read().pieces.find((p) => p.id === selected.pieceId)
      .parts[Number(b.dataset.part)];
    selected = { pieceId: selected.pieceId, ids: part.ids, anchor: part };
    world.begin(selected, part.x, part.y);
    keyboardUI();
  } else if (selected) {
    if (b.dataset.target !== undefined)
      drop({
        kind:
          run.targets[Number(b.dataset.target)].kind === "divide"
            ? "gate"
            : "target",
        index: Number(b.dataset.target),
      });
    else if (b.dataset.gate) drop({ kind: "gate" });
    else if (b.dataset.release) {
      world.move(world.w * 0.75, world.h * 0.8);
      drop({ kind: "space" });
    }
  }
});
document.querySelector("#keyboard-controls").addEventListener("change", (e) => {
  const input = e.target.closest("input[data-pack-radix]");
  if (!input || run.stage.area !== "pack" || run.status !== "play" || world.busy)
    return;
  const options = [...new Set(run.stage.radices)].sort((a, b) => a - b),
    previous = run.pack.base,
    next = Number(input.value);
  if (options.includes(next) && setPackBase(run, next)) {
    tone("merge");
    const token = epoch,
      transition = world.radixChanged?.(previous, next);
    world.sync();
    keyboardUI();
    Promise.resolve(transition).then((completed) => {
      if (completed && token === epoch) {
        settlePackTransition(run);
        keyboardUI();
      }
    });
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!overlay.hidden && run.status === "play") closeMenu();
    else if (world.drag) {
      world.cancel();
      selected = null;
      keyboardUI();
    } else pauseMenu();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelPointer();
    world.paused = true;
  } else world.paused = !!menu;
});
window.addEventListener("hashchange", route);
function route() {
  const id = location.hash.slice(1).split("/")[0];
  if (AREAS.some((a) => a.id === id)) start(id, false);
  else {
    if (id === "core")
      history.replaceState(null, "", location.pathname + location.search);
    if (!run) {
      run = createRun(generateProblem("spark", 1, 0));
      world.setRun(run);
      syncHUD();
    }
    areaMenu();
  }
}

route();
// Read-only observability for real pointer tests and quantity audits.
export function inspect() {
  return {
    runToken: epoch,
    stage: run.stage.id,
    status: run.status,
    misses: run.misses,
    menu,
    rule: run.stage.area,
    committedWidth: run.width,
    difficulty: run.stage.difficulty,
    family: run.stage.family,
    progress: structuredClone(progress),
    widthAdjustCandidate: widthPointer?.candidate ?? null,
    ...world.read(),
    visibleIds: [...world.units.values()]
      .filter((d) => d.visible)
      .map((d) => d.id),
    dragIds: world.drag?.ids || [],
    spent: [...run.spent],
    total: run.dots.length,
  };
}
