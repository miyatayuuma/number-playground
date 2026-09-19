import { FlowWorld } from "./flow-view.mjs";
import { shape, packCoefficientShape, placeSlotLayout } from "./shapes.mjs";
import { activePackItems, packableGroups, packDigits } from "./model.mjs";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class PackWorld extends FlowWorld {
  handle(p) {
    if (this.run?.stage.area === "pack") return null;
    return super.handle(p);
  }

  packLayout() {
    const total = this.run.stage.quantity || this.run.dots.length,
      base = this.run.pack.base,
      y = Math.min(this.h * 0.72, this.h - 112),
      slots = placeSlotLayout(total, base, this.w, y),
      slotRadius = Math.min(
        52,
        this.h * 0.095,
        slots.length > 1 ? (this.w - 28) / (slots.length * 2.35) : 52,
      ),
      items = [],
      groups = [];

    for (const slot of slots) {
      const levelItems = activePackItems(this.run)
          .filter((item) => item.level === slot.level)
          .sort((a, b) => a.order - b.order),
        coefficient = packCoefficientShape(
          levelItems.length,
          base,
          slotRadius * 0.82,
        );
      levelItems.forEach((item, index) => {
        const dot = coefficient.dots[index],
          r = clamp(coefficient.dotRadius || 5.5, 4.4, 7.1);
        items.push({
          item,
          level: slot.level,
          x: slot.x + dot.x,
          y: slot.y + dot.y,
          r,
          representative: item.ids[0],
        });
      });
      coefficient.groups
        .filter((group) => group.packable)
        .forEach((group) => {
          const groupItems = group.indices.map((index) => levelItems[index]);
          groups.push({
            level: slot.level,
            itemIds: groupItems.map((item) => item.id),
            rawIds: groupItems.flatMap((item) => item.ids),
            representatives: groupItems.map((item) => item.ids[0]),
            x: slot.x + group.x,
            y: slot.y + group.y,
            radius: group.radius + 7,
          });
        });
    }
    return {
      total,
      base,
      slots: slots.map((slot) => ({ ...slot, radius: slotRadius })),
      items,
      groups,
      slotRadius,
    };
  }

  sync() {
    if (this.run?.stage.area !== "pack") return super.sync();
    if (!this.w) return;
    const layout = this.packLayout(),
      live = new Set();

    for (const dot of this.run.dots)
      if (!this.units.has(dot.id))
        this.units.set(dot.id, {
          id: dot.id,
          x: this.w / 2,
          y: this.h * 0.8,
          tx: this.w / 2,
          ty: this.h * 0.8,
          r: 5,
          vx: 0,
          vy: 0,
          visible: false,
        });
    for (const unit of this.units.values()) unit.visible = false;

    for (const visual of layout.items) {
      const d = this.units.get(visual.representative);
      live.add(visual.representative);
      Object.assign(d, {
        tx: visual.x,
        ty: visual.y,
        r: visual.r,
        visible: true,
        packItemId: visual.item.id,
        packMacro: visual.item.macro,
        packLevel: visual.level,
      });
    }
    const piece = this.run.pieces[0];
    if (piece)
      this.positions.set(piece.id, {
        x: this.w / 2,
        y: layout.slots[0]?.y || this.h * 0.72,
      });
  }

  read() {
    if (this.run?.stage.area !== "pack") return super.read();
    const layout = this.packLayout(),
      pack = this.run.pack,
      moving = [...this.units.values()].some(
        (d) => d.visible && Math.hypot(d.x - d.tx, d.y - d.ty) > 1,
      ),
      items = layout.items.map((visual) => {
        const d = this.units.get(visual.representative);
        return {
          id: visual.item.id,
          ids: [visual.representative],
          rawIds: [...visual.item.ids],
          n: 1,
          level: visual.level,
          macro: visual.item.macro,
          x: d?.x ?? visual.x,
          y: d?.y ?? visual.y,
          radius: visual.r + (visual.item.macro ? 5 : 2),
        };
      }),
      groups = layout.groups.map((group) => ({
        id: group.itemIds.join("|"),
        itemIds: [...group.itemIds],
        ids: [...group.representatives],
        rawIds: [...group.rawIds],
        n: group.itemIds.length,
        level: group.level,
        x: group.x,
        y: group.y,
        radius: group.radius,
      })),
      control = this.packControl();
    return {
      width: this.w,
      height: this.h,
      busy: this.busy,
      moving,
      pieces: this.run.pieces.map((piece) => ({
        id: piece.id,
        n: piece.ids.length,
        ids: [...piece.ids],
        x: this.w / 2,
        y: layout.slots[0]?.y || this.h * 0.72,
        radius: Math.min(44, this.w * 0.11),
        grip: null,
        parts: [],
        dots: [],
      })),
      targets: [],
      gate: null,
      pack: {
        base: pack.base,
        step: pack.step,
        phase: pack.phase,
        digits: packDigits(this.run),
        notation: pack.locks.at(-1)?.notation || null,
        locks: structuredClone(pack.locks),
        slots: layout.slots.map((slot) => ({ ...slot })),
        items,
        groups,
        control,
      },
    };
  }

  begin(selection, x, y) {
    if (this.run?.stage.area !== "pack") return super.begin(selection, x, y);
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

  hit(x, y) {
    if (this.run?.stage.area !== "pack") return super.hit(x, y);
    const phase = this.run.pack.phase,
      layout = this.packLayout();
    if (phase === "choose" || phase === "break") return null;

    if (phase === "pack") {
      const group = [...layout.groups]
        .sort(
          (a, b) =>
            Math.hypot(x - a.x, y - a.y) - Math.hypot(x - b.x, y - b.y),
        )
        .find((candidate) => Math.hypot(x - candidate.x, y - candidate.y) <= candidate.radius);
      if (group)
        return {
          pieceId: this.run.pieces[0].id,
          ids: [...group.representatives],
          rawIds: [...group.rawIds],
          itemIds: [...group.itemIds],
          kind: "pack-group",
          level: group.level,
          anchor: { x: group.x, y: group.y },
        };
    }

    const candidates = layout.items
      .filter((visual) => visual.item.macro)
      .map((visual) => {
        const d = this.units.get(visual.representative);
        return {
          visual,
          x: d?.x ?? visual.x,
          y: d?.y ?? visual.y,
        };
      })
      .sort(
        (a, b) =>
          Math.hypot(x - a.x, y - a.y) - Math.hypot(x - b.x, y - b.y),
      );
    const hit = candidates.find(
      (candidate) =>
        Math.hypot(x - candidate.x, y - candidate.y) <= candidate.visual.r + 8,
    );
    if (!hit) return null;
    return {
      pieceId: this.run.pieces[0].id,
      ids: [hit.visual.representative],
      rawIds: [...hit.visual.item.ids],
      itemIds: [hit.visual.item.id],
      itemId: hit.visual.item.id,
      kind: "pack-item",
      level: hit.visual.level,
      macro: true,
      anchor: { x: hit.x, y: hit.y },
    };
  }

  dropTarget(x, y) {
    if (this.run?.stage.area !== "pack") return super.dropTarget(x, y);
    if (!this.drag) return { kind: "cancel" };
    const layout = this.packLayout(),
      center = this.drag.offsets.reduce(
        (point, offset) => ({
          x: point.x + x + offset.x / this.drag.offsets.length,
          y: point.y + y + offset.y / this.drag.offsets.length,
        }),
        { x: 0, y: 0 },
      );
    if (this.drag.kind === "pack-group") {
      const slot = layout.slots.find((candidate) => candidate.level === this.drag.level + 1);
      if (
        slot &&
        Math.hypot(center.x - slot.x, center.y - slot.y) <= slot.radius + 34
      )
        return { kind: "pack", itemIds: [...this.drag.itemIds] };
    }
    if (this.drag.kind === "pack-item" && this.drag.level > 0) {
      const slot = layout.slots.find((candidate) => candidate.level === this.drag.level - 1);
      if (
        slot &&
        Math.hypot(center.x - slot.x, center.y - slot.y) <= slot.radius + 34
      )
        return { kind: "unpack", itemId: this.drag.itemId };
    }
    return { kind: "cancel" };
  }

  packControl() {
    if (this.run?.stage.area !== "pack" || this.run.pack.phase !== "choose")
      return null;
    const y = Math.min(this.h - 38, this.h * 0.9),
      x1 = this.w * 0.37,
      x2 = this.w * 0.63;
    return {
      x1,
      x2,
      y,
      x: this.packControlX ?? x1,
      current: this.run.pack.base,
      next: this.run.stage.radices[this.run.pack.step + 1],
    };
  }

  packControlHit(x, y) {
    const control = this.packControl();
    if (!control) return false;
    return (
      Math.abs(y - control.y) <= 27 &&
      x >= control.x1 - 30 &&
      x <= control.x2 + 30
    );
  }

  beginPackControl(x) {
    const control = this.packControl();
    if (!control) return false;
    this.packControlX = clamp(x, control.x1, control.x2);
    return true;
  }

  movePackControl(x) {
    const control = this.packControl();
    if (!control) return;
    this.packControlX = clamp(x, control.x1, control.x2);
  }

  endPackControl() {
    const control = this.packControl();
    if (!control) return null;
    const chooseNext = (this.packControlX ?? control.x1) > (control.x1 + control.x2) / 2;
    this.packControlX = null;
    return chooseNext ? control.next : null;
  }

  cancelPackControl() {
    this.packControlX = null;
  }

  drawPieces() {
    if (this.run?.stage.area !== "pack") return super.drawPieces();
    const c = this.ctx,
      layout = this.packLayout(),
      hover = this.hover;

    c.save();
    c.lineWidth = 1.2;
    for (const slot of layout.slots) {
      const hot =
        (hover?.kind === "pack" && slot.level > 0) ||
        (hover?.kind === "unpack" && slot.level >= 0);
      c.strokeStyle = this.color + (hot ? "88" : "2d");
      c.setLineDash(slot.level === 0 ? [] : [3, 5]);
      c.beginPath();
      c.roundRect(
        slot.x - slot.radius,
        slot.y - slot.radius * 1.18,
        slot.radius * 2,
        slot.radius * 2.36,
        18,
      );
      c.stroke();
      c.setLineDash([]);
    }
    for (let i = 0; i < layout.slots.length - 1; i++) {
      const right = layout.slots[i],
        left = layout.slots[i + 1],
        y = right.y - right.radius * 1.48;
      c.strokeStyle = this.color + "35";
      c.beginPath();
      c.moveTo(right.x - right.radius * 0.35, y);
      c.lineTo(left.x + left.radius * 0.35, y);
      c.stroke();
      c.beginPath();
      c.moveTo(left.x + left.radius * 0.35, y);
      c.lineTo(left.x + left.radius * 0.48, y - 4);
      c.moveTo(left.x + left.radius * 0.35, y);
      c.lineTo(left.x + left.radius * 0.48, y + 4);
      c.stroke();
    }

    if (this.run.pack.phase === "pack")
      for (const group of layout.groups) {
        c.strokeStyle =
          hover?.kind === "pack" &&
          hover.itemIds?.join("|") === group.itemIds.join("|")
            ? this.color + "d0"
            : this.color + "4b";
        c.setLineDash([3, 4]);
        this.circle(group.x, group.y, group.radius, c.strokeStyle, 1.2);
        c.setLineDash([]);
      }

    for (const visual of layout.items)
      if (visual.item.macro) {
        const d = this.units.get(visual.representative),
          x = d?.x ?? visual.x,
          y = d?.y ?? visual.y;
        this.circle(x, y, visual.r + 3.2, this.color + "8c", 1);
        this.circle(x, y, visual.r + 5.7, this.color + "35", 1);
      }

    this.drawPackLocks(layout);
    this.drawPackControl();
    this.label(layout.total, this.w / 2, Math.min(this.h - 18, layout.slots[0].y + layout.slotRadius * 1.62), "#9eb1c9", 11);
    c.restore();
  }

  drawPackLocks(layout) {
    if (!this.run.pack.locks.length) return;
    const c = this.ctx,
      locks = this.run.pack.locks,
      startY = Math.max(this.h * 0.205, 116);
    locks.forEach((lock, row) => {
      const digits = lock.digits,
        gap = 30,
        startX = this.w / 2 - ((digits.length - 1) * gap) / 2,
        y = startY + row * 52;
      c.save();
      c.globalAlpha = row === locks.length - 1 ? 0.9 : 0.48;
      digits.forEach((digit, index) => {
        const x = startX + index * gap;
        if (!digit) {
          c.setLineDash([2, 4]);
          this.circle(x, y, 10, this.color + "50", 1);
          c.setLineDash([]);
          return;
        }
        const s = shape(digit, 10);
        s.dots.forEach((dot) =>
          this.circle(x + dot.x, y + dot.y, Math.max(1.3, s.dotRadius * 0.66), this.color + "8a", 1),
        );
      });
      this.label(lock.notation, this.w / 2, y + 22, this.color, 12);
      c.restore();
    });
  }

  drawPackControl() {
    const control = this.packControl();
    if (!control) return;
    const c = this.ctx;
    c.save();
    c.strokeStyle = this.color + "4d";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(control.x1, control.y);
    c.lineTo(control.x2, control.y);
    c.stroke();
    for (const [x, n] of [
      [control.x1, control.current],
      [control.x2, control.next],
    ]) {
      const s = shape(n, 12);
      s.dots.forEach((dot) =>
        this.circle(x + dot.x, control.y + dot.y, Math.max(1.4, s.dotRadius * 0.55), this.color + "8a", 1),
      );
    }
    this.circle(control.x, control.y, 19, this.color + "b0", 1.6);
    c.restore();
  }

  drawUnits(dt) {
    super.drawUnits(dt);
    if (this.run?.stage.area !== "pack" || !this.drag?.macro) return;
    const item = this.run.pack.nodes[this.drag.itemId];
    if (!item?.macro) return;
    const preview = shape(item.base, 18),
      c = this.ctx;
    c.save();
    c.globalAlpha = 0.32;
    preview.dots.forEach((dot) =>
      this.circle(
        this.drag.x + dot.x,
        this.drag.y + dot.y,
        Math.max(1.5, preview.dotRadius * 0.62),
        this.color,
        1,
      ),
    );
    c.restore();
  }

  async animatePack(result) {
    this.busy = true;
    this.hover = null;
    const token = this.token,
      origin = this.drag
        ? {
            x: this.drag.ids.reduce((sum, id) => sum + this.units.get(id).x, 0) / this.drag.ids.length,
            y: this.drag.ids.reduce((sum, id) => sum + this.units.get(id).y, 0) / this.drag.ids.length,
          }
        : { x: this.w / 2, y: this.h * 0.72 };

    if (result.type === "pack") {
      const layout = this.packLayout(),
        target = layout.items.find((visual) => visual.item.id === result.itemId),
        ids = this.drag?.ids || [result.representative];
      for (const id of ids) {
        const d = this.units.get(id);
        d.visible = true;
        d.manual = true;
      }
      await this.tween(
        ids,
        ids.map(() => ({ x: target?.x ?? origin.x, y: target?.y ?? origin.y })),
        220,
        token,
      );
      if (token !== this.token) return;
      this.burst(target?.x ?? origin.x, target?.y ?? origin.y, this.color, result.locked ? 1.15 : 0.55);
      this.onCue?.(result.locked ? "hit" : "merge");
    } else if (result.type === "unpack") {
      const childIds = result.childItemIds.map(
          (id) => this.run.pack.nodes[id].ids[0],
        ),
        layout = this.packLayout();
      this.drag = null;
      for (const id of childIds) {
        const d = this.units.get(id);
        d.x = origin.x;
        d.y = origin.y;
        d.visible = true;
        d.manual = true;
      }
      await this.tween(
        childIds,
        childIds.map((id) => {
          const target = layout.items.find((visual) => visual.representative === id);
          return { x: target?.x ?? origin.x, y: target?.y ?? origin.y };
        }),
        240,
        token,
      );
      if (token !== this.token) return;
      this.burst(origin.x, origin.y, this.color, 0.45);
      this.onCue?.("split");
    }

    this.drag = null;
    for (const d of this.units.values()) {
      d.manual = false;
      d.vx = 0;
      d.vy = 0;
    }
    this.sync();
    if (result.complete) {
      const enemy = this.enemyPoint();
      this.deadAt = this.clock;
      this.burst(enemy.x, enemy.y, this.color, 2.2);
      this.onCue?.("hit");
      await this.tween([], [], 520, token);
    } else await this.tween([], [], 90, token);
    if (token === this.token) this.busy = false;
  }
}
