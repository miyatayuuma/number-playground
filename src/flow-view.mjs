import { World } from "./view.mjs";
import { shape, arrayShape } from "./shapes.mjs";
import { activeTargets, gateFactor } from "./model.mjs";
export class FlowWorld extends World {
  pieceShape(p) {
    if (p.width) {
      let pitch = 19;
      if (this.run.stage.area === "gear") {
        const extent = Math.max(
          ...this.run.pieces.map((q) =>
            Math.max(
              q.width + (q.ids.length % q.width ? 2 : 0),
              Math.floor(q.ids.length / q.width),
              q.ids.length % q.width,
            ),
          ),
        );
        pitch = Math.min(19, (this.baseRadius * 1.65) / extent);
      }
      return arrayShape(p.ids.length, p.width, this.baseRadius, pitch);
    }
    return super.pieceShape(p);
  }
  targetShape(t, radius) {
    if (t.kind === "mosaic") return arrayShape(t.n, t.side, radius);
    if (t.kind === "divide") return arrayShape(t.input, t.width, radius);
    if (t.kind === "rectangle") {
      const preview = this.run.pieces.find((p) => p.ids.length === t.n)?.width;
      const f =
        (preview > 1 && preview < t.n && t.n % preview === 0
          ? preview
          : null) ||
        Array.from({ length: t.n - 2 }, (_, i) => i + 2)
          .filter((f) => t.n % f === 0)
          .sort(
            (a, b) =>
              Math.abs(a - Math.sqrt(t.n)) - Math.abs(b - Math.sqrt(t.n)),
          )[0];
      return arrayShape(t.n, f, radius);
    }
    if (t.kind === "gear") return arrayShape(6, 3, radius);
    return shape(t.n, radius);
  }
  targetPoint(i) {
    const t = this.run.targets[i];
    if (t.kind === "gear")
      return { x: this.w / 2, y: this.h * 0.29, radius: 80 };
    if (t.kind === "mosaic")
      return {
        x: this.w / 2,
        y: this.h * 0.29,
        radius: Math.min(115, this.w * 0.3, this.h * 0.2),
      };
    if (this.run.stage.area === "link") {
      const active = activeTargets(this.run),
        on = active.includes(i),
        j = on
          ? active.indexOf(i)
          : this.run.targets
              .filter((_, k) => !active.includes(k))
              .findIndex((t) => t === this.run.targets[i]);
      const count = on
        ? active.length
        : this.run.targets.length - active.length;
      return {
        x: (this.w * (j + 1)) / (count + 1),
        y: this.h * (on ? 0.29 : 0.455),
        radius: Math.min(
          on ? 64 : 24,
          (this.w / (count + 1)) * 0.32,
          this.h * (on ? 0.12 : 0.05),
        ),
      };
    }
    return super.targetPoint(i);
  }
  bound(p, radius = 30) {
    const result = super.bound(p, radius);
    if (this.run?.stage.area !== "spark")
      result.y = Math.min(result.y, this.h - radius - 84);
    return result;
  }
  handle(p) {
    if (
      this.run.stage.area === "spark" ||
      (this.run.stage.area === "gear" && p !== this.run.pieces[0])
    )
      return null;
    const c = this.positions.get(p.id);
    return {
      x: this.run.stage.area === "gear" ? this.w / 2 : c.x,
      y: Math.min(this.h - 27, c.y + this.baseRadius + 52),
      value: p.width,
      max:
        this.run.stage.area === "gear"
          ? Math.min(...this.run.pieces.map((p) => p.ids.length))
          : p.ids.length,
    };
  }
  handleHit(x, y) {
    for (const p of this.run.pieces) {
      const h = this.handle(p);
      if (h && Math.abs(x - h.x) < 33 && Math.abs(y - h.y) < 22)
        return { pieceId: p.id, ...h };
    }
    return null;
  }
  read() {
    const r = super.read();
    r.pieces.forEach((p) => {
      const source = this.run.pieces.find((q) => q.id === p.id);
      p.width = source.width;
      p.handle = this.handle(source);
    });
    r.targets.forEach((t, i) => {
      const source = this.run.targets[i];
      t.kind = source.kind;
      t.side = source.side;
      t.width = source.width;
      t.input = source.input;
      t.cells = [...source.cells];
      const s = this.targetShape(source, t.radius * 0.78);
      t.dots = s.dots.map((d) => ({ x: t.x + d.x, y: t.y + d.y }));
      t.pitch = s.pitch;
    });
    r.gate = null;
    return r;
  }
  hit(x, y) {
    const hit = super.hit(x, y);
    if (hit && this.run.stage.area !== "spark") {
      const p = this.run.pieces.find((p) => p.id === hit.pieceId);
      return { ...hit, ids: [...p.ids], anchor: this.positions.get(p.id) };
    }
    return hit;
  }
  placement(index, x, y) {
    const t = this.run.targets[index],
      p = this.run.pieces.find((p) => p.id === this.drag?.pieceId);
    if (t?.kind !== "mosaic" || !p?.width) return null;
    const pos = this.targetPoint(index),
      s = this.targetShape(t, pos.radius * 0.78),
      rows = p.ids.length / p.width;
    return {
      col: Math.round((x - pos.x) / s.pitch + (t.side - p.width) / 2),
      row: Math.round((y - pos.y) / s.pitch + (t.side - rows) / 2),
    };
  }
  dropTarget(x, y) {
    for (const i of activeTargets(this.run)) {
      const t = this.run.targets[i],
        p = this.targetPoint(i);
      if (
        Math.abs(x - p.x) < p.radius + 20 &&
        Math.abs(y - p.y) < p.radius + 20
      )
        return {
          kind: t.kind === "divide" ? "gate" : "target",
          index: i,
          cell: this.placement(i, x, y),
        };
    }
    if (this.run.stage.area === "gear") return { kind: "cancel" };
    return super.dropTarget(x, y).kind === "gate"
      ? { kind: "cancel" }
      : super.dropTarget(x, y);
  }
  move(x, y) {
    super.move(x, y);
    if (this.run.stage.area === "gear" && this.drag) {
      // The paired gun moves as one object; every dot in both arrays remains visible.
      const source = this.positions.get(this.drag.pieceId);
      for (const p of this.run.pieces)
        if (p.id !== this.drag.pieceId) {
          const c = this.positions.get(p.id),
            s = this.pieceShape(p);
          p.ids.forEach((id, i) => {
            const d = this.units.get(id);
            d.tx = c.x + s.dots[i].x + x - source.x;
            d.ty = c.y + s.dots[i].y + y - source.y;
          });
        }
    }
  }
  drawGate() {}
  drawTargets() {
    const c = this.ctx,
      active = activeTargets(this.run);
    this.run.targets.forEach((t, i) => {
      const p = this.targetPoint(i),
        s = this.targetShape(t, p.radius * 0.78),
        hot = this.hover?.index === i,
        on = active.includes(i);
      c.save();
      c.globalAlpha = t.complete ? 0.16 : on ? 1 : 0.28;
      c.strokeStyle = this.color + (hot ? "ff" : "88");
      c.lineWidth = hot ? 2.5 : 1.5;
      if (t.kind === "gear") {
        const f = this.run.width,
          ready =
            f >= 2 &&
            this.run.pieces.length === 2 &&
            this.run.pieces.every((p) => p.ids.length % f === 0);
        const count = Math.max(2, f || 3),
          pitch = Math.min(11, 55 / count);
        for (const dx of [-38, 38]) {
          c.strokeRect(
            p.x + dx - (count * pitch) / 2 - 4,
            p.y - 12,
            count * pitch + 8,
            24,
          );
          for (let j = 0; j < count; j++)
            this.circle(
              p.x + dx + (j - (count - 1) / 2) * pitch,
              p.y,
              Math.max(1.2, pitch * 0.28),
              this.color + (ready ? "ff" : "66"),
              1.5,
            );
          c.beginPath();
          c.moveTo(p.x + dx, p.y - 16);
          c.lineTo(p.x + dx, p.y - 35);
          c.lineTo(this.enemyPoint().x, this.enemyPoint().y + 35);
          c.stroke();
        }
        if (ready) {
          c.shadowColor = this.color;
          c.shadowBlur = 12;
          c.strokeRect(p.x - 78, p.y - 20, 156, 40);
          c.shadowBlur = 0;
        }
      } else {
        if (["mosaic", "rectangle", "divide"].includes(t.kind)) {
          const xs = s.dots.filter((d) => !d.remainder).map((d) => d.x),
            ys = s.dots.filter((d) => !d.remainder).map((d) => d.y);
          c.strokeRect(
            p.x + Math.min(...xs) - s.pitch * 0.55,
            p.y + Math.min(...ys) - s.pitch * 0.55,
            Math.max(...xs) - Math.min(...xs) + s.pitch * 1.1,
            Math.max(...ys) - Math.min(...ys) + s.pitch * 1.1,
          );
        } else
          this.circle(
            p.x,
            p.y,
            p.radius + 10,
            this.color + (hot ? "ff" : "77"),
            t.kind === "prime" ? 2 : 1,
          );
        s.dots.forEach((d, j) => {
          if (t.kind === "mosaic" && t.cells[j] !== null) return;
          this.circle(
            p.x + d.x,
            p.y + d.y,
            Math.max(2, s.dotRadius),
            d.remainder ? "#ffc977" : this.color + "99",
            1.2,
          );
          if (t.kind === "divide" && d.keep) {
            c.fillStyle = this.color + "35";
            c.fillRect(
              p.x + d.x - s.pitch * 0.45,
              p.y + d.y - s.pitch * 0.45,
              s.pitch * 0.9,
              s.pitch * 0.9,
            );
          }
        });
        if (t.kind === "mosaic" && hot && this.drag) {
          const cell = this.hover.cell,
            src = this.run.pieces.find((p) => p.id === this.drag.pieceId);
          if (cell && src.width) {
            const w = src.width,
              h = src.ids.length / w;
            const valid =
              Number.isInteger(h) &&
              cell.col >= 0 &&
              cell.row >= 0 &&
              cell.col + w <= t.side &&
              cell.row + h <= t.side &&
              !src.ids.some(
                (_, j) =>
                  t.cells[
                    (cell.row + Math.floor(j / w)) * t.side + cell.col + (j % w)
                  ] !== null,
              );
            c.fillStyle = valid ? this.color + "38" : "#ff8e9730";
            c.fillRect(
              p.x + (cell.col - t.side / 2) * s.pitch,
              p.y + (cell.row - t.side / 2) * s.pitch,
              w * s.pitch,
              h * s.pitch,
            );
          }
        }
        this.label(
          t.kind === "divide" ? t.input : t.n,
          p.x,
          p.y +
            (s.pitch
              ? Math.max(...s.dots.map((d) => d.y)) + s.dotRadius + 18
              : p.radius + 20),
          this.color,
          12,
        );
      }
      c.restore();
    });
  }
  drawPieces() {
    super.drawPieces();
    const c = this.ctx;
    for (const p of this.run.pieces) {
      const h = this.handle(p),
        s = this.pieceShape(p),
        pos = this.positions.get(p.id);
      if (p.width && !this.drag) {
        c.save();
        c.strokeStyle = this.color + "77";
        c.lineWidth = 1;
        const pitch = s.pitch;
        c.strokeRect(
          pos.x - (s.columns * pitch) / 2,
          pos.y - (s.rows * pitch) / 2,
          s.columns * pitch,
          s.rows * pitch,
        );
        if (s.remainder) {
          const x = pos.x + ((s.columns - 1) / 2 + 2) * pitch;
          c.strokeStyle = "#ffc977";
          c.strokeRect(
            x - pitch * 0.5,
            pos.y - (s.remainder * pitch) / 2,
            pitch,
            s.remainder * pitch,
          );
        }
        if (this.run.stage.area === "link") {
          c.fillStyle = this.color + "32";
          c.fillRect(
            pos.x - (s.columns * pitch) / 2,
            pos.y - (s.rows * pitch) / 2,
            pitch,
            s.rows * pitch,
          );
          // The other columns point toward the enemy; the highlighted column stays.
          for (let col = 1; col < s.columns; col++) {
            const x = pos.x + (col - (s.columns - 1) / 2) * pitch,
              y = pos.y - (s.rows * pitch) / 2 - 6;
            c.beginPath();
            c.moveTo(x - 2, y + 3);
            c.lineTo(x, y);
            c.lineTo(x + 2, y + 3);
            c.stroke();
          }
        }
        c.restore();
      }
      if (h) {
        c.save();
        c.strokeStyle = this.color + "88";
        c.fillStyle = "#15263c";
        c.lineWidth = 1.4;
        c.beginPath();
        c.roundRect(h.x - 28, h.y - 13, 56, 26, 13);
        c.fill();
        c.stroke();
        this.label(p.width || "◌", h.x, h.y, this.color, 12);
        this.label("‹", h.x - 19, h.y, this.color, 17);
        this.label("›", h.x + 19, h.y, this.color, 17);
        c.restore();
      }
    }
    if (
      this.run.stage.area === "gear" &&
      this.run.pieces.length === 2 &&
      !this.drag
    ) {
      const a = this.positions.get(this.run.pieces[0].id),
        b = this.positions.get(this.run.pieces[1].id),
        h = this.handle(this.run.pieces[0]);
      c.strokeStyle = this.color + "44";
      c.beginPath();
      c.moveTo(a.x, a.y + this.baseRadius + 15);
      c.lineTo(a.x, h.y);
      c.lineTo(h.x - 30, h.y);
      c.moveTo(b.x, b.y + this.baseRadius + 15);
      c.lineTo(b.x, h.y);
      c.lineTo(h.x + 30, h.y);
      c.stroke();
    }
  }
  async animate(result) {
    this.busy = true;
    this.drag = null;
    this.hover = null;
    const token = this.token,
      enemy = this.enemyPoint(),
      target = result.targetPoint || this.targetPoint(result.targetIndex || 0);
    if (!result.ok) {
      this.sync();
      await this.tween([], [], 180, token);
      if (token === this.token) this.busy = false;
      return;
    }
    const impact = (p, strength) => {
      this.burst(p.x, p.y, this.color, strength);
      this.onCue?.("hit");
    };
    if (result.type === "divide") {
      // Do not rearrange at a hidden gate: fire straight from the previewed array.
      this.positions.set(result.quotientId, {
        x: this.w * 0.4,
        y: this.h * 0.76,
      });
      if (result.remainderId !== null)
        this.positions.set(result.remainderId, {
          x: this.w * 0.74,
          y: this.h * 0.76,
        });
      for (const id of result.kept) this.units.get(id).keep = true;
      for (const id of [...result.kept, ...result.rest])
        this.units.get(id).manual = true;
      for (const id of result.ids) this.units.get(id).flight = true;
      await this.tween(
        result.ids,
        result.ids.map((_, i) => ({
          x:
            target.x +
            ((i % (result.factor - 1)) - (result.factor - 2) / 2) * 9,
          y: target.y,
          delay: Math.floor(i / (result.factor - 1)) * 65,
        })),
        390,
        token,
      );
      if (token !== this.token) return;
      impact(target, 1.4);
    } else if (result.type === "volley") {
      for (const group of result.groups) {
        for (const id of group) this.units.get(id).flight = true;
        await this.tween(
          group,
          group.map((_, i) => ({
            x: enemy.x + (i - (group.length - 1) / 2) * 5,
            y: enemy.y,
          })),
          150,
          token,
        );
        if (token !== this.token) return;
        group.forEach((id) => (this.units.get(id).visible = false));
        impact(enemy, 0.4 + group.length * 0.12);
      }
    } else if (result.type === "mosaic") {
      const t = this.run.targets[result.targetIndex],
        s = this.targetShape(t, target.radius * 0.78);
      await this.tween(
        result.inputIds,
        result.slots.map((j) => ({
          x: target.x + s.dots[j].x,
          y: target.y + s.dots[j].y,
        })),
        260,
        token,
      );
      if (token !== this.token) return;
      impact(target, 0.6);
      if (result.complete) {
        await this.tween([], [], 250, token);
        if (token !== this.token) return;
        for (const id of result.ids) this.units.get(id).flight = true;
        await this.tween(
          result.ids,
          result.ids.map((id) => {
            const j = t.cells.indexOf(id);
            return {
              x: enemy.x + s.dots[j].x * 0.3,
              y: enemy.y + s.dots[j].y * 0.3,
            };
          }),
          400,
          token,
        );
      }
    } else {
      for (const id of result.ids) this.units.get(id).flight = true;
      await this.tween(
        result.ids,
        result.ids.map((_, i) => ({
          x: target.x + Math.cos(i) * 5,
          y: target.y + Math.sin(i) * 5,
        })),
        360,
        token,
      );
      if (token !== this.token) return;
      impact(target, 1.2);
    }
    if (token !== this.token) return;
    for (const d of this.units.values()) {
      d.manual = false;
      d.flight = false;
      d.keep = false;
      d.vx = 0;
      d.vy = 0;
    }
    this.sync();
    if (result.complete) {
      this.deadAt = this.clock;
      impact(enemy, 2.3);
    }
    await this.tween([], [], result.complete ? 520 : 120, token);
    if (token === this.token) this.busy = false;
  }
}
