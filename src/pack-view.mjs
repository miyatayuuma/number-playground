import { FlowWorld } from "./flow-view.mjs";
import {
  shape,
  radixFrame,
  packScaleViewports,
  packNestedUnitShape,
} from "./shapes.mjs";
import { activePackItems, packDigits } from "./model.mjs";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class PackWorld extends FlowWorld {
  constructor(canvas) {
    super(canvas);
    this.showDragCount = false;
    this.revealedLevels = new Set([0]);
    this.scaleRevealCount = 0;
    this.scaleHintShown = false;
    this.scaleHintCount = 0;
    this.scaleHintUntil = 0;
    this.radixTransition = null;
    this.rotation = 0;
    this.rotationTarget = 0;
    this.rotationGesture = null;
    this.boundaryVisuals = new Map();
    this.boundaryClock = 0;
  }

  setRun(run) {
    this.revealedLevels = new Set([0]);
    this.scaleRevealCount = 0;
    this.scaleHintShown = false;
    this.scaleHintCount = 0;
    this.scaleHintUntil = 0;
    this.radixTransition = null;
    this.rotation = 0;
    this.rotationTarget = 0;
    this.rotationGesture = null;
    this.boundaryVisuals.clear();
    this.boundaryClock = this.clock;
    super.setRun(run);
  }

  radixChanged(from, to) {
    if (from === to) return;
    this.radixTransition = this.motion
      ? { from, to, started: this.clock, duration: 240 }
      : null;
  }

  activeTransition() {
    const transition = this.radixTransition;
    if (!transition) return null;
    if (this.clock - transition.started >= transition.duration) {
      this.radixTransition = null;
      return null;
    }
    return {
      type: "radix-change",
      from: transition.from,
      to: transition.to,
      progress: clamp(
        (this.clock - transition.started) / transition.duration,
        0,
        1,
      ),
    };
  }

  frame(t) {
    const dt = Math.min(32, Math.max(0, t - this.last));
    if (!this.rotationGesture && this.run?.stage.area === "pack") {
      if (this.scaleHintUntil && this.clock >= this.scaleHintUntil) {
        this.scaleHintUntil = 0;
        this.rotationTarget = 0;
      }
      if (Math.abs(this.rotation - this.rotationTarget) > 0.002) {
        const amount = this.motion ? 1 - Math.exp(-dt / 95) : 1;
        this.rotation += (this.rotationTarget - this.rotation) * amount;
        if (Math.abs(this.rotation - this.rotationTarget) < 0.003)
          this.rotation = this.rotationTarget;
        this.sync();
      }
    }
    super.frame(t);
  }

  beginScaleRotation(x) {
    this.rotationGesture = { startX: x, origin: this.rotation, moved: false };
  }

  moveScaleRotation(x) {
    if (!this.rotationGesture) return false;
    const gesture = this.rotationGesture,
      dx = x - gesture.startX;
    if (!gesture.moved && Math.abs(dx) < 8) return false;
    gesture.moved = true;
    this.rotation = clamp(
      gesture.origin + (dx / Math.max(96, this.w * 0.42)) * 0.72,
      -0.72,
      0.72,
    );
    this.rotationTarget = this.rotation;
    this.scaleHintUntil = 0;
    this.sync();
    return true;
  }

  endScaleRotation() {
    if (!this.rotationGesture) return;
    this.rotationGesture = null;
    this.rotationTarget = 0;
    if (!this.motion) this.rotation = 0;
    this.sync();
  }

  cancelScaleRotation() {
    this.endScaleRotation();
  }

  triggerScaleHint() {
    if (this.scaleHintShown) return;
    this.scaleHintShown = true;
    this.scaleHintCount++;
    this.rotation = this.motion ? 0.13 : 0.075;
    this.rotationTarget = this.rotation;
    this.scaleHintUntil = this.clock + (this.motion ? 110 : 72);
    this.sync();
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
      slots = packScaleViewports(discoveredMax, this.w, this.h, this.rotation),
      slotRadius = slots[0]?.radius || 0,
      items = [],
      levels = [],
      leaves = [],
      boundaries = [];

    for (const slot of slots) {
      const levelItems = activeItems
          .filter((item) => item.level === slot.level)
          .sort((a, b) => a.order - b.order),
        coefficient = levelItems.length
          ? shape(levelItems.length, slot.radius * 0.73)
          : { dots: [], nodes: [], radius: 0, dotRadius: 0 },
        visuals = levelItems.map((item, index) => {
          const dot = coefficient.dots[index],
            visual = {
              item,
              level: slot.level,
              x: slot.x + (dot?.x || 0),
              y: slot.y + (dot?.y || 0),
              r: clamp(slot.radius * 0.115, 4.8, 6.3),
              hitRadius: clamp(slot.radius * 0.115, 4.8, 6.3) * slot.innerScale,
              representative: item.ids[0],
              contentScale: slot.innerScale,
            };
          items.push(visual);
          const placeNode = (node, x, y, radius, nestedGeometry = null) => {
            if (!node.macro) {
              leaves.push({
                id: node.ids[0],
                x,
                y,
                r: radius,
                rootItemId: item.id,
                level: slot.level,
              });
              return;
            }
            boundaries.push({
              id: node.id,
              item: node,
              x,
              y,
              r: radius,
              rootItemId: item.id,
              level: slot.level,
              outer: node.id === item.id,
            });
            const geometry =
              nestedGeometry ||
              packNestedUnitShape(base, radius, node.level, slot.innerScale);
            node.children.forEach((childId, childIndex) => {
              const child = this.run.pack.nodes[childId],
                cell = geometry.children[childIndex];
              if (!cell) return;
              placeNode(child, x + cell.x, y + cell.y, cell.radius, cell.inner);
            });
          };
          placeNode(
            item,
            visual.x,
            visual.y,
            item.macro ? visual.r : visual.hitRadius,
          );
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
      leaves,
      boundaries,
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
        const leaves = visual.item.ids
            .map((id) => this.units.get(id))
            .filter(Boolean),
          x = leaves.length
            ? leaves.reduce((sum, dot) => sum + dot.x, 0) / leaves.length
            : visual.x,
          y = leaves.length
            ? leaves.reduce((sum, dot) => sum + dot.y, 0) / leaves.length
            : visual.y;
        return { x, y, r: visual.hitRadius ?? visual.r };
      }),
      x = dots.reduce((sum, dot) => sum + dot.x, 0) / dots.length,
      y = dots.reduce((sum, dot) => sum + dot.y, 0) / dots.length,
      itemIds = visuals.map((visual) => visual.item.id);

    return {
      pieceId: this.run.pieces[0].id,
      ids: visuals.flatMap((visual) => visual.item.ids),
      rawIds: visuals.flatMap((visual) => visual.item.ids),
      itemIds,
      itemId: itemIds.length === 1 ? itemIds[0] : null,
      kind: "pack-selection",
      level: levelLayout.level,
      macro: visuals.length === 1 && visuals[0].item.macro,
      anchor: { x, y },
      radius: Math.max(8, ...dots.map((dot) => Math.hypot(dot.x - x, dot.y - y) + dot.r)),
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
          tr: 5,
          vx: 0,
          vy: 0,
          visible: false,
        });
    for (const unit of this.units.values()) unit.visible = false;

    for (const leaf of layout.leaves) {
      const d = this.units.get(leaf.id);
      Object.assign(d, {
        tx: leaf.x,
        ty: leaf.y,
        tr: leaf.r,
        visible: true,
        packItemId: leaf.rootItemId,
        packLevel: leaf.level,
      });
      if (!d.initialized) {
        d.x = d.tx;
        d.y = d.ty;
        d.r = d.tr;
        d.initialized = true;
      } else if (!this.motion && !d.manual) d.r = d.tr;
    }
    const activeBoundaries = new Set();
    for (const boundary of layout.boundaries) {
      activeBoundaries.add(boundary.id);
      const state = this.boundaryVisuals.get(boundary.id) || {
        id: boundary.id,
        rawIds: [...boundary.item.ids],
        radius: boundary.r,
        alpha: 0,
      };
      Object.assign(state, {
        rawIds: [...boundary.item.ids],
        targetRadius: boundary.r,
        targetAlpha: 1,
        outer: boundary.outer,
      });
      this.boundaryVisuals.set(boundary.id, state);
    }
    for (const [id, state] of this.boundaryVisuals)
      if (!activeBoundaries.has(id)) state.targetAlpha = 0;
    const piece = this.run.pieces[0];
    const lower = layout.slots.find((slot) => slot.level === 0);
    if (piece && lower)
      this.positions.set(piece.id, {
        x: lower.x,
        y: lower.y,
      });
  }

  read() {
    if (this.run?.stage.area !== "pack") return super.read();
    const layout = this.packLayout(),
      pack = this.run.pack,
      moving =
        Math.abs(this.rotation) > 0.005 ||
        Math.abs(this.rotationTarget) > 0.005 ||
        [...this.units.values()].some(
          (d) =>
            d.visible &&
            (Math.hypot(d.x - d.tx, d.y - d.ty) > 1 ||
              Math.abs(d.r - (d.tr ?? d.r)) > 0.1),
        ),
      items = layout.items.map((visual) => {
        const center = visual.item.ids
            .map((id) => this.units.get(id))
            .filter(Boolean),
          x = center.length
            ? center.reduce((sum, dot) => sum + dot.x, 0) / center.length
            : visual.x,
          y = center.length
            ? center.reduce((sum, dot) => sum + dot.y, 0) / center.length
            : visual.y;
        return {
          id: visual.item.id,
          ids: [...visual.item.ids],
          rawIds: [...visual.item.ids],
          n: 1,
          level: visual.level,
          macro: visual.item.macro,
          x,
          y,
          radius: visual.r,
          children: [...visual.item.children],
          tree: this.packTree(visual.item.id),
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
        x: layout.slots.find((slot) => slot.level === 0)?.x || this.w / 2,
        y: layout.slots.find((slot) => slot.level === 0)?.y || this.h * 0.72,
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
        radixGeometry: radixFrame(pack.base, layout.slotRadius * 0.61).points,
        rotation: {
          angle: this.rotation,
          target: this.rotationTarget,
          active: !!this.rotationGesture?.moved,
        },
        viewports: layout.slots.map((slot) => ({
          level: slot.level,
          x: slot.x,
          y: slot.y,
          radius: slot.radius,
          frameRadius: slot.frameRadius,
          depth: slot.depth,
          innerScale: slot.innerScale,
          ghost: slot.ghost,
          revealed: !slot.ghost,
        })),
        revealedLevels: [...this.revealedLevels].sort((a, b) => a - b),
        revealCount: this.scaleRevealCount,
        scaleHintCount: this.scaleHintCount,
        transition: this.activeTransition(),
        items,
        renderedDots: layout.leaves.map((leaf) => {
          const dot = this.units.get(leaf.id);
          return {
            id: leaf.id,
            x: dot?.x ?? leaf.x,
            y: dot?.y ?? leaf.y,
            radius: dot?.r ?? leaf.r,
            rootItemId: leaf.rootItemId,
            level: leaf.level,
          };
        }),
        rawIds: layout.leaves.map((leaf) => leaf.id),
        places,
        control,
      },
    };
  }

  packTree(itemId) {
    const item = this.run.pack.nodes[itemId];
    return {
      id: item.id,
      level: item.level,
      rawIds: [...item.ids],
      children: item.children.map((childId) => this.packTree(childId)),
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
    for (const levelLayout of [...layout.levels].reverse()) {
      if (!levelLayout.items.length) continue;
      const leafSelections = levelLayout.shape.nodes
          .filter((node) => node.indices.length === 1)
          .map((node) => this.packSelection(levelLayout, node.id))
          .sort(
            (a, b) =>
              Math.hypot(x - a.anchor.x, y - a.anchor.y) -
              Math.hypot(x - b.anchor.x, y - b.anchor.y),
          ),
        itemHit = leafSelections.find(
          (candidate) =>
            Math.hypot(x - candidate.anchor.x, y - candidate.anchor.y) <=
            candidate.radius + 5,
        );
      if (itemHit) return itemHit;

      const root = this.packSelection(levelLayout),
        distance = Math.hypot(x - root.anchor.x, y - root.anchor.y);
      if (distance <= root.radius + 7) {
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
              Math.max(8, candidate.radius * 0.62),
          );
        return group || root;
      }
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
        center.x <= boundaryX + 12 &&
        Math.abs(center.y - source.y) <= Math.max(source.radius, 42)
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
        const boundaryX = (source.x + lower.x) / 2;
        if (
          center.x >= boundaryX - 12 &&
          Math.abs(center.y - source.y) <= Math.max(source.radius, 42)
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
    this.drawNestedUnits(layout);
    this.drawPackControl();
    c.restore();
  }

  drawNestedUnits(layout) {
    const dt = Math.min(32, Math.max(0, this.clock - this.boundaryClock));
    this.boundaryClock = this.clock;
    const amount = this.motion ? 1 - Math.exp(-dt / 110) : 1;
    for (const state of this.boundaryVisuals.values()) {
      state.radius += ((state.targetRadius ?? state.radius) - state.radius) * amount;
      state.alpha += ((state.targetAlpha ?? 1) - state.alpha) * amount;
      if (Math.abs(state.radius - (state.targetRadius ?? state.radius)) < 0.02)
        state.radius = state.targetRadius;
      if (Math.abs(state.alpha - (state.targetAlpha ?? 1)) < 0.01)
        state.alpha = state.targetAlpha;
    }
    for (const [id, state] of this.boundaryVisuals) {
      if (!state.alpha && !state.targetAlpha) {
        this.boundaryVisuals.delete(id);
        continue;
      }
      const dots = state.rawIds
          .map((rawId) => this.units.get(rawId))
          .filter(Boolean),
        x = dots.length
          ? dots.reduce((sum, dot) => sum + dot.x, 0) / dots.length
          : this.w / 2,
        y = dots.length
          ? dots.reduce((sum, dot) => sum + dot.y, 0) / dots.length
          : this.h * 0.6,
        selected = this.drag?.itemIds?.includes(id),
        alpha = (selected ? 0.72 : state.outer ? 0.34 : 0.19) * state.alpha;
      this.circle(
        x,
        y,
        state.radius * (selected ? 1.06 : 0.98),
        this.color + Math.round(alpha * 255).toString(16).padStart(2, "0"),
        selected ? 1.55 : 0.9,
      );
    }
  }

  drawRadixFrame(slot, base, alpha, radiusScale = 1) {
    const c = this.ctx,
      frame = radixFrame(base, slot.radius * 0.61 * slot.innerScale * radiusScale),
      points = frame.points.map((point) => ({
        x: slot.x + point.x,
        y: slot.y + point.y,
      }));
    c.save();
    c.globalAlpha *= alpha;
    c.strokeStyle = this.color;
    c.lineWidth = 1.05;
    c.beginPath();
    points.forEach((point, index) =>
      index ? c.lineTo(point.x, point.y) : c.moveTo(point.x, point.y),
    );
    c.closePath();
    c.stroke();
    c.fillStyle = this.color;
    for (const point of points) {
      c.beginPath();
      c.arc(point.x, point.y, Math.max(1.3, slot.radius * 0.034), 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  drawPackViewports(layout) {
    const c = this.ctx,
      transition = this.radixTransition,
      progress = transition
        ? clamp((this.clock - transition.started) / transition.duration, 0, 1)
        : 1;
    if (layout.slots.length > 1 && Math.abs(this.rotation) > 0.035) {
      c.save();
      c.globalAlpha = 0.1;
      c.strokeStyle = this.color;
      c.lineWidth = 1;
      c.beginPath();
      layout.slots.forEach((slot, index) =>
        index
          ? c.lineTo(slot.x, slot.y)
          : c.moveTo(slot.x, slot.y),
      );
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
        alpha = hot
          ? 0.38
          : slot.ghost
            ? 0.12
            : levelLayout.items.length
              ? 0.22
              : 0.13;
      c.save();
      c.globalAlpha = Math.min(0.16, 0.035 + Math.abs(slot.depth) * 0.13);
      c.fillStyle = this.color;
      c.beginPath();
      c.ellipse(
        slot.x,
        slot.y + slot.depth * 12,
        slot.radius * 0.72,
        slot.radius * (0.09 + Math.abs(slot.depth) * 0.025),
        0,
        0,
        Math.PI * 2,
      );
      c.fill();
      c.restore();
      this.circle(
        slot.x,
        slot.y,
        slot.radius,
        this.color + (hot ? "42" : slot.ghost ? "14" : "1c"),
        hot ? 1.4 : 0.8,
      );
      if (transition) {
        this.drawRadixFrame(slot, transition.from, alpha * (1 - progress));
        this.drawRadixFrame(slot, transition.to, alpha * progress);
      } else this.drawRadixFrame(slot, this.run.pack.base, alpha, 1);
    }
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
    if (this.run?.stage.area === "pack") {
      for (const dot of this.units.values())
        if (dot.visible && !dot.manual && Number.isFinite(dot.tr)) {
          if (!this.motion) dot.r = dot.tr;
          else dot.r += (dot.tr - dot.r) * Math.min(1, dt / 80);
        }
    }
    super.drawUnits(dt);
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
      const draggedIds = [...new Set(drag?.ids || [])],
        firstLevel =
          result.bundles.length > 0 &&
          !this.revealedLevels.has(result.carryLevel),
        firstHint = result.bundles.length > 0 && !this.scaleHintShown;
      if (result.bundles.length && firstLevel) {
        this.revealedLevels.add(result.carryLevel);
        this.scaleRevealCount++;
      }
      for (const id of draggedIds) {
        const dot = this.units.get(id);
        if (dot) dot.manual = true;
      }
      const layout = this.packLayout();
      this.sync();
      const targetById = new Map(layout.leaves.map((leaf) => [leaf.id, leaf]));

      if (result.bundles.length) {
        const carryIds = [],
          formationTargets = [],
          source = layout.slots.find((slot) => slot.level === result.level),
          formationShape = shape(
            this.run.pack.base,
            Math.max(10, (source?.radius || layout.slotRadius) * 0.4),
          );
        for (const bundle of result.bundles) {
          const childNodes = bundle.childItemIds.map(
              (id) => this.run.pack.nodes[id],
            ),
            childCenters = childNodes.map((node) => {
              const dots = node.ids.map((id) => this.units.get(id));
              return {
                x: dots.reduce((sum, dot) => sum + dot.x, 0) / dots.length,
                y: dots.reduce((sum, dot) => sum + dot.y, 0) / dots.length,
              };
            }),
            center = {
              x: childCenters.reduce((sum, point) => sum + point.x, 0) / childCenters.length,
              y: childCenters.reduce((sum, point) => sum + point.y, 0) / childCenters.length,
            };
          childNodes.forEach((node, index) => {
            const point = formationShape.dots[index],
              childCenter = childCenters[index];
            node.ids.forEach((id) => {
              const dot = this.units.get(id),
                target = {
                  x: center.x + point.x + dot.x - childCenter.x,
                  y: center.y + point.y + dot.y - childCenter.y,
                  r: dot.r,
                };
              carryIds.push(id);
              formationTargets.push(target);
              dot.visible = true;
              dot.manual = true;
            });
          });
        }
        await this.tween(
          carryIds,
          formationTargets,
          this.motion ? 185 : 1,
          token,
        );
        if (token !== this.token) return;

        const remainderIds = result.remainderItemIds.flatMap(
            (id) => this.run.pack.nodes[id].ids,
          ),
          settleIds = [...new Set([...carryIds, ...remainderIds])],
          settleTargets = settleIds.map((id) => {
            const target = targetById.get(id);
            return target
              ? { x: target.x, y: target.y, r: target.r }
              : { x: origin.x, y: origin.y };
          });
        for (const id of remainderIds) {
          const dot = this.units.get(id);
          if (dot) {
            dot.visible = true;
            dot.manual = true;
          }
        }
        await this.tween(
          settleIds,
          settleTargets,
          this.motion ? 285 : 1,
          token,
        );
        if (token !== this.token) return;
        for (const bundle of result.bundles) {
          const target = layout.items.find((visual) => visual.item.id === bundle.itemId);
          this.burst(target?.x ?? origin.x, target?.y ?? origin.y, this.color, 0.35);
        }
        this.onCue?.("merge");
        if (firstHint) this.triggerScaleHint();
      } else {
        const settleIds = draggedIds,
          settleTargets = settleIds.map((id) => {
            const target = targetById.get(id);
            return target
              ? { x: target.x, y: target.y, r: target.r }
              : { x: this.units.get(id)?.x ?? origin.x, y: this.units.get(id)?.y ?? origin.y };
          });
        await this.tween(settleIds, settleTargets, this.motion ? 190 : 1, token);
        if (token !== this.token) return;
      }
    } else if (result.type === "unpack") {
      const childIds = [...result.ids];
      for (const id of childIds) {
        const dot = this.units.get(id);
        if (dot) {
          dot.visible = true;
          dot.manual = true;
        }
      }
      const layout = this.packLayout();
      this.sync();
      const targets = new Map(layout.leaves.map((leaf) => [leaf.id, leaf]));
      await this.tween(
        childIds,
        childIds.map((id) => {
          const target = targets.get(id);
          return target
            ? { x: target.x, y: target.y, r: target.r }
            : { x: this.units.get(id).x, y: this.units.get(id).y };
        }),
        this.motion ? 310 : 1,
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
