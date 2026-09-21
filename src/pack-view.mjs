import { FlowWorld } from "./flow-view.mjs";
import {
  shape,
  compactPackNestedUnitShape,
  PACK_RAW_DOT_WORLD_RADIUS,
  packPlaceFrameRadius,
  packPlaceUnitCenters,
  packUnitFrameRadius,
  packUnitFrameInnerRadius,
} from "./shapes.mjs";
import {
  isCanonicalPack,
  packDigits,
  packRawQuantityForLevel,
} from "./model.mjs";
import { drawNumberReadout, drawSelectorDots } from "./number-selector.mjs";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const ease = (value) => 1 - Math.pow(1 - value, 3);

export class PackWorld extends FlowWorld {
  constructor(canvas) {
    super(canvas);
    this.showDragCount = false;
    this.revealedLevels = new Set([0]);
    this.radixTransition = null;
    this.activationVisual = null;
    this.boundaryVisuals = new Map();
    this.boundaryClock = 0;
    this.previewPackState = null;
    this.carryPulse = null;
    this.massAnchorOverride = null;
    this.packImpacts = [];
    this.activePackProjectileId = null;
    this.packControlX = null;
    this.packNotation = null;
  }

  setRun(run) {
    this.revealedLevels = new Set([0]);
    this.radixTransition = null;
    this.activationVisual = null;
    this.boundaryVisuals.clear();
    this.boundaryClock = this.clock;
    this.previewPackState = null;
    this.carryPulse = null;
    this.massAnchorOverride = null;
    this.packImpacts = [];
    this.activePackProjectileId = null;
    this.packControlX = null;
    this.packNotation = null;
    super.setRun(run);
    if (run?.stage.area === "pack")
      this.revealedLevels = new Set(run.pack.discoveredLevels);
  }

  drawTargets() {
    if (this.run?.stage.area !== "pack") return super.drawTargets();
    if (this.run.pack.phase === "pack") this.drawPackTarget();
  }

  packTargetLayout() {
    const digits = this.run.pack.target.digits,
      count = digits.length,
      state = this.previewPackState,
      activeIds = state?.active || this.run.pack.active,
      activeItems = activeIds.map((id) => this.run.pack.nodes[id]),
      total = this.run.stage.quantity || this.run.dots.length,
      reservedPlaceCount = Math.floor(Math.log2(total)) + 1,
      playerPlaceCount =
        Math.max(
          0,
          ...[...(state?.discoveredLevels || this.run.pack.discoveredLevels),
            ...activeItems.map((item) => item.level)],
        ) + 1,
      frameRadius = packPlaceFrameRadius(
        this.w,
        Math.max(count, playerPlaceCount, reservedPlaceCount),
        this.h,
      ),
      unitRadius = packUnitFrameRadius(frameRadius),
      pitch = count > 1
        ? Math.min(2 * frameRadius + 14, (this.w - 2 * frameRadius - 24) / (count - 1))
        : 0,
      x0 = (this.w - pitch * (count - 1)) / 2,
      enemy = this.enemyPoint(),
      y = enemy.y + enemy.radius + frameRadius + 8;
    return {
      x: this.w / 2,
      y,
      frameRadius,
      unitFrameRadius: unitRadius,
      places: digits.map((digit, index) => {
        const x = x0 + pitch * index,
          level = count - index - 1,
          centers = packPlaceUnitCenters(digit, frameRadius, unitRadius);
        return {
          level,
          digit,
          x,
          y,
          frameRadius,
          units: centers.map((center) => ({
            x: x + center.x,
            y: y + center.y,
            radius: unitRadius,
          })),
        };
      }),
    };
  }

  drawPackTarget() {
    const c = this.ctx,
      target = this.packTargetLayout(),
      activation = this.activationVisual,
      progress = activation
        ? clamp((this.clock - activation.started) / activation.duration, 0, 1)
        : 0,
      alpha = activation ? 0.55 + progress * 0.4 : 0.42;
    c.save();
    for (const place of target.places) {
      c.globalAlpha = place.digit ? alpha : alpha * 0.55;
      c.fillStyle = this.color + "08";
      c.strokeStyle = this.color + (place.digit ? "c0" : "72");
      c.lineWidth = place.digit ? 1.3 : 1;
      c.setLineDash(place.digit ? [] : [3, 4]);
      c.beginPath();
      c.roundRect(
        place.x - place.frameRadius,
        place.y - place.frameRadius,
        place.frameRadius * 2,
        place.frameRadius * 2,
        9,
      );
      c.fill();
      c.stroke();
      c.setLineDash([]);
      for (const unit of place.units)
        this.drawPackGhostUnit(unit.x, unit.y, unit.radius, alpha);
    }
    c.restore();
  }

  drawPackGhostUnit(x, y, radius, alpha) {
    const c = this.ctx;
    c.save();
    c.globalAlpha = alpha;
    c.fillStyle = this.color + "24";
    c.strokeStyle = this.color + "e0";
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(x, y, radius, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.restore();
  }

  async playPackTargetActivation() {
    const target = this.packTargetLayout(),
      token = this.token;
    this.busy = true;
    this.drag = null;
    this.hover = null;
    this.activationVisual = {
      started: this.clock,
      duration: this.motion ? 300 : 95,
    };
    this.sync();
    this.burst(target.x, target.y, this.color, 0.32);
    await this.waitPackMotion(this.activationVisual.duration, token);
    if (token !== this.token) return false;
    this.activationVisual = null;
    this.busy = false;
    this.sync();
    return true;
  }

  async animatePackAttack(plan, onImpact) {
    this.busy = true;
    this.hover = null;
    this.drag = null;
    this.packImpacts = [];
    const token = this.token,
      enemy = this.enemyPoint(),
      target = { x: enemy.x, y: enemy.y + enemy.radius * 0.48 };
    for (const payload of plan.payloads) {
      if (token !== this.token) return false;
      const dots = payload.rawIds.map((id) => this.units.get(id));
      if (dots.some((dot) => !dot))
        throw new Error(`PACK attack payload has no visible unit: ${payload.itemId}`);
      this.activePackProjectileId = payload.itemId;
      for (const dot of dots) {
        dot.visible = true;
        dot.manual = true;
        dot.flight = true;
      }
      const center = {
          x: dots.reduce((sum, dot) => sum + dot.wx, 0) / dots.length,
          y: dots.reduce((sum, dot) => sum + dot.wy, 0) / dots.length,
        },
        dx = target.x - center.x,
        dy = target.y - center.y;
      await this.tweenPackWorld(
        payload.rawIds,
        dots.map((dot) => ({ x: dot.wx + dx, y: dot.wy + dy })),
        this.motion ? 265 : 88,
        token,
        true,
      );
      if (token !== this.token) return false;
      for (const dot of dots) dot.flight = false;
      this.activePackProjectileId = null;
      this.packImpacts.push({ itemId: payload.itemId, born: this.clock });
      this.burst(target.x, target.y, "#ffd5d7", 0.48);
      if (!onImpact(payload.itemId).ok)
        throw new Error(`PACK attack payload failed: ${payload.itemId}`);
      this.onCue?.("hit");
      if (plan.payloads.length > 1)
        await this.waitPackMotion(this.motion ? 58 : 12, token);
    }
    return token === this.token;
  }

  async animatePackBreak() {
    const token = this.token,
      enemy = this.enemyPoint();
    this.deadAt = this.clock;
    this.flash = 0.9;
    this.burst(enemy.x, enemy.y, "#fff0c2", 0.75);
    await this.waitPackMotion(this.motion ? 465 : 220, token);
    if (token !== this.token) return false;
    this.busy = false;
    return true;
  }

  async waitPackMotion(ms, token) {
    const start = this.clock;
    await new Promise((resolve) => {
      const tick = () => {
        if (token !== this.token || this.clock - start >= ms) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return token === this.token;
  }

  async radixChanged(from, to) {
    if (from === to || this.run?.stage.area !== "pack") return false;
    this.clearPackNotation();
    this.radixTransition = this.motion
      ? { from, to, started: this.clock, duration: 220 }
      : null;
    this.busy = true;
    this.previewPackState = null;
    this.sync();
    const token = this.token,
      ids = [...this.units.keys()].filter((id) => this.units.get(id)?.visible),
      targets = ids.map((id) => {
        const dot = this.units.get(id);
        return { x: dot.twx, y: dot.twy };
      });
    await this.tweenPackWorld(ids, targets, this.motion ? 220 : 45, token, true);
    if (token !== this.token) return false;
    for (const dot of this.units.values()) dot.manual = false;
    this.busy = false;
    this.sync();
    return true;
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
      progress: clamp((this.clock - transition.started) / transition.duration, 0, 1),
    };
  }

  showPackCompletionNotation(notation) {
    if (!notation || this.run?.stage.area !== "pack") return false;
    const key = `${notation.quantity}:${notation.digits}:${notation.radix}`;
    if (this.packNotation?.key === key) return false;
    this.packNotation = {
      ...notation,
      key,
      started: this.clock,
    };
    return true;
  }

  clearPackNotation() {
    const hadNotation = !!this.packNotation;
    this.packNotation = null;
    return hadNotation;
  }

  packNotationPresentation(layout) {
    const notation = this.packNotation;
    if (!notation) return null;
    const elapsed = Math.max(0, this.clock - notation.started),
      equalityHold = this.motion ? 1050 : 120,
      fadeDuration = this.motion ? 180 : 40,
      prefixAlpha = elapsed <= equalityHold
        ? 1
        : clamp(1 - (elapsed - equalityHold) / fadeDuration, 0, 1),
      phase = elapsed < equalityHold + fadeDuration ? "equality" : "compact",
      mainSize = 17,
      subscriptSize = 11,
      prefix = `${notation.quantity} =`,
      c = this.ctx;
    c.save();
    c.font = `600 ${mainSize}px ui-rounded,system-ui,sans-serif`;
    const digitWidth = c.measureText(notation.digits).width,
      prefixWidth = c.measureText(prefix).width;
    c.font = `600 ${subscriptSize}px ui-rounded,system-ui,sans-serif`;
    const radixWidth = c.measureText(notation.radix).width;
    c.restore();
    const notationWidth = digitWidth + 1 + radixWidth,
      notationStart = this.w / 2 - notationWidth / 2,
      prefixGap = 6,
      placeBottom = Math.max(
        0,
        ...layout.slots.map((slot) => slot.y + slot.frameRadius),
      ),
      control = this.packControl(),
      y = Math.min(placeBottom + 50, (control?.y ?? this.h - 24) - 38),
      left = phase === "compact"
        ? notationStart
        : notationStart - prefixGap - prefixWidth,
      right = notationStart + notationWidth;
    return {
      quantity: notation.quantity,
      digits: notation.digits,
      radix: notation.radix,
      phase,
      prefixAlpha,
      x: this.w / 2,
      y,
      left,
      right,
      top: y - mainSize * 0.6,
      bottom: y + Math.max(mainSize * 0.55, 5 + subscriptSize * 0.5),
    };
  }

  handle(piece) {
    if (this.run?.stage.area === "pack") return null;
    return super.handle(piece);
  }

  packLayout() {
    const pack = this.run.pack,
      state = this.previewPackState,
      total = this.run.stage.quantity || this.run.dots.length,
      base = pack.base,
      activeIds = state?.active || pack.active,
      activeItems = activeIds
        .map((id) => pack.nodes[id])
        .sort((a, b) => a.level - b.level || a.order - b.order),
      discoveredLevels = state?.discoveredLevels || pack.discoveredLevels,
      massRawIds = state?.numberMassRawIds || pack.numberMassRawIds,
      discoveredMax = Math.max(0, ...discoveredLevels, ...activeItems.map((item) => item.level)),
      placeCount = discoveredMax + 1,
      frameRadius = packPlaceFrameRadius(
        this.w,
        Math.max(
          placeCount,
          pack.target.digits.length,
          Math.floor(Math.log2(total)) + 1,
        ),
        this.h,
      ),
      unitFrameRadius = packUnitFrameRadius(frameRadius),
      unitInnerRadius = packUnitFrameInnerRadius(unitFrameRadius),
      enemy = this.enemyPoint(),
      targetY = enemy.y + enemy.radius + frameRadius + 8,
      placeY = Math.max(this.h * 0.42, targetY + frameRadius * 2 + 12),
      pitch = placeCount > 1
        ? Math.min(2 * frameRadius + 14, (this.w - 2 * frameRadius - 24) / (placeCount - 1))
        : 0,
      x0 = (this.w - pitch * (placeCount - 1)) / 2,
      slots = Array.from({ length: placeCount }, (_, index) => {
        const level = discoveredMax - index;
        return {
          level,
          x: x0 + pitch * index,
          y: placeY,
          radius: frameRadius,
          frameRadius,
          visible: true,
        };
      }),
      levels = [],
      items = [],
      leaves = [],
      boundaries = [],
      massCenter = this.massAnchorOverride || {
        x: this.w / 2,
        y: Math.min(this.h * 0.68, this.h - 115),
      },
      massRadius = Math.min(42, this.w * 0.14, this.h * 0.1),
      massShape = shape(total, massRadius),
      massDotRadius = Math.max(3.8, Math.min(7, massShape.dotRadius)),
      mass = {
        rawIds: [...massRawIds],
        quantity: massRawIds.length,
        x: massCenter.x,
        y: massCenter.y,
        radius: massShape.radius,
        dots: [],
      };

    for (const rawId of massRawIds) {
      const index = this.run.dots.findIndex((dot) => dot.id === rawId),
        offset = massShape.dots[index] || { x: 0, y: 0 };
      leaves.push({
        id: rawId,
        x: mass.x + offset.x,
        y: mass.y + offset.y,
        r: massDotRadius,
        rootItemId: "mass",
        level: null,
        container: "mass",
      });
    }
    mass.dots = leaves
      .filter((leaf) => leaf.container === "mass")
      .map(({ id, x, y, r }) => ({ id, x, y, r }));

    for (const slot of slots) {
      const levelItems = activeItems
          .filter((item) => item.level === slot.level)
          .sort((a, b) => a.order - b.order),
        arrangement = levelItems.length
          ? shape(levelItems.length, 54)
          : { dots: [], nodes: [], radius: 0, dotRadius: 0 },
        centers = packPlaceUnitCenters(
          levelItems.length,
          slot.frameRadius,
          unitFrameRadius,
        ),
        rawQuantity = packRawQuantityForLevel(this.run, slot.level, activeIds),
        visuals = levelItems.map((item, index) => {
          const center = centers[index] || { x: 0, y: 0 },
            x = slot.x + center.x,
            y = slot.y + center.y,
            geometry = compactPackNestedUnitShape(
              base,
              item.level,
              unitInnerRadius,
              PACK_RAW_DOT_WORLD_RADIUS,
            ),
            visual = {
              item,
              level: slot.level,
              x,
              y,
              radius: unitFrameRadius,
              unitFrameRadius,
              visible: true,
              representative: item.ids[0],
            };
          items.push(visual);
          for (const dot of geometry.dots)
            leaves.push({
              id: item.ids[dot.index],
              x: x + dot.x,
              y: y + dot.y,
              r: dot.radius,
              rootItemId: item.id,
              level: slot.level,
              container: "place",
            });
          for (const group of geometry.groups) {
            const ids = item.ids.slice(group.start, group.start + group.count),
              outer = group.groupLevel === item.level;
            boundaries.push({
              id: `${item.id}:g${group.groupLevel}:${group.start}`,
              item: { id: item.id, ids },
              x: x + group.x,
              y: y + group.y,
              radius: group.radius,
              rootItemId: item.id,
              level: slot.level,
              outer,
            });
          }
          return visual;
        });
      levels.push({
        level: slot.level,
        slot,
        items: visuals,
        shape: arrangement,
        rawQuantity,
      });
    }
    return {
      total,
      base,
      slots: slots.map((slot) => ({ ...slot })),
      items,
      levels,
      leaves,
      boundaries,
      mass,
      frameRadius,
      unitFrameRadius,
      discoveredMax,
      discoveredLevels: [...discoveredLevels],
    };
  }

  packSelection(levelLayout, nodeId = levelLayout.shape.nodes?.[0]?.id) {
    const node = levelLayout.shape.nodes?.find((candidate) => candidate.id === nodeId);
    if (!node) return null;
    const visuals = node.indices.map((index) => levelLayout.items[index]),
      dots = visuals.map((visual) => {
        const leaves = visual.item.ids
            .map((id) => this.units.get(id))
            .filter((dot) => dot?.visible && Number.isFinite(dot.x)),
          x = leaves.length
            ? leaves.reduce((sum, dot) => sum + dot.x, 0) / leaves.length
            : visual.x,
          y = leaves.length
            ? leaves.reduce((sum, dot) => sum + dot.y, 0) / leaves.length
            : visual.y;
        return { x, y, r: visual.radius };
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
    this.revealedLevels = new Set(layout.discoveredLevels);
    for (const dot of this.run.dots)
      if (!this.units.has(dot.id))
        this.units.set(dot.id, {
          id: dot.id,
          x: this.w / 2,
          y: this.h * 0.8,
          tx: this.w / 2,
          ty: this.h * 0.8,
          r: 4,
          tr: 4,
          wx: this.w / 2,
          wy: this.h * 0.8,
          twx: this.w / 2,
          twy: this.h * 0.8,
          vx: 0,
          vy: 0,
          visible: false,
          initialized: false,
        });
    for (const unit of this.units.values()) unit.visible = false;
    for (const leaf of layout.leaves) {
      const dot = this.units.get(leaf.id);
      Object.assign(dot, {
        twx: leaf.x,
        twy: leaf.y,
        tx: leaf.x,
        ty: leaf.y,
        tr: leaf.r,
        visible: true,
        packItemId: leaf.rootItemId,
        packLevel: leaf.level,
      });
      if (!dot.initialized) {
        dot.wx = leaf.x;
        dot.wy = leaf.y;
        dot.x = leaf.x;
        dot.y = leaf.y;
        dot.r = leaf.r;
        dot.initialized = true;
      } else if (!dot.manual && !this.motion) {
        dot.wx = leaf.x;
        dot.wy = leaf.y;
        dot.x = leaf.x;
        dot.y = leaf.y;
        dot.r = leaf.r;
      }
    }
    const activeBoundaries = new Set();
    for (const boundary of layout.boundaries) {
      activeBoundaries.add(boundary.id);
      const state = this.boundaryVisuals.get(boundary.id) || {
        id: boundary.id,
        rawIds: [...boundary.item.ids],
        alpha: 0,
      };
      Object.assign(state, {
        rawIds: [...boundary.item.ids],
        targetAlpha: 1,
        radius: boundary.radius,
        outer: boundary.outer,
      });
      this.boundaryVisuals.set(boundary.id, state);
    }
    for (const [id, state] of this.boundaryVisuals)
      if (!activeBoundaries.has(id)) state.targetAlpha = 0;
    const piece = this.run.pieces[0];
    if (piece) this.positions.set(piece.id, { x: layout.mass.x, y: layout.mass.y });
  }

  read() {
    if (this.run?.stage.area !== "pack") return super.read();
    const layout = this.packLayout(),
      pack = this.run.pack,
      moving = [...this.units.values()].some(
        (dot) => dot.visible && Math.hypot(dot.x - dot.tx, dot.y - dot.ty) > 0.8,
      ),
      items = layout.items.map((visual) => {
        const dots = visual.item.ids
            .map((id) => this.units.get(id))
            .filter((dot) => dot?.visible && Number.isFinite(dot.x)),
          x = dots.length
            ? dots.reduce((sum, dot) => sum + dot.x, 0) / dots.length
            : visual.x,
          y = dots.length
            ? dots.reduce((sum, dot) => sum + dot.y, 0) / dots.length
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
          radius: visual.radius,
          frameRadius: layout.frameRadius,
          unitFrameRadius: visual.unitFrameRadius,
          visible: visual.visible,
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
          digit: place.itemIds.length,
          rawQuantity: levelLayout.rawQuantity,
          x: place.anchor.x,
          y: place.anchor.y,
          radius: place.radius,
          slot: { ...levelLayout.slot },
        };
      }),
      displayDigits = this.previewPackState
        ? [...(this.previewPackState.lowToHighDigits || [0])].reverse()
        : packDigits(this.run),
      control = this.packControl(),
      target = this.packTargetLayout(),
      notation = this.packNotationPresentation(layout);
    return {
      width: this.w,
      height: this.h,
      busy: this.busy,
      moving,
      pieces: [{
        id: this.run.pieces[0]?.id ?? 0,
        n: layout.mass.quantity,
        ids: [...layout.mass.rawIds],
        x: layout.mass.x,
        y: layout.mass.y,
        radius: layout.mass.radius,
        grip: null,
        parts: [],
        dots: [],
        kind: "number-mass",
      }],
      targets: [],
      gate: null,
      pack: {
        base: pack.base,
        allowedRadices: [...new Set(this.run.stage.radices)].sort((a, b) => a - b),
        phase: pack.phase,
        attack: pack.attack
          ? {
              payloads: structuredClone(pack.attack.payloads),
              impactedItemIds: [...pack.attack.impactedItemIds],
              resolvedRawIds: [...pack.attack.resolvedRawIds],
              activeItemId: this.activePackProjectileId,
            }
          : null,
        digits: displayDigits,
        targetActivated: pack.target.activated,
        targetGhost: {
          x: target.x,
          y: target.y,
          radius: target.frameRadius,
          unitFrameRadius: target.unitFrameRadius,
          places: target.places.map((place) => ({
            level: place.level,
            unitCount: place.units.length,
            empty: place.units.length === 0,
            x: place.x,
            y: place.y,
            frameRadius: place.frameRadius,
            unitFrameRadius: target.unitFrameRadius,
          })),
        },
        slots: layout.slots.map((slot) => ({ ...slot })),
        viewports: layout.slots.map((slot) => ({ ...slot })),
        revealedLevels: [...layout.discoveredLevels].sort((a, b) => a - b),
        revealCount: Math.max(0, ...layout.discoveredLevels),
        transition: this.activeTransition(),
        items,
        unitFrameRadius: layout.unitFrameRadius,
        renderedDots: layout.leaves.map((leaf) => {
          const dot = this.units.get(leaf.id);
          return {
            id: leaf.id,
            x: dot?.x ?? leaf.x,
            y: dot?.y ?? leaf.y,
            radius: dot?.r ?? leaf.r,
            visible: !!dot?.visible,
            rootItemId: leaf.rootItemId,
            level: leaf.level,
            container: leaf.container || "place",
          };
        }),
        rawIds: layout.leaves.map((leaf) => leaf.id),
        originalRawIds: this.run.dots.map((dot) => dot.id),
        numberMass: {
          ids: [...layout.mass.rawIds],
          quantity: layout.mass.quantity,
          x: layout.mass.x,
          y: layout.mass.y,
          radius: layout.mass.radius,
        },
        directInputLevels: layout.discoveredLevels.filter(
          (level) => layout.mass.quantity >= pack.base ** level,
        ),
        canonical: isCanonicalPack(this.run),
        complete: layout.mass.quantity === 0,
        notation,
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
        const dot = this.units.get(id);
        return { id, x: dot.x - x, y: dot.y - y };
      }),
      worldOffsets: selection.ids.map((id) => {
        const dot = this.units.get(id);
        return { id, x: dot.wx - x, y: dot.wy - y };
      }),
    };
  }

  cancel() {
    if (this.run?.stage.area !== "pack") return super.cancel();
    this.drag = null;
    this.hover = null;
    this.massAnchorOverride = null;
    for (const dot of this.units.values()) dot.manual = false;
    this.sync();
  }

  move(x, y) {
    if (this.run?.stage.area !== "pack") return super.move(x, y);
    if (!this.drag) return;
    this.drag.x = x;
    this.drag.y = y;
    if (this.drag.kind === "pack-mass") this.massAnchorOverride = { x, y };
    this.drag.offsets.forEach((offset) => {
      const dot = this.units.get(offset.id);
      dot.x = x + offset.x;
      dot.y = y + offset.y;
      dot.wx = dot.x;
      dot.wy = dot.y;
      dot.manual = true;
    });
    this.hover = this.dropTarget(x, y);
  }

  hit(x, y) {
    if (this.run?.stage.area !== "pack") return super.hit(x, y);
    const mass = this.packLayout().mass;
    if (mass.quantity && Math.hypot(x - mass.x, y - mass.y) <= Math.max(36, mass.radius + 13))
      return {
        pieceId: this.run.pieces[0].id,
        ids: [...mass.rawIds],
        rawIds: [...mass.rawIds],
        itemIds: [],
        itemId: null,
        kind: "pack-mass",
        level: 0,
        macro: false,
        anchor: { x: mass.x, y: mass.y },
        radius: mass.radius,
        children: [],
      };
    return null;
  }

  dropTarget(x, y) {
    if (this.run?.stage.area !== "pack") return super.dropTarget(x, y);
    if (!this.drag || this.drag.kind !== "pack-mass") return { kind: "cancel" };
    const layout = this.packLayout(),
      averageOffset = this.drag.offsets.reduce(
        (point, offset) => ({
          x: point.x + offset.x / this.drag.offsets.length,
          y: point.y + offset.y / this.drag.offsets.length,
        }),
        { x: 0, y: 0 },
      ),
      center = { x: x + averageOffset.x, y: y + averageOffset.y },
      targets = layout.slots
        .filter((slot) => this.run.pack.discoveredLevels.includes(slot.level))
        .map((slot) => ({ slot, distance: Math.hypot(center.x - slot.x, center.y - slot.y) }))
        .sort((a, b) => a.distance - b.distance),
      target = targets.find(
        ({ slot, distance }) =>
          distance <= Math.max(46, slot.frameRadius + 32) &&
          this.run.pack.numberMassRawIds.length >= this.run.pack.base ** slot.level,
      );
    return target ? { kind: "pack-input", level: target.slot.level } : { kind: "cancel" };
  }

  packControl() {
    if (this.run?.stage.area !== "pack" || this.run.status !== "play" || this.busy)
      return null;
    const y = Math.min(this.h - 37, this.h * 0.9),
      x1 = this.w * 0.08,
      x2 = this.w * 0.92,
      options = [...new Set(this.run.stage.radices)].sort((a, b) => a - b),
      index = options.indexOf(this.run.pack.base),
      x = this.packControlX ?? x1 + ((x2 - x1) * Math.max(0, index)) / Math.max(1, options.length - 1),
      position = x - x1,
      previewIndex = Math.round((position / Math.max(1, x2 - x1)) * (options.length - 1));
    return { x1, x2, y, x, current: this.run.pack.base, preview: options[clamp(previewIndex, 0, options.length - 1)], options };
  }

  packControlHit(x, y) {
    const control = this.packControl();
    return !!control && Math.abs(y - control.y) <= 27 && x >= control.x1 - 30 && x <= control.x2 + 30;
  }

  beginPackControl(x) {
    const control = this.packControl();
    if (!control) return false;
    this.packControlX = clamp(x, control.x1, control.x2);
    return true;
  }

  movePackControl(x) {
    const control = this.packControl();
    if (control) this.packControlX = clamp(x, control.x1, control.x2);
  }

  endPackControl() {
    const control = this.packControl();
    if (!control) return null;
    const position = (this.packControlX ?? control.x1) - control.x1,
      index = Math.round((position / Math.max(1, control.x2 - control.x1)) * (control.options.length - 1));
    this.packControlX = null;
    return control.options[clamp(index, 0, control.options.length - 1)];
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
    this.drawPackUnitFrames(layout, "fill");
    this.drawNestedUnits(layout);
    this.drawPackUnitFrames(layout, "stroke");
    this.drawNumberMass(layout.mass);
    this.drawPackDigitReadouts(layout);
    this.drawPackNotation(layout);
    this.drawPackControl();
    c.restore();
  }

  drawNumberMass(mass) {
    if (!mass.quantity) return;
    const c = this.ctx,
      selected = this.drag?.kind === "pack-mass",
      radius = mass.radius + (selected ? 15 : 11);
    c.save();
    c.globalAlpha = selected ? 0.9 : 0.66;
    c.strokeStyle = this.color;
    c.lineWidth = selected ? 2.2 : 1.2;
    c.setLineDash([3, 5]);
    c.beginPath();
    c.arc(mass.x, mass.y, radius, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    drawNumberReadout(this, mass.quantity, mass.x, mass.y - radius - 14, this.color, 16);
    c.restore();
  }

  drawPackDigitReadouts(layout) {
    const c = this.ctx;
    for (const levelLayout of layout.levels) {
      const slot = levelLayout.slot,
        rawQuantity = levelLayout.rawQuantity,
        hot = this.carryPulse &&
          (this.carryPulse.fromLevel === slot.level || this.carryPulse.toLevel === slot.level);
      c.save();
      c.globalAlpha = hot ? 1 : 0.88;
      drawNumberReadout(
        this,
        rawQuantity,
        slot.x,
        slot.y + slot.frameRadius + 23,
        this.color,
        17,
      );
      c.restore();
    }
  }

  drawPackNotation(layout) {
    const notation = this.packNotationPresentation(layout);
    if (!notation) return;
    const c = this.ctx,
      mainSize = 17,
      subscriptSize = 11,
      mainAlpha = 0.76;
    c.save();
    c.textBaseline = "middle";
    c.fillStyle = this.color + "d8";
    c.font = `600 ${mainSize}px ui-rounded,system-ui,sans-serif`;
    c.textAlign = "left";
    const digitWidth = c.measureText(notation.digits).width;
    c.globalAlpha = mainAlpha;
    c.fillText(notation.digits, notation.x - (digitWidth + 1 + (() => {
      c.font = `600 ${subscriptSize}px ui-rounded,system-ui,sans-serif`;
      const width = c.measureText(notation.radix).width;
      c.font = `600 ${mainSize}px ui-rounded,system-ui,sans-serif`;
      return width;
    })()) / 2, notation.y);
    const digitStart = notation.x - (digitWidth + 1 + (() => {
      c.font = `600 ${subscriptSize}px ui-rounded,system-ui,sans-serif`;
      const width = c.measureText(notation.radix).width;
      c.font = `600 ${mainSize}px ui-rounded,system-ui,sans-serif`;
      return width;
    })()) / 2;
    c.font = `600 ${subscriptSize}px ui-rounded,system-ui,sans-serif`;
    c.fillText(notation.radix, digitStart + digitWidth + 1, notation.y + 5);
    if (notation.prefixAlpha > 0) {
      c.globalAlpha = mainAlpha * notation.prefixAlpha;
      c.font = `600 ${mainSize}px ui-rounded,system-ui,sans-serif`;
      c.textAlign = "right";
      c.fillText(`${notation.quantity} =`, digitStart - 6, notation.y);
    }
    c.restore();
  }

  drawPackUnitFrames(layout, mode) {
    const c = this.ctx;
    for (const visual of layout.items) {
      const dots = visual.item.ids
          .map((id) => this.units.get(id))
          .filter((dot) => dot && Number.isFinite(dot.wx)),
        x = dots.length
          ? dots.reduce((sum, dot) => sum + dot.wx, 0) / dots.length
          : visual.x,
        y = dots.length
          ? dots.reduce((sum, dot) => sum + dot.wy, 0) / dots.length
          : visual.y;
      c.save();
      c.globalAlpha = mode === "fill" ? 1 : 0.9;
      c.beginPath();
      c.arc(x, y, visual.unitFrameRadius, 0, Math.PI * 2);
      if (mode === "fill") {
        c.fillStyle = this.color + "0a";
        c.fill();
      } else {
        c.strokeStyle = this.color + "82";
        c.lineWidth = 1.05;
        c.stroke();
      }
      c.restore();
    }
  }

  drawNestedUnits() {
    const dt = Math.min(32, Math.max(0, this.clock - this.boundaryClock));
    this.boundaryClock = this.clock;
    const amount = this.motion ? 1 - Math.exp(-dt / 110) : 1;
    for (const state of this.boundaryVisuals.values()) {
      state.alpha += ((state.targetAlpha ?? 1) - state.alpha) * amount;
      if (Math.abs(state.alpha - (state.targetAlpha ?? 1)) < 0.01)
        state.alpha = state.targetAlpha;
    }
    for (const [id, state] of this.boundaryVisuals) {
      if (!state.alpha && !state.targetAlpha) {
        this.boundaryVisuals.delete(id);
        continue;
      }
      const dots = state.rawIds.map((rawId) => this.units.get(rawId)).filter((dot) => dot && Number.isFinite(dot.wx)),
        x = dots.length ? dots.reduce((sum, dot) => sum + dot.wx, 0) / dots.length : this.w / 2,
        y = dots.length ? dots.reduce((sum, dot) => sum + dot.wy, 0) / dots.length : this.h * 0.6,
        selected = this.drag?.itemIds?.includes(id),
        alpha = (selected ? 0.23 : state.outer ? 0.12 : 0.2) * state.alpha,
        c = this.ctx;
      c.save();
      c.globalAlpha = alpha;
      c.fillStyle = this.color;
      c.strokeStyle = this.color;
      c.lineWidth = state.outer ? 1.05 : 0.8;
      c.beginPath();
      c.arc(x, y, state.radius, 0, Math.PI * 2);
      if (state.outer) c.fill();
      c.stroke();
      c.restore();
    }
  }

  drawPackViewports(layout) {
    const c = this.ctx;
    for (const levelLayout of layout.levels) {
      const slot = levelLayout.slot,
        hot = this.hover?.kind === "pack-input" && this.hover.level === slot.level,
        filled = levelLayout.items.length > 0;
      c.save();
      c.globalAlpha = hot ? 1 : filled ? 0.92 : 0.62;
      c.fillStyle = this.color + (hot ? "22" : "0c");
      c.strokeStyle = this.color + (hot ? "ff" : filled ? "c4" : "74");
      c.lineWidth = hot ? 2.2 : 1.35;
      c.beginPath();
      c.roundRect(slot.x - slot.frameRadius, slot.y - slot.frameRadius, slot.frameRadius * 2, slot.frameRadius * 2, 9);
      c.fill();
      c.stroke();
      c.restore();
    }
  }

  drawPackControl() {
    const control = this.packControl();
    if (!control) return;
    const c = this.ctx,
      selectedX = control.x1 + ((control.x2 - control.x1) * control.options.indexOf(control.preview)) / Math.max(1, control.options.length - 1);
    c.save();
    c.strokeStyle = this.color + "4d";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(control.x1, control.y);
    c.lineTo(control.x2, control.y);
    c.stroke();
    control.options.forEach((n, index) => {
      const x = control.x1 + ((control.x2 - control.x1) * index) / Math.max(1, control.options.length - 1),
        selected = n === control.preview;
      drawSelectorDots(this, n, x, control.y, this.color, {
        radius: 10,
        dotScale: 0.62,
        minimumDotRadius: 1.2,
        alpha: selected ? 1 : 0.58,
      });
    });
    this.circle(selectedX, control.y, 14, this.color + "dc", 1.6);
    drawNumberReadout(this, control.preview, selectedX, control.y - 25, this.color, 16);
    c.restore();
  }

  drawUnits(dt) {
    if (this.run?.stage.area === "pack") {
      const amount = this.motion ? 1 - Math.exp(-Math.min(32, dt) / 62) : 1;
      for (const dot of this.units.values()) {
        if (!Number.isFinite(dot.twx)) continue;
        if (!dot.manual) {
          dot.wx += (dot.twx - dot.wx) * amount;
          dot.wy += (dot.twy - dot.wy) * amount;
        }
        dot.x = dot.wx;
        dot.y = dot.wy;
        dot.r += (dot.tr - dot.r) * amount;
      }
    }
    super.drawUnits(dt);
  }

  async tweenPackWorld(ids, targets, ms, token, preserveReducedDuration = false) {
    const starts = ids.map((id) => {
      const dot = this.units.get(id);
      dot.visible = true;
      dot.manual = true;
      return { x: dot.wx, y: dot.wy };
    });
    if (!this.motion) ms = preserveReducedDuration ? ms : 1;
    const start = this.clock;
    await new Promise((resolve) => {
      const tick = () => {
        if (token !== this.token) {
          resolve();
          return;
        }
        const progress = ease(clamp((this.clock - start) / ms, 0, 1));
        ids.forEach((id, index) => {
          const dot = this.units.get(id),
            target = targets[index],
            origin = starts[index];
          if (!dot || !target) return;
          dot.wx = origin.x + (target.x - origin.x) * progress;
          dot.wy = origin.y + (target.y - origin.y) * progress;
          dot.x = dot.wx;
          dot.y = dot.wy;
        });
        if (progress < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    return token === this.token;
  }

  async animatePack(result) {
    if (!result.ok || result.type !== "pour") return;
    this.busy = true;
    this.hover = null;
    const token = this.token,
      drag = this.drag;
    if (drag?.kind === "pack-mass") this.massAnchorOverride = { x: drag.x, y: drag.y };
    this.drag = null;
    for (const dot of this.units.values()) {
      dot.manual = true;
      dot.vx = 0;
      dot.vy = 0;
    }
    this.previewPackState = result.initialState;
    this.sync();
    for (const step of result.steps) {
      if (token !== this.token) return;
      this.previewPackState = step.state;
      if (step.type === "carry")
        this.carryPulse = { fromLevel: step.fromLevel, toLevel: step.toLevel, born: this.clock };
      this.sync();
      const moving = [...this.units.values()].filter(
          (dot) => dot.visible && Math.hypot(dot.wx - dot.twx, dot.wy - dot.twy) > 0.1,
        ),
        ids = moving.map((dot) => dot.id),
        targets = moving.map((dot) => ({ x: dot.twx, y: dot.twy })),
        duration = step.type === "carry" ? (this.motion ? 145 : 58) : (this.motion ? 58 : 21);
      if (ids.length) await this.tweenPackWorld(ids, targets, duration, token, true);
      if (token !== this.token) return;
      if (step.type === "carry") {
        const slot = this.packLayout().slots.find((candidate) => candidate.level === step.toLevel);
        if (slot) this.burst(slot.x, slot.y, this.color, 0.22);
        this.onCue?.("merge");
      } else {
        await this.tweenPackWorld([], [], this.motion ? 30 : 18, token, true);
      }
    }
    this.previewPackState = null;
    this.massAnchorOverride = null;
    this.carryPulse = null;
    for (const dot of this.units.values()) dot.manual = false;
    this.sync();
    await this.tween([], [], this.motion ? 90 : 35, token);
    if (token === this.token) this.busy = false;
  }
}
