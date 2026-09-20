import { FlowWorld } from "./flow-view.mjs";
import { shape, placeSlotLayout } from "./shapes.mjs";
import { activePackItems, packDigits } from "./model.mjs";

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
      levels = [];

    for (const slot of slots) {
      const levelItems = activePackItems(this.run)
          .filter((item) => item.level === slot.level)
          .sort((a, b) => a.order - b.order),
        coefficient = levelItems.length
          ? shape(levelItems.length, slotRadius * 0.78)
          : { dots: [], nodes: [], radius: 0, dotRadius: 0 },
        visuals = levelItems.map((item, index) => {
          const dot = coefficient.dots[index],
            visual = {
              item,
              level: slot.level,
              x: slot.x + dot.x,
              y: slot.y + dot.y,
              r: clamp(coefficient.dotRadius || 5.5, 4.4, 7.1),
              representative: item.ids[0],
            };
          items.push(visual);
          return visual;
        });
      levels.push({
        level: slot.level,
        slot: { ...slot, radius: slotRadius },
        items: visuals,
        shape: coefficient,
      });
    }

    return {
      total,
      base,
      slots: levels.map((level) => ({ ...level.slot })),
      items,
      levels,
      slotRadius,
    };
  }

  packSelection(levelLayout, nodeId = levelLayout.shape.nodes?.[0]?.id) {
    const node = levelLayout.shape.nodes?.find((candidate) => candidate.id === nodeId);
    if (!node) return null;
    const visuals = node.indices.map((index) => levelLayout.items[index]),
      dots = visuals.map((visual) => {
        const dot = this.units.get(visual.representative);
        return {
          x: dot?.x ?? visual.x,
          y: dot?.y ?? visual.y,
          r: dot?.r ?? visual.r,
        };
      }),
      x = dots.reduce((sum, dot) => sum + dot.x, 0) / dots.length,
      y = dots.reduce((sum, dot) => sum + dot.y, 0) / dots.length,
      itemIds = visuals.map((visual) => visual.item.id);

    return {
      pieceId: this.run.pieces[0].id,
      ids: visuals.map((visual) => visual.representative),
      rawIds: visuals.flatMap((visual) => visual.item.ids),
      itemIds,
      itemId: itemIds.length === 1 ? itemIds[0] : null,
      kind: "pack-selection",
      level: levelLayout.level,
      macro: visuals.length === 1 && visuals[0].item.macro,
      anchor: { x, y },
      radius: Math.max(
        8,
        ...dots.map((dot) => Math.hypot(dot.x - x, dot.y - y) + dot.r),
      ),
      children: node.children.map((id) => this.packSelection(levelLayout, id)),
    };
  }

  packPlace(levelLayout) {
    const selection = this.packSelection(levelLayout);
    if (selection) return selection;
    return {
      pieceId: this.run.pieces[0].id,
      ids: [],
      rawIds: [],
      itemIds: [],
      itemId: null,
      kind: "pack-selection",
      level: levelLayout.level,
      macro: false,
      anchor: { x: levelLayout.slot.x, y: levelLayout.slot.y },
      radius: 0,
      children: [],
    };
  }

  sync() {
    if (this.run?.stage.area !== "pack") return super.sync();
    if (!this.w) return;
    const layout = this.packLayout();

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
        x: layout.slots[0]?.x || this.w / 2,
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
      places = layout.levels.map((levelLayout) => {
        const place = this.packPlace(levelLayout);
        return {
          level: place.level,
          itemIds: [...place.itemIds],
          ids: [...place.ids],
          rawIds: [...place.rawIds],
          n: place.itemIds.length,
          x: place.anchor.x,
          y: place.anchor.y,
          radius: place.radius,
        };
      }),
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
        x: layout.slots[0]?.x || this.w / 2,
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
        places,
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

    if (phase === "unpack") {
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
          Math.hypot(x - candidate.x, y - candidate.y) <= candidate.visual.r + 9,
      );
      if (!hit) return null;
      const levelLayout = layout.levels.find(
          (candidate) => candidate.level === hit.visual.level,
        ),
        leaf = levelLayout.shape.nodes.find(
          (node) =>
            node.indices.length === 1 &&
            levelLayout.items[node.indices[0]].item.id === hit.visual.item.id,
        );
      return this.packSelection(levelLayout, leaf.id);
    }

    for (const levelLayout of [...layout.levels].reverse()) {
      if (!levelLayout.items.length) continue;
      const root = this.packSelection(levelLayout),
        distance = Math.hypot(x - root.anchor.x, y - root.anchor.y),
        ring = Math.max(23, root.radius + 10);

      if (levelLayout.items.length <= 4) {
        const leaf = levelLayout.shape.nodes
          .filter((node) => node.indices.length === 1)
          .map((node) => this.packSelection(levelLayout, node.id))
          .sort(
            (a, b) =>
              Math.hypot(x - a.anchor.x, y - a.anchor.y) -
              Math.hypot(x - b.anchor.x, y - b.anchor.y),
          )
          .find(
            (candidate) =>
              Math.hypot(x - candidate.anchor.x, y - candidate.anchor.y) <=
              candidate.radius + 0.5,
          );
        if (leaf) return leaf;
      }

      if (distance > ring + 9) continue;
      if (distance < (levelLayout.items.length <= 4 ? 5 : 11)) return root;

      const group = levelLayout.shape.nodes
        .filter(
          (node) =>
            node.indices.length > 1 &&
            node.indices.length < levelLayout.items.length,
        )
        .map((node) => this.packSelection(levelLayout, node.id))
        .sort((a, b) => a.itemIds.length - b.itemIds.length)
        .find(
          (candidate) =>
            Math.hypot(x - candidate.anchor.x, y - candidate.anchor.y) <
            Math.max(7, candidate.radius * 0.62),
        );
      if (group) return group;

      const leaf = levelLayout.shape.nodes
        .filter((node) => node.indices.length === 1)
        .map((node) => this.packSelection(levelLayout, node.id))
        .sort(
          (a, b) =>
            Math.hypot(x - a.anchor.x, y - a.anchor.y) -
            Math.hypot(x - b.anchor.x, y - b.anchor.y),
        )
        .find(
          (candidate) =>
            Math.hypot(x - candidate.anchor.x, y - candidate.anchor.y) <
            candidate.radius + 5,
        );
      if (leaf) return leaf;
      return root;
    }
    return null;
  }

  dropTarget(x, y) {
    if (this.run?.stage.area !== "pack") return super.dropTarget(x, y);
    if (!this.drag) return { kind: "cancel" };
    const layout = this.packLayout(),
      averageOffset = this.drag.offsets.reduce(
        (point, offset) => ({
          x: point.x + offset.x / this.drag.offsets.length,
          y: point.y + offset.y / this.drag.offsets.length,
        }),
        { x: 0, y: 0 },
      ),
      center = { x: x + averageOffset.x, y: y + averageOffset.y },
      source = layout.slots.find((slot) => slot.level === this.drag.level);

    if (!source) return { kind: "cancel" };

    const upper = layout.slots.find((slot) => slot.level === this.drag.level + 1);
    if (upper) {
      const boundaryX = (source.x + upper.x) / 2;
      if (
        center.x <= boundaryX + 5 &&
        Math.abs(center.y - source.y) <= source.radius * 1.7
      )
        return {
          kind: "normalize",
          itemIds: [...this.drag.itemIds],
          level: this.drag.level + 1,
        };
    }

    if (this.drag.macro && this.drag.itemIds.length === 1 && this.drag.level > 0) {
      const lower = layout.slots.find((slot) => slot.level === this.drag.level - 1);
      if (lower) {
        const boundaryX = (source.x + lower.x) / 2;
        if (
          center.x >= boundaryX - 5 &&
          Math.abs(center.y - source.y) <= source.radius * 1.7
        )
          return {
            kind: "unpack",
            itemId: this.drag.itemId,
            level: this.drag.level - 1,
          };
      }
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
    const chooseNext =
      (this.packControlX ?? control.x1) > (control.x1 + control.x2) / 2;
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
        (hover?.kind === "normalize" || hover?.kind === "unpack") &&
        hover.level === slot.level;
      c.strokeStyle = this.color + (hot ? "92" : "2d");
      c.setLineDash(slot.level === 0 ? [] : [2, 6]);
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
        y = right.y - right.radius * 1.48,
        hot =
          (hover?.kind === "normalize" && hover.level === left.level) ||
          (hover?.kind === "unpack" && hover.level === right.level);
      c.strokeStyle = this.color + (hot ? "a0" : "35");
      c.lineWidth = hot ? 2.2 : 1.2;
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

    for (const levelLayout of layout.levels) {
      if (!levelLayout.items.length) continue;
      const place = this.packPlace(levelLayout);
      this.circle(
        place.anchor.x,
        place.anchor.y,
        Math.max(18, place.radius + 6),
        this.color + "24",
        1,
      );
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
          this.circle(
            x + dot.x,
            y + dot.y,
            Math.max(1.3, s.dotRadius * 0.66),
            this.color + "8a",
            1,
          ),
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
        this.circle(
          x + dot.x,
          control.y + dot.y,
          Math.max(1.4, s.dotRadius * 0.55),
          this.color + "8a",
          1,
        ),
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
      drag = this.drag,
      origin = drag
        ? {
            x:
              drag.ids.reduce((sum, id) => sum + this.units.get(id).x, 0) /
              drag.ids.length,
            y:
              drag.ids.reduce((sum, id) => sum + this.units.get(id).y, 0) /
              drag.ids.length,
          }
        : { x: this.w / 2, y: this.h * 0.72 };

    if (result.type === "normalize") {
      const layout = this.packLayout(),
        draggedIds = drag?.ids || [];
      for (const id of draggedIds) {
        const d = this.units.get(id);
        d.visible = true;
        d.manual = true;
      }

      if (result.bundles.length) {
        const carryIds = [],
          carryTargets = [];
        for (const bundle of result.bundles) {
          const target = layout.items.find(
            (visual) => visual.item.id === bundle.itemId,
          );
          for (const childId of bundle.childItemIds) {
            const representative = this.run.pack.nodes[childId].ids[0];
            carryIds.push(representative);
            carryTargets.push({
              x: target?.x ?? origin.x,
              y: target?.y ?? origin.y,
            });
          }
        }
        await this.tween(carryIds, carryTargets, 210, token);
        if (token !== this.token) return;
        for (const bundle of result.bundles) {
          const target = layout.items.find(
            (visual) => visual.item.id === bundle.itemId,
          );
          this.burst(
            target?.x ?? origin.x,
            target?.y ?? origin.y,
            this.color,
            result.locked ? 0.85 : 0.5,
          );
        }
        this.onCue?.("merge");

        const remainderIds = result.remainderItemIds.map(
          (id) => this.run.pack.nodes[id].ids[0],
        );
        if (remainderIds.length) {
          await this.tween([], [], 65, token);
          if (token !== this.token) return;
          await this.tween(
            remainderIds,
            remainderIds.map((id) => {
              const target = layout.items.find(
                (visual) => visual.representative === id,
              );
              return { x: target?.x ?? origin.x, y: target?.y ?? origin.y };
            }),
            170,
            token,
          );
        }
      } else {
        const source = layout.slots.find((slot) => slot.level === result.level),
          upper = layout.slots.find(
            (slot) => slot.level === result.carryLevel,
          ),
          boundaryX =
            source && upper ? (source.x + upper.x) / 2 : origin.x;
        this.burst(boundaryX, origin.y, this.color, 0.2);
        await this.tween([], [], 70, token);
        if (token !== this.token) return;
        await this.tween(
          draggedIds,
          draggedIds.map((id) => {
            const target = layout.items.find(
              (visual) => visual.representative === id,
            );
            return { x: target?.x ?? origin.x, y: target?.y ?? origin.y };
          }),
          170,
          token,
        );
      }
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
          const target = layout.items.find(
            (visual) => visual.representative === id,
          );
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
    await this.tween([], [], result.complete ? 250 : 90, token);
    if (token === this.token) this.busy = false;
  }
}
