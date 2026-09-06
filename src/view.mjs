import { shape, intrinsic } from "./shapes.mjs";
import { AREAS } from "./stages.mjs";
import { activeTargets, gateFactor } from "./model.mjs";
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = (t) => 1 - Math.pow(1 - t, 3);
export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.positions = new Map();
    this.units = new Map();
    this.effects = [];
    this.drag = null;
    this.hover = null;
    this.clock = 0;
    this.paused = false;
    this.busy = false;
    this.motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }
  resize() {
    const oldW = this.w,
      oldH = this.h;
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (oldW && oldH)
      for (const p of this.positions.values()) {
        p.x = (p.x / oldW) * this.w;
        p.y = (p.y / oldH) * this.h;
      }
    this.drag = null;
    if (this.run && !this.busy) this.sync();
    this.onResize?.();
  }
  setRun(run) {
    this.run = run;
    this.color = AREAS.find((a) => a.id === run.stage.area).color;
    this.positions.clear();
    this.units.clear();
    this.effects = [];
    this.drag = null;
    this.hover = null;
    this.busy = false;
    this.flash = 0;
    this.deadAt = null;
    this.sync();
    for (const d of this.units.values()) {
      d.x += (Math.random() - 0.5) * 60;
      d.y += 45;
    }
  }
  homePoint(i, total) {
    if (total <= 3 || this.w > this.h * 1.4)
      return { x: (this.w * (i + 1)) / (total + 1), y: this.h * 0.76 };
    return {
      x: this.w * (0.3 + (i % 2) * 0.4),
      y: this.h * (0.65 + Math.floor(i / 2) * 0.21),
    };
  }
  get baseRadius() {
    return Math.min(67, this.w * 0.135, this.h * 0.112);
  }
  get unitSize() {
    return Math.min(
      7.5,
      this.baseRadius /
        Math.max(
          ...this.run.pieces.map((p) => intrinsic(p.ids.length).radius),
          1,
        ),
    );
  }
  pieceShape(p) {
    return shape(p.ids.length, intrinsic(p.ids.length).radius * this.unitSize);
  }
  targetPoint(i) {
    const n = this.run.targets.length;
    return {
      x: (this.w * (i + 1)) / (n + 1),
      y: this.h * 0.275,
      radius: Math.min(42, (this.w / (n + 1)) * 0.35, this.h * 0.095),
    };
  }
  gatePoint() {
    return {
      x: this.w / 2,
      y: this.h * 0.475,
      radius: Math.min(40, this.h * 0.078),
    };
  }
  enemyPoint() {
    return {
      x: this.w / 2,
      y: this.h * 0.105,
      radius: Math.min(31, this.h * 0.075),
    };
  }
  bound(p, radius = 30) {
    return {
      x: clamp(p.x, radius + 13, this.w - radius - 13),
      y: clamp(p.y, this.h * 0.56 + radius, this.h - radius - 23),
    };
  }
  sync() {
    if (!this.run || !this.w) return;
    const live = new Set();
    this.run.pieces.forEach((p, i) => {
      if (!this.positions.has(p.id))
        this.positions.set(p.id, this.homePoint(i, this.run.pieces.length));
      const s = this.pieceShape(p),
        center = this.bound(this.positions.get(p.id), s.radius);
      this.positions.set(p.id, center);
      p.ids.forEach((id, j) => {
        live.add(id);
        const target = {
          x: center.x + s.dots[j].x,
          y: center.y + s.dots[j].y,
          r: s.dotRadius,
        };
        const unit = this.units.get(id) || {
          id,
          x: target.x,
          y: target.y + 35,
          vx: 0,
          vy: 0,
        };
        Object.assign(unit, {
          tx: target.x,
          ty: target.y,
          r: target.r,
          visible: true,
        });
        this.units.set(id, unit);
      });
    });
    this.run.targets.forEach((t, i) => {
      const pos = this.targetPoint(i),
        s = shape(t.n, pos.radius * 0.78);
      t.loaded.forEach((id, j) => {
        live.add(id);
        const d = this.units.get(id);
        Object.assign(d, {
          tx: pos.x + s.dots[j].x,
          ty: pos.y + s.dots[j].y,
          r: Math.min(5, s.dotRadius),
          visible: true,
        });
      });
    });
    for (const [id, d] of this.units) if (!live.has(id)) d.visible = false;
  }
  read() {
    return {
      width: this.w,
      height: this.h,
      busy: this.busy,
      pieces: this.run.pieces.map((p, i) => {
        const center =
            this.positions.get(p.id) ||
            this.homePoint(i, this.run.pieces.length),
          s = this.pieceShape(p);
        return {
          id: p.id,
          n: p.ids.length,
          ids: [...p.ids],
          ...center,
          radius: s.radius,
          parts: s.groups.map((g) => ({
            n: g.indices.length,
            ids: g.indices.map((i) => p.ids[i]),
            x: center.x + g.x,
            y: center.y + g.y,
          })),
          dots: p.ids.map((id, i) => ({
            id,
            x: center.x + s.dots[i].x,
            y: center.y + s.dots[i].y,
          })),
        };
      }),
      targets: this.run.targets.map((t, i) => ({
        ...this.targetPoint(i),
        n: t.n,
        active: activeTargets(this.run).includes(i),
        complete: t.complete,
      })),
      gate: gateFactor(this.run)
        ? { ...this.gatePoint(), factor: gateFactor(this.run) }
        : null,
    };
  }
  hit(x, y) {
    for (const p of [...this.run.pieces].reverse()) {
      const c = this.positions.get(p.id),
        s = this.pieceShape(p),
        dx = x - c.x,
        dy = y - c.y;
      if (Math.hypot(dx, dy) > Math.max(26, s.radius + 15)) continue;
      if (Math.hypot(dx, dy) < 11 || Math.hypot(dx, dy) > s.radius + 2)
        return { pieceId: p.id, ids: [...p.ids], anchor: c };
      const group = [...s.groups]
        .sort((a, b) => b.depth - a.depth)
        .find(
          (g) => Math.hypot(dx - g.x, dy - g.y) < Math.max(10, g.radius * 0.62),
        );
      if (group)
        return {
          pieceId: p.id,
          ids: group.indices.map((i) => p.ids[i]),
          anchor: { x: c.x + group.x, y: c.y + group.y },
        };
      const leaf = s.dots.findIndex(
        (d) => Math.hypot(dx - d.x, dy - d.y) < s.dotRadius + 5,
      );
      if (leaf >= 0)
        return {
          pieceId: p.id,
          ids: [p.ids[leaf]],
          anchor: { x: c.x + s.dots[leaf].x, y: c.y + s.dots[leaf].y },
        };
      return { pieceId: p.id, ids: [...p.ids], anchor: c };
    }
    return null;
  }
  begin(selection, x, y) {
    this.drag = {
      ...selection,
      startX: x,
      startY: y,
      x,
      y,
      offsets: selection.ids.map((id) => {
        const d = this.units.get(id);
        return { id, x: d.x - x, y: d.y - y };
      }),
    };
  }
  move(x, y) {
    if (!this.drag) return;
    this.drag.x = x;
    this.drag.y = y;
    for (const o of this.drag.offsets) {
      const d = this.units.get(o.id);
      d.tx = x + o.x;
      d.ty = y + o.y;
    }
    this.hover = this.dropTarget(x, y);
  }
  dropTarget(x, y) {
    const gate = this.gatePoint();
    if (
      gateFactor(this.run) &&
      Math.hypot(x - gate.x, y - gate.y) < gate.radius + 22
    )
      return { kind: "gate" };
    for (const i of activeTargets(this.run)) {
      const p = this.targetPoint(i);
      if (Math.hypot(x - p.x, y - p.y) < Math.max(36, p.radius + 16))
        return { kind: "target", index: i };
    }
    for (const p of this.run.pieces) {
      if (p.id === this.drag?.pieceId) continue;
      const c = this.positions.get(p.id),
        s = this.pieceShape(p);
      if (Math.hypot(x - c.x, y - c.y) < Math.max(28, s.radius + 12))
        return { kind: "merge", pieceId: p.id };
    }
    return y > this.h * 0.55 && x > 8 && x < this.w - 8 && y < this.h - 8
      ? { kind: "space" }
      : { kind: "cancel" };
  }
  cancel() {
    this.drag = null;
    this.hover = null;
    this.sync();
  }
  circle(x, y, r, color, width = 1) {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, Math.max(0, r), 0, TAU);
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  }
  label(text, x, y, color = "#a5b8d1", size = 11) {
    const c = this.ctx;
    c.font = `600 ${size}px ui-rounded,system-ui,sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = color;
    c.fillText(text, x, y);
  }
  burst(x, y, color = this.color, strength = 1) {
    this.effects.push({ x, y, color, born: this.clock, strength });
    this.flash = strength;
  }
  drawBackground() {
    const c = this.ctx,
      w = this.w,
      h = this.h;
    c.clearRect(0, 0, w, h);
    const bg = c.createRadialGradient(
      w * 0.5,
      h * 0.18,
      0,
      w * 0.5,
      h * 0.45,
      h * 0.7,
    );
    bg.addColorStop(0, "#192a40");
    bg.addColorStop(0.6, "#0c1728");
    bg.addColorStop(1, "#09111d");
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#718eae19";
    for (let x = 20; x < w; x += 25)
      for (let y = 18; y < h; y += 25) {
        c.beginPath();
        c.arc(x, y, 0.65, 0, TAU);
        c.fill();
      }
    const enemy = this.enemyPoint();
    this.circle(enemy.x, enemy.y, Math.min(w * 0.31, h * 0.23), "#8babcf0c");
    this.circle(
      enemy.x,
      enemy.y,
      Math.min(w * 0.31, h * 0.23) + 12,
      "#8babcf08",
    );
    const y = h * 0.535;
    c.strokeStyle = "#7094bb24";
    c.setLineDash([2, 7]);
    c.beginPath();
    c.moveTo(24, y);
    c.lineTo(w - 24, y);
    c.stroke();
    c.setLineDash([]);
    // These chevrons give a direction to the shot without an instruction label.
    c.strokeStyle = "#a6c6ed22";
    c.lineWidth = 1.5;
    for (const x of [w * 0.13, w * 0.87]) {
      c.beginPath();
      c.moveTo(x - 4, y - 8);
      c.lineTo(x, y - 12);
      c.lineTo(x + 4, y - 8);
      c.stroke();
    }
    this.circle(w * 0.5, h * 0.79, Math.min(w * 0.43, h * 0.2), "#6789b10c");
  }
  drawEnemy() {
    const c = this.ctx,
      e = this.enemyPoint(),
      pulse = this.motion ? Math.sin(this.clock * 0.0018) * 1.5 : 0;
    c.save();
    c.translate(e.x, e.y + pulse);
    const r = e.radius;
    if (this.deadAt !== null) {
      const death = clamp((this.clock - this.deadAt) / 370, 0, 1);
      c.globalAlpha = 1 - death;
      c.rotate(death * 0.8);
      c.scale(1 - death * 0.6, 1 - death * 0.6);
    }
    const glow = c.createRadialGradient(0, 0, 0, 0, 0, r * 2.7);
    glow.addColorStop(0, this.color + "19");
    glow.addColorStop(1, this.color + "00");
    c.fillStyle = glow;
    c.fillRect(-r * 3, -r * 3, r * 6, r * 6);
    c.rotate(this.flash * 0.03 * Math.sin(this.clock * 0.055));
    c.fillStyle = "#18283c";
    c.strokeStyle = this.color + "88";
    c.lineWidth = 1.4;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 6;
      const x = Math.cos(a) * r,
        y = Math.sin(a) * r;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = this.color;
    c.shadowColor = this.color;
    c.shadowBlur = 9;
    c.beginPath();
    c.moveTo(-r * 0.58, -r * 0.2);
    c.lineTo(-r * 0.1, 0);
    c.lineTo(-r * 0.24, r * 0.19);
    c.lineTo(-r * 0.57, r * 0.1);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(r * 0.58, -r * 0.2);
    c.lineTo(r * 0.1, 0);
    c.lineTo(r * 0.24, r * 0.19);
    c.lineTo(r * 0.57, r * 0.1);
    c.closePath();
    c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = this.color + "a0";
    c.beginPath();
    c.moveTo(-r * 0.18, r * 0.48);
    c.lineTo(0, r * 0.57);
    c.lineTo(r * 0.18, r * 0.48);
    c.stroke();
    c.restore();
    if (["gear", "core"].includes(this.run.stage.area)) {
      for (let i = 0; i < 4; i++) {
        c.fillStyle = i < 4 - this.run.misses ? this.color + "ad" : "#43506a";
        c.fillRect(this.w - 23, this.h - 30 - i * 13, 5, 8);
      }
    }
  }
  drawTargets() {
    const c = this.ctx,
      active = activeTargets(this.run);
    this.run.targets.forEach((t, i) => {
      const p = this.targetPoint(i),
        s = shape(t.n, p.radius * 0.77),
        hot = this.hover?.kind === "target" && this.hover.index === i;
      const on = active.includes(i),
        loaded = t.loaded.length > 0;
      c.save();
      c.globalAlpha = t.complete && !loaded ? 0.23 : on || loaded ? 1 : 0.24;
      const gradient = c.createRadialGradient(
        p.x,
        p.y,
        0,
        p.x,
        p.y,
        p.radius + 12,
      );
      gradient.addColorStop(0, this.color + (hot ? "24" : "0b"));
      gradient.addColorStop(1, this.color + "00");
      c.fillStyle = gradient;
      c.fillRect(
        p.x - p.radius - 12,
        p.y - p.radius - 12,
        (p.radius + 12) * 2,
        (p.radius + 12) * 2,
      );
      this.circle(
        p.x,
        p.y,
        p.radius + 10,
        hot ? this.color : this.color + (loaded ? "99" : "40"),
        hot ? 2 : 1,
      );
      if (this.run.stage.charge) {
        c.strokeStyle = this.color + "32";
        c.setLineDash([3, 5]);
        c.beginPath();
        c.moveTo(p.x, p.y - p.radius - 10);
        c.lineTo(this.enemyPoint().x, this.enemyPoint().y + 34);
        c.stroke();
        c.setLineDash([]);
      }
      if (!loaded)
        for (const d of s.dots)
          this.circle(
            p.x + d.x,
            p.y + d.y,
            Math.max(2, s.dotRadius),
            this.color + (hot ? "dd" : "87"),
            1.2,
          );
      this.label(
        t.n,
        p.x,
        p.y + p.radius + 25,
        on ? this.color : "#8ca0b6",
        12,
      );
      if (t.origin !== null) {
        c.strokeStyle = this.color;
        c.lineWidth = 1.5;
        const x = p.x,
          y = p.y - p.radius - 20;
        c.beginPath();
        if (t.origin === 0) c.rect(x - 3, y - 3, 6, 6);
        else {
          c.moveTo(x, y - 4);
          c.lineTo(x + 4, y);
          c.lineTo(x, y + 4);
          c.lineTo(x - 4, y);
          c.closePath();
        }
        c.stroke();
      }
      c.restore();
    });
  }
  drawGate() {
    const f = gateFactor(this.run);
    if (!f) return;
    const c = this.ctx,
      p = this.gatePoint(),
      hot = this.hover?.kind === "gate",
      r = p.radius;
    c.save();
    c.translate(p.x, p.y);
    c.strokeStyle = hot ? this.color : "#7f9abb88";
    c.lineWidth = hot ? 2 : 1;
    c.beginPath();
    c.moveTo(-r, -r * 0.65);
    c.lineTo(-r, -r * 0.28);
    c.lineTo(-r * 0.75, -r * 0.08);
    c.lineTo(-r * 0.75, r * 0.5);
    c.moveTo(r, -r * 0.65);
    c.lineTo(r, -r * 0.28);
    c.lineTo(r * 0.75, -r * 0.08);
    c.lineTo(r * 0.75, r * 0.5);
    c.stroke();
    const pitch = Math.min(15, (r * 1.4) / f);
    for (let i = 0; i < f; i++) {
      const x = (i - (f - 1) / 2) * pitch;
      c.fillStyle = this.color;
      c.beginPath();
      c.arc(x, -8, 3, 0, TAU);
      c.fill();
      c.strokeStyle = this.color + "30";
      c.setLineDash([2, 4]);
      c.beginPath();
      c.moveTo(x, -1);
      c.lineTo(x, 15);
      c.stroke();
      c.setLineDash([]);
    }
    this.label("÷", 0, r * 0.72, hot ? this.color : "#a4b6cc", 18);
    c.restore();
  }
  drawPieces() {
    const c = this.ctx;
    for (const p of this.run.pieces) {
      const center = this.positions.get(p.id),
        s = this.pieceShape(p),
        selected = this.drag?.pieceId === p.id;
      c.save();
      c.globalAlpha = selected ? 0.42 : 1;
      const glow = c.createRadialGradient(
        center.x,
        center.y,
        0,
        center.x,
        center.y,
        s.radius + 25,
      );
      glow.addColorStop(0, this.color + "0d");
      glow.addColorStop(1, this.color + "00");
      c.fillStyle = glow;
      c.fillRect(
        center.x - s.radius - 25,
        center.y - s.radius - 25,
        (s.radius + 25) * 2,
        (s.radius + 25) * 2,
      );
      this.circle(
        center.x,
        center.y,
        Math.max(23, s.radius + 12),
        this.hover?.pieceId === p.id ? this.color + "d0" : this.color + "27",
      );
      for (const g of s.groups.filter((g) => g.depth === 1)) {
        c.setLineDash([2, 4]);
        this.circle(
          center.x + g.x,
          center.y + g.y,
          g.radius + 3,
          this.color + "28",
        );
        c.setLineDash([]);
      }
      if (p.ids.length > 1) {
        this.circle(center.x, center.y, 4, this.color + "91");
        c.fillStyle = this.color + "40";
        c.beginPath();
        c.arc(center.x, center.y, 1.3, 0, TAU);
        c.fill();
      }
      this.label(
        p.ids.length,
        center.x,
        center.y + Math.max(23, s.radius + 12) + 14,
        this.color,
        13,
      );
      if (this.run.stage.charge === "resonance") {
        const origins = new Set(p.ids.map((id) => this.run.dots[id].origin));
        if (origins.size === 1) {
          const o = [...origins][0],
            x = center.x,
            y = center.y - Math.max(23, s.radius + 12) - 10;
          c.strokeStyle = this.color + "b0";
          c.beginPath();
          if (o === 0) c.rect(x - 3, y - 3, 6, 6);
          else {
            c.moveTo(x, y - 4);
            c.lineTo(x + 4, y);
            c.lineTo(x, y + 4);
            c.lineTo(x - 4, y);
            c.closePath();
          }
          c.stroke();
        }
      }
      c.restore();
    }
  }
  drawUnits(dt) {
    const c = this.ctx,
      k = this.motion ? Math.min(1, dt / 16) : 1;
    for (const d of this.units.values()) {
      if (!d.visible) continue;
      if (!d.manual) {
        if (this.motion) {
          d.vx = (d.vx + (d.tx - d.x) * 0.105 * k) * Math.pow(0.7, k);
          d.vy = (d.vy + (d.ty - d.y) * 0.105 * k) * Math.pow(0.7, k);
          d.x += d.vx * k;
          d.y += d.vy * k;
        } else {
          d.x = d.tx;
          d.y = d.ty;
        }
      }
      const picked = this.drag?.ids.includes(d.id),
        origin = this.run.dots[d.id].origin;
      if (d.flight && d.lastX !== undefined) {
        c.strokeStyle = this.color + "75";
        c.lineWidth = Math.max(1, d.r * 0.6);
        c.beginPath();
        c.moveTo(d.lastX, d.lastY);
        c.lineTo(d.x, d.y);
        c.stroke();
      }
      d.lastX = d.x;
      d.lastY = d.y;
      c.fillStyle = d.keep ? this.color : origin % 2 ? this.color : "#edf6ff";
      c.shadowColor = this.color;
      c.shadowBlur = picked || d.keep ? 14 : 6;
      c.beginPath();
      c.arc(d.x, d.y, Math.max(1, d.r) * (picked ? 1.09 : 1), 0, TAU);
      c.fill();
      c.shadowBlur = 0;
      c.fillStyle = "#ffffff6a";
      c.beginPath();
      c.arc(
        d.x - d.r * 0.22,
        d.y - d.r * 0.25,
        Math.max(0.65, d.r * 0.2),
        0,
        TAU,
      );
      c.fill();
    }
    if (this.drag) {
      const d = this.drag;
      this.circle(d.x, d.y, 18, this.color + "22");
      this.label(d.ids.length, d.x, d.y - 28, this.color, 16);
    }
  }
  drawEffects() {
    const c = this.ctx;
    this.effects = this.effects.filter((e) => this.clock - e.born < 650);
    for (const e of this.effects) {
      const t = (this.clock - e.born) / 650;
      if (e.kind === "counter") {
        const p = clamp(t / 0.7, 0, 1),
          x = e.x,
          y = e.y + (this.h * 0.79 - e.y) * ease(p);
        c.save();
        c.globalAlpha = 1 - t;
        c.strokeStyle = "#ff8e97";
        c.fillStyle = "#ff8e97";
        c.lineWidth = 2;
        if (p < 1) {
          c.beginPath();
          c.moveTo(x, y - 35);
          c.lineTo(x, y);
          c.stroke();
          c.beginPath();
          c.moveTo(x, y + 8);
          c.lineTo(x - 5, y);
          c.lineTo(x, y - 8);
          c.lineTo(x + 5, y);
          c.closePath();
          c.fill();
        } else this.circle(x, y, 18 + (t - 0.7) * 150, "#ff8e97", 2);
        c.restore();
        continue;
      }
      c.save();
      c.globalAlpha = (1 - t) * 0.8;
      this.circle(e.x, e.y, (10 + 60 * t) * e.strength, e.color, 2 * (1 - t));
      if (this.motion)
        for (let i = 0; i < 10; i++) {
          const a = (i * TAU) / 10,
            dist = (12 + 45 * t) * e.strength;
          c.strokeStyle = e.color;
          c.beginPath();
          c.moveTo(e.x + Math.cos(a) * dist, e.y + Math.sin(a) * dist);
          c.lineTo(
            e.x + Math.cos(a) * (dist + 7 * (1 - t)),
            e.y + Math.sin(a) * (dist + 7 * (1 - t)),
          );
          c.stroke();
        }
      c.restore();
    }
    this.flash *= 0.9;
  }
  frame(t) {
    const dt = Math.min(32, t - this.last);
    this.last = t;
    if (!this.paused) {
      this.clock += dt;
      if (this.run && this.w) {
        this.drawBackground();
        this.drawEnemy();
        this.drawTargets();
        this.drawGate();
        this.drawPieces();
        this.drawUnits(dt);
        this.drawEffects();
      }
    }
    requestAnimationFrame((time) => this.frame(time));
  }
  async tween(ids, targets, ms, token) {
    const starts = ids.map((id) => {
      const d = this.units.get(id);
      d.visible = true;
      d.manual = true;
      return { x: d.x, y: d.y };
    });
    if (!this.motion) ms = 1;
    const start = this.clock,
      maxDelay = this.motion
        ? Math.max(0, ...targets.map((p) => p.delay || 0))
        : 0;
    await new Promise((resolve) => {
      const tick = () => {
        if (token !== this.token) {
          resolve();
          return;
        }
        const progress = clamp((this.clock - start) / (ms + maxDelay), 0, 1);
        ids.forEach((id, i) => {
          const d = this.units.get(id),
            p = targets[i];
          if (!d) return;
          const e = ease(
            clamp(
              (this.clock - start - (this.motion ? p.delay || 0 : 0)) / ms,
              0,
              1,
            ),
          );
          d.x = starts[i].x + (p.x - starts[i].x) * e;
          d.y = starts[i].y + (p.y - starts[i].y) * e;
        });
        if (progress < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }
  async spinRings(ids, token) {
    let offset = 0;
    const rings = this.run.targets
      .map((t, i) => {
        const p = this.targetPoint(i),
          members = ids.slice(offset, offset + t.n);
        offset += t.n;
        return members.map((id) => {
          const d = this.units.get(id);
          d.manual = true;
          return {
            id,
            cx: p.x,
            cy: p.y,
            r: Math.hypot(d.x - p.x, d.y - p.y),
            angle: Math.atan2(d.y - p.y, d.x - p.x),
          };
        });
      })
      .flat();
    const start = this.clock,
      duration = this.motion ? 570 : 1;
    await new Promise((resolve) => {
      const tick = () => {
        if (token !== this.token) {
          resolve();
          return;
        }
        const t = clamp((this.clock - start) / duration, 0, 1);
        for (const r of rings) {
          const d = this.units.get(r.id),
            a = r.angle + t * t * TAU * 2.2,
            rad = r.r * (1 - 0.72 * t);
          d.x = r.cx + Math.cos(a) * rad;
          d.y = r.cy + Math.sin(a) * rad;
        }
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }
  async animate(result) {
    this.busy = true;
    const token = this.token;
    this.drag = null;
    this.hover = null;
    if (result.type === "divide") {
      this.positions.set(result.quotientId, {
        x: this.w * 0.42,
        y: this.h * 0.76,
      });
      if (result.remainderId !== null)
        this.positions.set(result.remainderId, {
          x: this.w * 0.72,
          y: this.h * 0.77,
        });
    }
    if (!result.ok) {
      if (["gear", "core"].includes(this.run.stage.area))
        this.effects.push({
          kind: "counter",
          x: this.enemyPoint().x,
          y: this.enemyPoint().y,
          born: this.clock,
        });
      this.burst(this.enemyPoint().x, this.enemyPoint().y, "#ff8e97", 0.7);
      await this.tween([], [], 260, token);
      if (token !== this.token) return;
      this.sync();
      this.busy = false;
      return;
    }
    const target = this.targetPoint(result.targetIndex),
      enemy = this.enemyPoint();
    if (result.type === "divide") {
      const g = this.gatePoint(),
        f = result.factor,
        q = result.quotient,
        r = result.remainder;
      const pitch = Math.min(18, (this.h * 0.21) / Math.max(q, 1)),
        y0 = g.y - ((q - 1) * pitch) / 2;
      const positions = result.allIds.map((id, i) => ({
        x: g.x + ((i % f) - (f - 1) / 2) * pitch,
        y: y0 + Math.floor(i / f) * pitch,
      }));
      await this.tween(result.allIds, positions, 340, token);
      if (token !== this.token) return;
      this.burst(g.x, g.y, this.color, 0.45);
      // One dot per full row stays; only the others become ammunition.
      for (const id of result.kept) {
        this.units.get(id).r = Math.max(3, this.units.get(id).r);
        this.units.get(id).keep = true;
      }
      for (const id of result.ids) this.units.get(id).flight = true;
      this.onCue?.("hit");
      await this.tween(
        result.ids,
        result.ids.map((_, i) => ({
          x: target.x + ((i % 3) - 1) * 3,
          y: target.y + Math.floor(i / 3) * 2,
          delay: Math.min(180, Math.floor(i / (f - 1)) * 45),
        })),
        470,
        token,
      );
      if (token !== this.token) return;
      this.burst(target.x, target.y, this.color, 1.2);
      this.positions.set(result.quotientId, {
        x: this.w * 0.42,
        y: this.h * 0.76,
      });
      if (r)
        this.positions.set(result.remainderId, {
          x: this.w * 0.72,
          y: this.h * 0.77,
        });
    } else if (result.type === "load" || result.type === "burst") {
      const t = this.run.targets[result.targetIndex],
        s = shape(t.n, target.radius * 0.77);
      await this.tween(
        result.inputIds,
        result.inputIds.map((_, i) => ({
          x: target.x + s.dots[i].x,
          y: target.y + s.dots[i].y,
        })),
        260,
        token,
      );
      if (token !== this.token) return;
      this.burst(target.x, target.y, this.color, 0.55);
      if (result.type === "burst") {
        if (result.charge === "square") {
          const pitch = Math.min(17, this.w * 0.038),
            positions = result.ids.map((_, i) => ({
              x: this.w / 2 + ((i % 6) - 2.5) * pitch,
              y: this.h * 0.33 + (Math.floor(i / 6) - 2.5) * pitch,
            }));
          await this.tween(result.ids, positions, 380, token);
          if (token !== this.token) return;
          for (const [x, y] of [
            [-0.5, 0],
            [0.5, 0],
            [0, -0.5],
            [0, 0.5],
          ])
            this.burst(
              this.w / 2 + x * 6 * pitch,
              this.h * 0.33 + y * 6 * pitch,
              this.color,
              0.65,
            );
          await this.tween([], [], 160, token);
        } else if (result.charge === "rings") {
          await this.spinRings(result.ids, token);
        }
        if (token !== this.token) return;
        for (const id of result.ids) this.units.get(id).flight = true;
        this.onCue?.("hit");
        await this.tween(
          result.ids,
          result.ids.map((_, i) => ({
            x: enemy.x + Math.cos(i) * 5,
            y: enemy.y + Math.sin(i) * 5,
            delay: Math.min(160, Math.floor(i / 3) * 22),
          })),
          400,
          token,
        );
        if (token !== this.token) return;
        this.burst(enemy.x, enemy.y, this.color, 2);
      }
    } else {
      for (const id of result.ids) this.units.get(id).flight = true;
      await this.tween(
        result.ids,
        result.ids.map((_, i) => ({
          x: target.x + Math.cos(i) * 4,
          y: target.y + Math.sin(i) * 4,
        })),
        390,
        token,
      );
      if (token !== this.token) return;
      this.burst(target.x, target.y, this.color, 1.2);
    }
    if (token !== this.token) return;
    if (result.complete) {
      this.deadAt = this.clock;
      this.burst(enemy.x, enemy.y, this.color, 2.2);
    }
    for (const d of this.units.values()) {
      d.manual = false;
      d.flight = false;
      d.keep = false;
      d.vx = 0;
      d.vy = 0;
    }
    this.sync();
    await this.tween([], [], result.complete ? 400 : 100, token);
    if (token !== this.token) return;
    this.busy = false;
  }
}
