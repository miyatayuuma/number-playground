import { FlowWorld } from "./flow-view.mjs";
import { shape, radixFrame, packScaleViewports } from "./shapes.mjs";
import { activePackItems, packDigits } from "./model.mjs";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class PackWorld extends FlowWorld {
  constructor(canvas) {
    super(canvas);
    this.revealedLevels = new Set([0]);
    this.scaleRevealCount = 0;
    this.scaleTransition = null;
    this.radixTransition = null;
    this.macroGlimpses = new Map();
  }

  setRun(run) {
    this.revealedLevels = new Set([0]);
    this.scaleRevealCount = 0;
    this.scaleTransition = null;
    this.radixTransition = null;
    this.macroGlimpses = new Map();
    super.setRun(run);
  }

  radixChanged(from, to) {
    if (from === to) return;
    this.radixTransition = {
      from,
      to,
      started: this.clock,
      duration: this.motion ? 360 : 150,
    };
  }

  activeTransition() {
    const transition = this.scaleTransition || this.radixTransition;
    if (!transition) return null;
    if (this.clock - transition.started >= transition.duration) {
      if (transition === this.scaleTransition) this.scaleTransition = null;
      if (transition === this.radixTransition) this.radixTransition = null;
      return null;
    }
    return {
      type: transition === this.scaleTransition ? "scale-reveal" : "radix-change",
      level: transition.level,
      from: transition.from,
      to: transition.to,
      progress: clamp(
        (this.clock - transition.started) / transition.duration,
        0,
        1,
      ),
    };
  }

  handle(p) {
    if (this.run?.stage.area === "pack") return null;
    return super.handle(p);
  }

  packLayout() {
    const total = this.run.stage.quantity || this.run.dots.length,
      base = this.run.pack.base,
      activeItems = activePackItems(this.run),
      activeMax = Math.max(0, ...activeItems.map((item) => item.level)),
      discoveredMax = Math.max(0, ...this.revealedLevels, activeMax),
      slots = packScaleViewports(discoveredMax, this.w, this.h),
      slotRadius = slots[0]?.radius || 0,
      items = [],
      levels = [];

    for (const slot of slots) {
      const levelItems = activeItems
          .filter((item) => item.level === slot.level)
          .sort((a, b) => a.order - b.order),
        coefficient = levelItems.length
          ? shape(levelItems.length, slot.radius * 0.76)
          : { dots: [], nodes: [], radius: 0, dotRadius: 0 },
        visuals = levelItems.map((item, index) => {
          const dot = coefficient.dots[index],
            visual = {
              item,
              level: slot.level,
              x: slot.x + (dot?.x || 0),
              y: slot.y + (dot?.y || 0),
              r: clamp(coefficient.dotRadius || 5.5, 2.5, 7.1),
              representative: item.ids[0],
            };
          items.push(visual);
          return visual;
        });
      levels.push({
        level: slot.level,
        slot: { ...slot },
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
      discoveredMax,
    };
  }

  packSelection(levelLayout, nodeId = levelLayout.shape.nodes?.[0]?.id) {
    const node = levelLayout.shape.nodes?.find(
      (candidate) => candidate.id === nodeId,
    );
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
          children: [...visual.item.children],
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
        radixPoints: pack.base,
        viewports: layout.slots.map((slot) => ({
          level: slot.level,
          x: slot.x,
          y: slot.y,
          radius: slot.radius,
          ghost: slot.ghost,
          revealed: !slot.ghost,
        })),
        revealedLevels: [...this.revealedLevels].sort((a, b) => a - b),
        revealCount: this.scaleRevealCount,
        transition: this.activeTransition(),
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
      const boundaryY = (source.y + upper.y) / 2;
      if (
        center.y <= boundaryY + 12 &&
        Math.abs(center.x - source.x) <= Math.max(source.radius * 1.7, 48)
      )
        return {
          kind: "normalize",
          itemIds: [...this.drag.itemIds],
          level: this.drag.level,
          targetLevel: this.drag.level + 1,
        };
    }

    if (this.drag.macro && this.drag.itemIds.length === 1 && this.drag.level > 0) {
      const lower = layout.slots.find((slot) => slot.level === this.drag.level - 1);
      if (lower) {
        const boundaryY = (source.y + lower.y) / 2;
        if (
          center.y >= boundaryY - 12 &&
          Math.abs(center.x - source.x) <= Math.max(source.radius * 1.7, 48)
        )
          return {
            kind: "unpack",
            itemId: this.drag.itemId,
            level: this.drag.level,
            targetLevel: this.drag.level - 1,
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
      layout = this.packLayout();

    c.save();
    this.drawPackViewports(layout);
    this.drawScaleReveal(layout);

    for (const visual of layout.items)
      if (visual.item.macro) {
        const d = this.units.get(visual.representative),
          x = d?.x ?? visual.x,
          y = d?.y ?? visual.y;
        this.circle(x, y, visual.r + 3.2, this.color + "8c", 1);
        this.circle(x, y, visual.r + 5.7, this.color + "35", 1);
      }

    this.drawPackControl();
    c.restore();
  }

  drawRadixFrame(slot, base, alpha, radiusScale = 1) {
    const c = this.ctx,
      frame = radixFrame(base, slot.radius * 0.61 * radiusScale),
      points = frame.points.map((point) => ({
        x: slot.x + point.x,
        y: slot.y + point.y,
      }));
    c.save();
    c.globalAlpha *= alpha;
    c.strokeStyle = this.color;
    c.lineWidth = Math.max(0.9, slot.scale * 1.2);
    c.beginPath();
    points.forEach((point, index) =>
      index ? c.lineTo(point.x, point.y) : c.moveTo(point.x, point.y),
    );
    c.closePath();
    c.stroke();
    for (const point of points)
      this.circle(
        point.x,
        point.y,
        Math.max(1.8, slot.radius * 0.065),
        this.color,
        Math.max(0.9, slot.scale),
      );
    c.restore();
  }

  drawPackViewports(layout) {
    const c = this.ctx,
      transition = this.radixTransition,
      progress = transition
        ? clamp((this.clock - transition.started) / transition.duration, 0, 1)
        : 1;
    for (let i = layout.slots.length - 1; i > 0; i--) {
      const far = layout.slots[i],
        near = layout.slots[i - 1],
        isHot =
          (this.hover?.kind === "normalize" &&
            this.hover.targetLevel === far.level) ||
          (this.hover?.kind === "unpack" &&
            this.hover.targetLevel === near.level);
      c.save();
      c.globalAlpha = isHot ? 0.42 : 0.13;
      c.strokeStyle = this.color;
      c.lineWidth = isHot ? 1.8 : 1;
      c.beginPath();
      c.moveTo(near.x - near.radius * 0.48, near.y - near.radius * 0.48);
      c.lineTo(far.x - far.radius * 0.48, far.y + far.radius * 0.52);
      c.moveTo(near.x + near.radius * 0.48, near.y - near.radius * 0.48);
      c.lineTo(far.x + far.radius * 0.48, far.y + far.radius * 0.52);
      c.stroke();
      c.restore();
    }

    for (const levelLayout of layout.levels) {
      const slot = levelLayout.slot,
        hot =
          (this.hover?.kind === "normalize" &&
            this.hover.targetLevel === slot.level) ||
          (this.hover?.kind === "unpack" &&
            this.hover.targetLevel === slot.level),
        alpha = slot.ghost ? 0.18 : levelLayout.items.length ? 0.42 : 0.28;
      this.circle(
        slot.x,
        slot.y,
        slot.radius,
        this.color + (hot ? "90" : slot.ghost ? "22" : "35"),
        hot ? 1.8 : 1,
      );
      if (transition) {
        this.drawRadixFrame(slot, transition.from, alpha * (1 - progress), 1);
        this.drawRadixFrame(slot, transition.to, alpha * progress, 1);
      } else this.drawRadixFrame(slot, this.run.pack.base, alpha, 1);
    }
  }

  drawScaleReveal(layout) {
    const transition = this.scaleTransition;
    if (!transition) return;
    const progress = clamp(
        (this.clock - transition.started) / transition.duration,
        0,
        1,
      ),
      eased = 1 - Math.pow(1 - progress, 3),
      from = layout.slots.find((slot) => slot.level === transition.level - 1),
      to = layout.slots.find((slot) => slot.level === transition.level);
    if (!from || !to) return;
    const reduced = !this.motion,
      frame = {
        level: to.level,
        x: to.x,
        y: reduced ? to.y : from.y + (to.y - from.y) * eased,
        radius: reduced
          ? to.radius
          : from.radius + (to.radius - from.radius) * eased,
        scale: reduced ? to.scale : from.scale + (to.scale - from.scale) * eased,
      };
    this.drawRadixFrame(
      frame,
      this.run.pack.base,
      (0.16 + eased * 0.56) * (1 - progress * 0.2),
      reduced ? 0.82 + eased * 0.18 : 0.76 + eased * 0.24,
    );
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
    if (this.run?.stage.area !== "pack") return;
    const c = this.ctx,
      active = new Set(this.run.pack.active),
      macros = Object.values(this.run.pack.nodes).filter((item) => {
        if (!item.macro) return false;
        const dragged = this.drag?.macro && this.drag.itemId === item.id,
          revealedUntil = this.macroGlimpses.get(item.id) || 0;
        if (!dragged && revealedUntil <= this.clock) return false;
        return active.has(item.id) || revealedUntil > this.clock;
      });
    for (const item of macros) {
      const d = this.units.get(item.ids[0]);
      if (!d?.visible) continue;
      const dragged = this.drag?.macro && this.drag.itemId === item.id,
        left = Math.max(0, (this.macroGlimpses.get(item.id) || this.clock + 1) - this.clock),
        alpha = dragged ? 0.72 : 0.8 * clamp(left / 680, 0, 1),
        preview = shape(
          item.children.length,
          Math.min(17, Math.max(9, d.r * 2.35)),
        );
      c.save();
      c.globalAlpha = alpha;
      for (const dot of preview.dots)
        this.circle(
          d.x + dot.x,
          d.y + dot.y,
          Math.max(1.25, Math.min(2.3, preview.dotRadius * 0.5)),
          this.color,
          1,
        );
      c.restore();
    }
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
      const firstReveal =
          result.bundles.length > 0 &&
          !this.revealedLevels.has(result.carryLevel),
        draggedIds = drag?.ids || [];
      if (result.bundles.length) {
        for (const bundle of result.bundles)
          this.macroGlimpses.set(bundle.itemId, this.clock + 2000);
        if (firstReveal) {
          this.revealedLevels.add(result.carryLevel);
          this.scaleRevealCount++;
          this.scaleTransition = {
            level: result.carryLevel,
            started: this.clock,
            duration: this.motion ? 520 : 170,
          };
        }
      }
      const layout = this.packLayout();
      for (const id of draggedIds) {
        const d = this.units.get(id);
        d.visible = true;
        d.manual = true;
      }

      if (result.bundles.length) {
        const carryIds = [],
          structureTargets = [],
          depthTargets = [],
          source = layout.slots.find((slot) => slot.level === result.level),
          destination = layout.slots.find(
            (slot) => slot.level === result.carryLevel,
          );
        for (const bundle of result.bundles) {
          const target = layout.items.find(
            (visual) => visual.item.id === bundle.itemId,
          ),
            childReps = bundle.childItemIds.map(
              (childId) => this.run.pack.nodes[childId].ids[0],
            ),
            center = childReps.reduce(
              (point, id) => {
                const dot = this.units.get(id);
                return {
                  x: point.x + dot.x / childReps.length,
                  y: point.y + dot.y / childReps.length,
                };
              },
              { x: 0, y: 0 },
            ),
            sourceShape = shape(
              childReps.length,
              (source?.radius || layout.slotRadius) * 0.39,
            ),
            depthShape = shape(
              childReps.length,
              (destination?.radius || layout.slotRadius * 0.72) * 0.28,
            );
          childReps.forEach((representative, index) => {
            const d = this.units.get(representative),
              formation = sourceShape.dots[index],
              inner = depthShape.dots[index];
            carryIds.push(representative);
            structureTargets.push({
              x: center.x + formation.x,
              y: center.y + formation.y,
              r: Math.max(2.2, d.r * 0.88),
              delay: index * 14,
            });
            depthTargets.push({
              x: (target?.x ?? origin.x) + inner.x,
              y: (target?.y ?? origin.y) + inner.y,
              r: Math.max(1.8, (target?.r || d.r) * 0.76),
              delay: index * 12,
            });
          });
          for (const childId of bundle.childItemIds) {
            const representative = this.run.pack.nodes[childId].ids[0];
            const d = this.units.get(representative);
            d.visible = true;
            d.manual = true;
          }
        }
        await this.tween(
          carryIds,
          structureTargets,
          firstReveal ? 185 : 135,
          token,
        );
        if (token !== this.token) return;
        await this.tween(
          carryIds,
          depthTargets,
          firstReveal ? 330 : 215,
          token,
        );
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
          boundaryY = source && upper ? (source.y + upper.y) / 2 : origin.y;
        this.burst(origin.x, boundaryY, this.color, 0.2);
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
      this.macroGlimpses.set(result.itemId, this.clock + 420);
      this.drag = null;
      for (const id of childIds) {
        const d = this.units.get(id);
        d.x = origin.x;
        d.y = origin.y;
        d.r = Math.max(1.8, this.units.get(drag?.ids?.[0])?.r || d.r);
        d.visible = true;
        d.manual = true;
      }
      await this.tween(
        childIds,
        childIds.map((id) => {
          const target = layout.items.find(
            (visual) => visual.representative === id,
          );
          return {
            x: target?.x ?? origin.x,
            y: target?.y ?? origin.y,
            r: target?.r ?? this.units.get(id).r,
          };
        }),
        this.motion ? 290 : 1,
        token,
      );
      if (token !== this.token) return;
      this.macroGlimpses.delete(result.itemId);
      this.burst(origin.x, origin.y, this.color, 0.45);
      this.onCue?.("split");
    }

    this.drag = null;
    for (const d of this.units.values()) {
      d.manual = false;
      d.vx = 0;
      d.vy = 0;
    }
    if (result.type === "normalize")
      for (const bundle of result.bundles)
        this.macroGlimpses.set(bundle.itemId, this.clock + 680);
    this.sync();
    await this.tween([], [], result.complete ? 250 : 90, token);
    if (token === this.token) this.busy = false;
  }
}
