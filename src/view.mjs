import { shape, intrinsic, hierarchy } from "./shapes.mjs";
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
    const unit =
      this.run.stage.area === "spark" && p.ids.length <= 4
        ? Math.max(this.unitSize, 6 / 0.82)
        : this.unitSize;
    return shape(p.ids.length, intrinsic(p.ids.length).radius * unit);
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
    for (const [id, d] of this.units) if (!live.has(id)) d.visible = false;
  }
  displayGeometry(p) {
    const s = this.pieceShape(p),
      fallback = this.positions.get(p.id) || { x: 0, y: 0 };
    const dots = p.ids.map((id, i) => {
      const d = this.units.get(id);
      return {
        id,
        x: d?.x ?? fallback.x + s.dots[i].x,
        y: d?.y ?? fallback.y + s.dots[i].y,
        r: d?.r ?? s.dotRadius,
      };
    });
    const nodes = (s.nodes || hierarchy(p.ids.length, s.groups)).map((node) => {
      const ds = node.indices.map((i) => dots[i]),
        x = ds.reduce((sum, d) => sum + d.x, 0) / ds.length,
        y = ds.reduce((sum, d) => sum + d.y, 0) / ds.length;
      return {
        ...node,
        ids: ds.map((d) => d.id),
        anchor: { x, y },
        radius: Math.max(...ds.map((d) => Math.hypot(d.x - x, d.y - y) + d.r)),
      };
    });
    const root = nodes[0],
      center = root.anchor,
      radius = root.radius;
    return {
      ...s,
      dots,
      nodes,
      center,
      radius,
      grip: { x: center.x + Math.max(23, radius + 12), y: center.y },
      groups: s.groups.map((g) => {
        const n = nodes.find((n) => n.id === g.indices.join("."));
        return {
          ...g,
          x: n.anchor.x - center.x,
          y: n.anchor.y - center.y,
          radius: n.radius,
        };
      }),
    };
  }
  selection(p, g, node, kind = node.indices.length === 1 ? "unit" : "group") {
    return {
      pieceId: p.id,
      ids: [...node.ids],
      nodeId: node.id,
      kind,
      anchor: { ...node.anchor },
      children:
        kind === "grip"
          ? []
          : node.children.map((id) =>
              this.selection(
                p,
                g,
                g.nodes.find((n) => n.id === id),
              ),
            ),
    };
  }
  read() {
    return {
      width: this.w,
      height: this.h,
      busy: this.busy,
      moving: [...this.units.values()].some(
        (d) => d.visible && Math.hypot(d.x - d.tx, d.y - d.ty) > 1,
      ),
      pieces: this.run.pieces.map((p) => {
        const g = this.displayGeometry(p);
        return {
          id: p.id,
          n: p.ids.length,
          ids: [...p.ids],
          ...g.center,
          radius: g.radius,
          grip: g.grip,
          parts: g.nodes
            .filter((n) => n.indices.length < p.ids.length)
            .map((n) => ({
              n: n.indices.length,
              ids: [...n.ids],
              ...n.anchor,
            })),
          dots: g.dots,
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
    const candidates = [...this.run.pieces]
      .reverse()
      .map((p) => ({ p, g: this.displayGeometry(p) }));
    // Visible ink on a small piece takes precedence over neighbouring grip rings.
    for (const { p, g } of candidates)
      if (p.ids.length <= 4) {
        const leaf = g.nodes
          .filter((n) => n.ids.length === 1)
          .sort(
            (a, b) =>
              Math.hypot(x - a.anchor.x, y - a.anchor.y) -
              Math.hypot(x - b.anchor.x, y - b.anchor.y),
          )
          .find(
            (n) =>
              Math.hypot(x - n.anchor.x, y - n.anchor.y) <= n.radius + 0.25,
          );
        if (leaf) return this.selection(p, g, leaf);
      }
    for (const { p, g } of candidates) {
      const distance = Math.hypot(x - g.center.x, y - g.center.y),
        ring = Math.max(23, g.radius + 12);
      if (distance > ring + 8) continue;
      if (distance >= ring - 7) return this.selection(p, g, g.nodes[0], "grip");
      if (distance < (p.ids.length <= 4 ? 5 : 11))
        return this.selection(p, g, g.nodes[0]);
      const group = g.nodes
        .filter((n) => n.ids.length > 1 && n.ids.length < p.ids.length)
        .sort((a, b) => a.ids.length - b.ids.length)
        .find(
          (n) =>
            Math.hypot(x - n.anchor.x, y - n.anchor.y) <
            Math.max(7, n.radius * 0.62),
        );
      if (group) return this.selection(p, g, group);
      const leaf = g.nodes
        .filter((n) => n.ids.length === 1)
        .sort(
          (a, b) =>
            Math.hypot(x - a.anchor.x, y - a.anchor.y) -
            Math.hypot(x - b.anchor.x, y - b.anchor.y),
        )
        .find((n) => Math.hypot(x - n.anchor.x, y - n.anchor.y) < n.radius + 5);
      if (leaf) return this.selection(p, g, leaf);
      return this.selection(p, g, g.nodes[0]);
    }
    return null;
  }
  placeApart(pieceId, point) {
    const p = this.run.pieces.find((p) => p.id === pieceId),
      radius = Math.max(23, this.pieceShape(p).radius + 12);
    const origin = this.bound(point, radius);
    const obstacles = this.run.pieces
      .filter((q) => q.id !== pieceId)
      .map((q) => ({
        ...this.positions.get(q.id),
        radius: Math.max(23, this.pieceShape(q).radius + 12),
      }));
    const overlap = (c) =>
      obstacles.reduce(
        (sum, o) =>
          sum +
          Math.max(0, radius + o.radius + 8 - Math.hypot(c.x - o.x, c.y - o.y)),
        0,
      );
    let best = origin,
      penalty = overlap(origin);
    // Search nearest free landing first; only the released piece moves.
    for (let distance = 0; distance < Math.max(this.w, this.h); distance += 8) {
      for (let i = 0; i < 24; i++) {
        const a = (i * Math.PI) / 12,
          c = this.bound(
            {
              x: origin.x + Math.cos(a) * distance,
              y: origin.y + Math.sin(a) * distance,
            },
            radius,
          ),
          score = overlap(c);
        if (score < penalty) {
          best = c;
          penalty = score;
        }
        if (score < 0.1) {
          this.positions.set(pieceId, c);
          return;
        }
      }
    }
    this.positions.set(pieceId, best);
  }
  begin(selection, x, y) {
    const p = this.run.pieces.find((p) => p.id === selection.pieceId);
    this.drag = {
      ...selection,
      outline: this.displayGeometry(p),
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
  retarget(selection) {
    if (!this.drag) return;
    const previous = this.drag;
    this.sync();
    this.drag = {
      ...previous,
      ...selection,
      offsets: previous.offsets.filter((o) => selection.ids.includes(o.id)),
    };
    this.move(previous.x, previous.y);
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
      const s = this.displayGeometry(p),
        c = s.center;
      if (Math.hypot(x - c.x, y - c.y) < Math.max(12, s.radius + 4))
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
  }
  drawPieces() {
    const c = this.ctx;
    for (const p of this.run.pieces) {
      const selected = this.drag?.pieceId === p.id,
        s = selected ? this.drag.outline : this.displayGeometry(p),
        center = s.center;
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
      for (const g of (p.width ? [] : s.groups).filter(
        (g) => g.depth === 1 || g.indices.length === 2,
      )) {
        if (g.indices.length === 2) {
          const [a, b] = g.indices.map((i) => s.dots[i]);
          const angle = Math.atan2(b.y - a.y, b.x - a.x),
            length = Math.hypot(b.x - a.x, b.y - a.y),
            r = s.dotRadius + 3;
          c.save();
          c.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
          c.rotate(angle);
          c.strokeStyle = this.color + "48";
          c.lineWidth = 1;
          c.beginPath();
          c.roundRect(-length / 2 - r, -r, length + 2 * r, 2 * r, r);
          c.stroke();
          c.restore();
        } else {
          c.setLineDash([2, 4]);
          this.circle(
            center.x + g.x,
            center.y + g.y,
            g.radius + 3,
            this.color + "28",
          );
          c.setLineDash([]);
        }
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
}
