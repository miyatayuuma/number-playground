import { STAGES, AREAS } from "./stages.mjs";
import {
  createRun,
  activeTargets,
  gateFactor,
  split,
  merge,
  fire,
  divide,
} from "./model.mjs";
import { shape } from "./shapes.mjs";
import { World } from "./view.mjs";
const canvas = document.querySelector("#world"),
  overlay = document.querySelector("#overlay");
const world = new World(canvas),
  KEY = "core-break-tactile-v2";
let cleared = new Set(),
  sound = true,
  audio,
  run,
  pointer = null,
  selected = null,
  epoch = 0,
  menu = null;
try {
  const data = JSON.parse(localStorage.getItem(KEY) || "{}");
  cleared = new Set(
    (Array.isArray(data.cleared) ? data.cleared : []).filter((id) =>
      STAGES.some((s) => s.id === id),
    ),
  );
  sound = data.sound !== false;
} catch {}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ cleared: [...cleared], sound }));
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
    local = run.index % 3;
  document.documentElement.style.setProperty("--accent", a.color);
  document.querySelector("#stage-name").textContent =
    `${a.name} · ${String(local + 1).padStart(2, "0")}`;
  document.querySelector("#steps").innerHTML = Array.from(
    { length: 3 },
    (_, i) =>
      `<i class="${i === local ? "current" : cleared.has(`${a.id}-${i + 1}`) ? "done" : ""}"></i>`,
  ).join("");
}
function announce(text) {
  document.querySelector("#announcement").textContent = text;
}
function keyboardUI() {
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
  document.querySelector("#keyboard-controls").innerHTML =
    buttons +
    parts +
    targets +
    (gateFactor(run)
      ? `<button data-gate="1">${gateFactor(run)}の分割ゲートに通す</button>`
      : "") +
    (selected ? '<button data-release="1">手元に分けて置く</button>' : "");
}
function closeMenu() {
  overlay.hidden = true;
  overlay.innerHTML = "";
  menu = null;
  world.paused = document.hidden;
  canvas.focus({ preventScroll: true });
}
function openPanel(html, kind) {
  pointer = null;
  selected = null;
  if (!world.busy) world.cancel();
  world.paused = true;
  menu = kind;
  overlay.innerHTML = html;
  overlay.hidden = false;
  overlay.querySelector("button")?.focus();
}
function areaGlyph(n) {
  const s = shape(n, 28);
  return `<svg viewBox="-42 -38 84 76" aria-hidden="true">${s.dots.map((d) => `<circle cx="${d.x}" cy="${d.y}" r="${Math.min(3.5, s.dotRadius)}"/>`).join("")}</svg>`;
}
function areaMenu() {
  openPanel(
    `<section class="panel"><div class="panel-header"><span class="panel-title">CORE BREAK</span><button class="icon" data-menu="close" aria-label="戻る">×</button></div><div class="area-grid">${AREAS.map((a, i) => `<section class="area-tile" style="--tile:${a.color}"><div class="area-glyph">${areaGlyph([8, 9, 12, 16][i])}</div><span class="area-title">${a.name}</span><div class="stage-choices">${[0, 1, 2].map((j) => `<button data-stage="${i * 3 + j}" class="${cleared.has(`${a.id}-${j + 1}`) ? "cleared" : ""}" aria-label="${a.name} ${j + 1}">${j + 1}</button>`).join("")}</div></section>`).join("")}</div><div class="panel-footer"><a class="classic-link" href="classic.html">クラシック ↗</a></div></section>`,
    "areas",
  );
}
function pauseMenu() {
  openPanel(
    `<section class="panel"><div class="panel-header"><span class="panel-title">CORE BREAK</span><button class="icon" data-menu="close" aria-label="再開">×</button></div><div class="pause-actions"><button class="large-action primary" data-menu="close" aria-label="再開">${icon("play")}</button><button class="large-action" data-menu="retry" aria-label="やり直す">${icon("replay")}</button><button class="large-action" data-menu="sound" aria-label="${sound ? "音を消す" : "音を出す"}" aria-pressed="${sound}">${icon("sound")}${sound ? "" : "̸"}</button><button class="large-action" data-menu="areas" aria-label="エリアを選ぶ">${icon("map")}</button></div></section>`,
    "pause",
  );
}
function resultMenu() {
  const a = AREAS.find((a) => a.id === run.stage.area),
    won = run.status === "won";
  openPanel(
    `<section class="panel ${won ? "victory" : "defeat"}"><div class="victory-emblem" aria-label="${won ? "クリア" : "再挑戦"}">${won ? "✦" : "↻"}</div><div class="result-stage">${a.name} · ${String((run.index % 3) + 1).padStart(2, "0")}</div><div class="pause-actions"><button class="large-action" data-menu="areas" aria-label="エリアを選ぶ">${icon("map")}</button><button class="large-action ${won ? "" : "primary"}" data-menu="retry" aria-label="同じ戦闘をやり直す">${icon("replay")}</button>${won ? `<button class="large-action primary" data-menu="next" aria-label="次へ">${icon("next")}</button>` : ""}</div></section>`,
    won ? "won" : "lost",
  );
}
function start(index, changeHash = true) {
  epoch++;
  world.token = epoch;
  pointer = null;
  selected = null;
  run = createRun(index);
  world.setRun(run);
  closeMenu();
  syncHUD();
  keyboardUI();
  if (changeHash)
    history.replaceState(null, "", `#${run.stage.area}/${(index % 3) + 1}`);
  announce(
    `${AREAS.find((a) => a.id === run.stage.area).name} ${(index % 3) + 1}`,
  );
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
  if (destination.kind === "space") {
    const result = split(run, pieceId, ids);
    if (result.ok) {
      world.positions.set(result.pieceId, world.bound({ x, y }));
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
  const result =
    destination.kind === "gate"
      ? divide(run, pieceId, ids)
      : fire(run, pieceId, ids, destination.index);
  tone(result.ok ? "hit" : "miss");
  if (run.status === "won") {
    cleared.add(run.stage.id);
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
  if (run.status !== "play") resultMenu();
}
function point(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
canvas.addEventListener("pointerdown", (e) => {
  if (pointer !== null || world.busy || world.paused || run.status !== "play")
    return;
  const p = point(e),
    hit = world.hit(p.x, p.y);
  if (!hit) return;
  e.preventDefault();
  pointer = e.pointerId;
  canvas.setPointerCapture(pointer);
  tone("pick", hit.ids.length);
  world.begin(hit, p.x, p.y);
  selected = hit;
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== pointer) return;
  const p = point(e);
  world.move(p.x, p.y);
});
canvas.addEventListener("pointerup", (e) => {
  if (e.pointerId !== pointer) return;
  const p = point(e);
  pointer = null;
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
  if (pointer !== null) {
    pointer = null;
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
    for (const d of world.units.values()) {
      d.manual = false;
      d.flight = false;
      d.keep = false;
      d.vx = 0;
      d.vy = 0;
    }
    world.sync();
    keyboardUI();
    if (run.status !== "play") resultMenu();
  }
};
function failSafe(error) {
  console.error(error);
  world.token = ++epoch;
  world.busy = false;
  world.cancel();
  if (run.status !== "play") resultMenu();
}
document.querySelector("#areas").onclick = areaMenu;
document.querySelector("#pause").onclick = pauseMenu;
overlay.addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  if (button.dataset.stage !== undefined) {
    start(Number(button.dataset.stage));
    return;
  }
  const action = button.dataset.menu;
  if (action === "close") {
    if (run.status !== "play" && !world.busy) resultMenu();
    else closeMenu();
  }
  if (action === "retry") start(run.index);
  if (action === "areas") areaMenu();
  if (action === "sound") {
    sound = !sound;
    save();
    pauseMenu();
    if (sound) tone("merge");
  }
  if (action === "next") {
    if (run.index % 3 === 2) areaMenu();
    else start(run.index + 1);
  }
});
document.querySelector("#keyboard-controls").addEventListener("click", (e) => {
  if (world.busy || world.paused) return;
  const b = e.target.closest("button");
  if (!b) return;
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
      drop({ kind: "target", index: Number(b.dataset.target) });
    else if (b.dataset.gate) drop({ kind: "gate" });
    else if (b.dataset.release) {
      world.move(world.w * 0.75, world.h * 0.8);
      drop({ kind: "space" });
    }
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
  const [id, n] = location.hash.slice(1).split("/"),
    area = AREAS.findIndex((a) => a.id === id);
  if (area >= 0 && /^[1-3]$/.test(n || ""))
    start(area * 3 + Number(n) - 1, false);
  else if (area >= 0) {
    start(area * 3, false);
    areaMenu();
  } else start(0, false);
}
route();
// Read-only observability for real pointer tests and quantity audits.
export function inspect() {
  return {
    stage: run.stage.id,
    status: run.status,
    misses: run.misses,
    menu,
    cleared: [...cleared],
    ...world.read(),
    visibleIds: [...world.units.values()]
      .filter((d) => d.visible)
      .map((d) => d.id),
    dragIds: world.drag?.ids || [],
    spent: [...run.spent],
    loaded: run.targets.flatMap((t) => t.loaded),
    total: run.dots.length,
  };
}
