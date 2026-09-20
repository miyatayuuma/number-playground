import { FlowWorld } from "./flow-view.mjs";
import {
  shape,
  packScaleViewports,
  packNestedUnitShape,
  PACK_RAW_DOT_WORLD_RADIUS,
} from "./shapes.mjs";
import { activePackItems, packDigits } from "./model.mjs";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const ease = (value) => 1 - Math.pow(1 - value, 3);
const PACK_NEAR_FRACTION = 0.34;
const PACK_FOCUS_STEP_FRACTION = 0.145;
const PACK_FOCUS_STEP_MIN = 40;
const PACK_FOCUS_STEP_MAX = 56;

export function projectPackPoint(point, camera, width, height) {
  const depth = point.z - camera.z;
  if (!(depth >= camera.near))
    return { x: null, y: null, scale: 0, depth, visible: false };
  const scale = camera.focalLength / depth;
  return {
    x: width / 2 + (point.x - camera.x) * scale,
    y: height / 2 + (point.y - camera.y) * scale,
    scale,
    depth,
    visible: true,
  };
}

export function packCameraForFocus(viewports, focusLevel = null) {
  const origin = viewports.find((viewport) => viewport.level === 0) || viewports.at(-1),
    near = origin.baseDistance * PACK_NEAR_FRACTION;
  if (focusLevel === null)
    return {
      mode: "overview",
      focusLevel: null,
      x: 0,
      y: 0,
      z: 0,
      focalLength: origin.focalLength,
      near,
    };
  const target = viewports.find((viewport) => viewport.level === focusLevel);
  if (!target) throw new RangeError(`Unknown PACK focus level ${focusLevel}`);
  return {
    mode: "focus",
    focusLevel,
    x: target.x,
    y: target.y,
    z: target.z - target.baseDistance,
    focalLength: target.focalLength,
    near,
  };
}

export function packFocusProgress(progress, maxLevel) {
  const maxAnchor = Math.max(1, Math.trunc(maxLevel) + 1),
    source = clamp(progress, 0, maxAnchor),
    sigma = 0.3,
    strength = 0.42;
  if (Math.abs(source - Math.round(source)) < 1e-12) return source;
  let attracted = source;
  for (let anchor = 0; anchor <= maxAnchor; anchor++) {
    const offset = source - anchor,
      pull = strength * Math.exp(-0.5 * (offset / sigma) ** 2);
    attracted -= offset * pull;
  }
  return clamp(attracted, 0, maxAnchor);
}

export function packCameraForInspection(viewports, progress, maxLevel) {
  const maxKnown = Math.max(0, Math.trunc(maxLevel)),
    rawProgress = clamp(progress, 0, maxKnown + 1),
    position = packFocusProgress(rawProgress, maxKnown),
    anchors = [
      packCameraForFocus(viewports, null),
      ...Array.from({ length: maxKnown + 1 }, (_, level) =>
        packCameraForFocus(viewports, level),
      ),
    ],
    segment = Math.min(Math.floor(position), anchors.length - 2),
    amount = position >= anchors.length - 1 ? 1 : position - segment,
    from = anchors[segment],
    to = anchors[segment + 1],
    focusAnchor = Math.round(position);
  return {
    mode: "inspection",
    focusLevel: focusAnchor === 0 ? null : focusAnchor - 1,
    focusAnchor,
    inspectionProgress: position,
    inputProgress: rawProgress,
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
    z: from.z + (to.z - from.z) * amount,
    focalLength:
      from.focalLength + (to.focalLength - from.focalLength) * amount,
    near: from.near,
  };
}

export class PackWorld extends FlowWorld {
  constructor(canvas) {
    super(canvas);
    this.showDragCount = false;
    this.revealedLevels = new Set([0]);
    this.scaleRevealCount = 0;
    this.radixTransition = null;
    this.camera = null;
    this.cameraTransition = null;
    this.focusGesture = null;
    this.boundaryVisuals = new Map();
    this.boundaryClock = 0;
  }

  setRun(run) {
    this.revealedLevels = new Set([0]);
    this.scaleRevealCount = 0;
    this.radixTransition = null;
    this.camera = null;
    this.cameraTransition = null;
    this.focusGesture = null;
    this.boundaryVisuals.clear();
    this.boundaryClock = this.clock;
    super.setRun(run);
  }

  resize() {
    super.resize();
    if (this.run?.stage.area !== "pack") return;
    const layout = this.packLayout();
    this.camera = packCameraForFocus(layout.planes, null);
    this.cameraTransition = null;
    this.focusGesture = null;
    this.sync();
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
    if (!this.paused && this.cameraTransition && this.run?.stage.area === "pack") {
      const transition = this.cameraTransition,
        progress = clamp(
          (this.clock + dt - transition.started) / transition.duration,
          0,
          1,
        ),
        amount = this.motion ? ease(progress) : progress;
      this.camera = Object.fromEntries(
        ["x", "y", "z", "focalLength"].map((key) => [
          key,
          transition.from[key] + (transition.to[key] - transition.from[key]) * amount,
        ]),
      );
      Object.assign(this.camera, {
        mode: transition.kind === "return" ? "returning" : transition.to.mode,
        focusLevel:
          transition.kind === "return" ? transition.focusLevel : null,
        near: transition.to.near,
      });
      if (progress >= 1) {
        this.camera = { ...transition.to };
        this.cameraTransition = null;
      }
      this.sync();
    }
    super.frame(t);
  }

  beginScaleFocus(x, y) {
    const maxLevel = Math.max(0, ...this.revealedLevels);
    this.focusGesture = {
      startX: x,
      startY: y,
      x,
      y,
      moved: false,
      maxLevel,
      inputProgress: 0,
      progress: 0,
    };
  }

  moveScaleFocus(x, y) {
    if (!this.focusGesture) return false;
    const gesture = this.focusGesture;
    gesture.x = x;
    gesture.y = y;
    const dx = x - gesture.startX,
      dy = y - gesture.startY;
    if (
      !gesture.moved &&
      (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2)
    )
      return false;
    gesture.moved = true;
    this.cameraTransition = null;
    const step = clamp(
        this.w * PACK_FOCUS_STEP_FRACTION,
        PACK_FOCUS_STEP_MIN,
        PACK_FOCUS_STEP_MAX,
      ),
      maxProgress = gesture.maxLevel + 1,
      inputProgress =
        dx >= 0
          ? clamp(dx / step, 0, 1)
          : clamp(-dx / step, 0, maxProgress),
      layout = this.packLayout();
    gesture.inputProgress = inputProgress;
    gesture.progress = packFocusProgress(inputProgress, gesture.maxLevel);
    this.camera = packCameraForInspection(
      layout.planes,
      inputProgress,
      gesture.maxLevel,
    );
    this.sync();
    return true;
  }

  endScaleFocus() {
    if (!this.focusGesture) return;
    const gesture = this.focusGesture;
    this.focusGesture = null;
    if (!gesture.moved) return;
    const from = { ...this.camera },
      to = packCameraForFocus(this.packLayout().planes, null),
      distance = Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z);
    if (distance < 0.5) {
      this.camera = to;
      this.cameraTransition = null;
      this.sync();
      return;
    }
    this.cameraTransition = {
      kind: "return",
      from,
      to,
      focusLevel: from.focusLevel,
      started: this.clock,
      duration: this.motion ? 190 : 88,
    };
    this.camera = { ...from, mode: "returning", focusLevel: null };
    this.sync();
  }

  cancelScaleFocus() {
    this.endScaleFocus();
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
      planes = packScaleViewports(discoveredMax, this.w, this.h, base, total);
    if (!this.camera) this.camera = packCameraForFocus(planes, null);
    const slots = planes.map((plane) => {
        const projected = projectPackPoint(
            { x: plane.x, y: plane.y, z: plane.z },
            this.camera,
            this.w,
            this.h,
          ),
          frameRadius = projected.visible
            ? plane.frameWorldRadius * projected.scale
            : 0;
        return {
          ...plane,
          worldX: plane.x,
          worldY: plane.y,
          worldZ: plane.z,
          x: projected.x,
          y: projected.y,
          frameRadius,
          radius: frameRadius,
          visible: projected.visible,
        };
      }),
      slotRadius = slots[0]?.frameRadius || 0,
      items = [],
      levels = [],
      leaves = [],
      boundaries = [];

    for (const slot of slots) {
      const levelItems = activeItems
          .filter((item) => item.level === slot.level)
          .sort((a, b) => a.order - b.order),
        centerShape = levelItems.length ? shape(levelItems.length, 54) : null,
        unitGeometry = packNestedUnitShape(base, slot.level),
        unitPositionScale = centerShape
          ? unitGeometry.radius / centerShape.dotRadius
          : 0,
        coefficient = levelItems.length
          ? centerShape
          : { dots: [], nodes: [], radius: 0, dotRadius: 0 },
        visuals = levelItems.map((item, index) => {
          const point = coefficient.dots[index],
            worldX = slot.worldX + (point?.x || 0) * unitPositionScale,
            worldY = slot.worldY + (point?.y || 0) * unitPositionScale,
            projection = projectPackPoint(
              { x: worldX, y: worldY, z: slot.worldZ },
              this.camera,
              this.w,
              this.h,
            ),
            itemGeometry = packNestedUnitShape(base, item.level),
            visual = {
              item,
              level: slot.level,
              worldX,
              worldY,
              worldZ: slot.worldZ,
              worldRadius: itemGeometry.radius,
              x: projection.x,
              y: projection.y,
              r: projection.visible
                ? itemGeometry.radius * projection.scale
                : 0,
              hitRadius: projection.visible
                ? itemGeometry.radius * projection.scale
                : 0,
              visible: projection.visible,
              representative: item.ids[0],
            };
          items.push(visual);
          const placeNode = (node, x, y, z) => {
            const geometry = packNestedUnitShape(base, node.level);
            if (!node.macro) {
              const projected = projectPackPoint(
                { x, y, z },
                this.camera,
                this.w,
                this.h,
              );
              leaves.push({
                id: node.ids[0],
                worldX: x,
                worldY: y,
                worldZ: z,
                worldRadius: PACK_RAW_DOT_WORLD_RADIUS,
                x: projected.x,
                y: projected.y,
                r: projected.visible
                  ? PACK_RAW_DOT_WORLD_RADIUS * projected.scale
                  : 0,
                visible: projected.visible,
                rootItemId: item.id,
                level: slot.level,
              });
              return;
            }
            boundaries.push({
              id: node.id,
              item: node,
              worldX: x,
              worldY: y,
              worldZ: z,
              worldRadius: geometry.frameRadius,
              contentWorldRadius: geometry.radius,
              rootItemId: item.id,
              level: slot.level,
              outer: node.id === item.id,
            });
            node.children.forEach((childId, childIndex) => {
              const child = this.run.pack.nodes[childId],
                cell = geometry.children[childIndex];
              if (!cell) return;
              placeNode(child, x + cell.x, y + cell.y, z);
            });
          };
          placeNode(item, worldX, worldY, slot.worldZ);
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
      planes,
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
            .filter((dot) => dot?.visible && Number.isFinite(dot.x)),
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
          wx: 0,
          wy: 0,
          wz: 0,
          twx: 0,
          twy: 0,
          twz: 0,
          worldRadius: PACK_RAW_DOT_WORLD_RADIUS,
          vx: 0,
          vy: 0,
          visible: false,
        });
    for (const unit of this.units.values()) unit.visible = false;

    for (const leaf of layout.leaves) {
      const d = this.units.get(leaf.id),
        target = projectPackPoint(
          { x: leaf.worldX, y: leaf.worldY, z: leaf.worldZ },
          this.camera,
          this.w,
          this.h,
        ),
        current = d.initialized
          ? projectPackPoint(
              { x: d.wx, y: d.wy, z: d.wz },
              this.camera,
              this.w,
              this.h,
            )
          : target;
      Object.assign(d, {
        twx: leaf.worldX,
        twy: leaf.worldY,
        twz: leaf.worldZ,
        worldRadius: leaf.worldRadius,
        tx: target.x,
        ty: target.y,
        tr: target.visible ? leaf.worldRadius * target.scale : 0,
        x: current.x ?? this.w / 2,
        y: current.y ?? this.h / 2,
        r: current.visible ? leaf.worldRadius * current.scale : 0,
        visible: current.visible,
        packItemId: leaf.rootItemId,
        packLevel: leaf.level,
      });
      if (!d.initialized) {
        d.wx = d.twx;
        d.wy = d.twy;
        d.wz = d.twz;
        d.x = d.tx ?? this.w / 2;
        d.y = d.ty ?? this.h / 2;
        d.r = d.tr;
        d.initialized = true;
      } else if (!d.manual && !this.motion) {
        d.wx = d.twx;
        d.wy = d.twy;
        d.wz = d.twz;
      }
    }
    const activeBoundaries = new Set();
    for (const boundary of layout.boundaries) {
      activeBoundaries.add(boundary.id);
      const state = this.boundaryVisuals.get(boundary.id) || {
        id: boundary.id,
        rawIds: [...boundary.item.ids],
        worldRadius: boundary.worldRadius,
        alpha: 0,
      };
      Object.assign(state, {
        rawIds: [...boundary.item.ids],
        targetAlpha: 1,
        worldRadius: boundary.worldRadius,
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
        !!this.focusGesture?.moved ||
        !!this.cameraTransition ||
        [...this.units.values()].some(
          (d) =>
            d.visible &&
            (Math.hypot(d.wx - d.twx, d.wy - d.twy, d.wz - d.twz) > 0.08 ||
              Math.abs(d.r - (d.tr ?? d.r)) > 0.1),
        ),
      items = layout.items.map((visual) => {
        const center = visual.item.ids
            .map((id) => this.units.get(id))
            .filter((dot) => dot?.visible && Number.isFinite(dot.x)),
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
          frameRadius:
            packNestedUnitShape(pack.base, visual.level).frameRadius *
            projectPackPoint(
              { x: visual.worldX, y: visual.worldY, z: visual.worldZ },
              this.camera,
              this.w,
              this.h,
            ).scale,
          worldRadius: visual.worldRadius,
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
        radixGeometry: packNestedUnitShape(pack.base, 1).children.map(
          ({ x, y }) => ({ x, y }),
        ),
        camera: {
          mode: this.camera?.mode ?? "overview",
          focusLevel: this.camera?.focusLevel ?? null,
          focusAnchor: this.camera?.focusAnchor ?? null,
          inspectionProgress: this.camera?.inspectionProgress ?? 0,
          inputProgress: this.camera?.inputProgress ?? 0,
          x: this.camera?.x ?? 0,
          y: this.camera?.y ?? 0,
          z: this.camera?.z ?? 0,
          focalLength: this.camera?.focalLength ?? 0,
          moving: !!this.cameraTransition,
        },
        viewports: layout.slots.map((slot) => ({
          level: slot.level,
          x: slot.x,
          y: slot.y,
          radius: slot.radius,
          frameRadius: slot.frameRadius,
          depth: slot.depth,
          worldX: slot.worldX,
          worldY: slot.worldY,
          worldZ: slot.worldZ,
          unitWorldRadius: slot.unitWorldRadius,
          frameWorldRadius: slot.frameWorldRadius,
          visible: slot.visible,
          ghost: slot.ghost,
          revealed: !slot.ghost,
        })),
        revealedLevels: [...this.revealedLevels].sort((a, b) => a - b),
        revealCount: this.scaleRevealCount,
        transition: this.activeTransition(),
        items,
        renderedDots: layout.leaves.map((leaf) => {
          const dot = this.units.get(leaf.id);
          return {
            id: leaf.id,
            x: dot?.x ?? leaf.x,
            y: dot?.y ?? leaf.y,
            radius: dot?.r ?? leaf.r,
            worldRadius: leaf.worldRadius,
            world: {
              x: dot?.wx ?? leaf.worldX,
              y: dot?.wy ?? leaf.worldY,
              z: dot?.wz ?? leaf.worldZ,
            },
            visible: !!dot?.visible,
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
    const slot = this.packLayout().slots.find(
        (candidate) => candidate.level === selection.level,
      ),
      worldPointer = this.unprojectPackPoint(x, y, slot?.worldZ ?? 0);
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
      worldOffsets: selection.ids.map((id) => {
        const d = this.units.get(id);
        return {
          id,
          x: d.wx - worldPointer.x,
          y: d.wy - worldPointer.y,
        };
      }),
    };
  }

  unprojectPackPoint(x, y, z) {
    const depth = Math.max(this.camera.near, z - this.camera.z),
      scale = depth / this.camera.focalLength;
    return {
      x: this.camera.x + (x - this.w / 2) * scale,
      y: this.camera.y + (y - this.h / 2) * scale,
    };
  }

  projectPackUnit(dot) {
    const projection = projectPackPoint(
      { x: dot.wx, y: dot.wy, z: dot.wz },
      this.camera,
      this.w,
      this.h,
    );
    dot.x = projection.x ?? this.w / 2;
    dot.y = projection.y ?? this.h / 2;
    dot.r = projection.visible
      ? dot.worldRadius * projection.scale
      : 0;
    dot.visible = projection.visible;
    dot.tx = dot.x;
    dot.ty = dot.y;
    dot.tr = dot.r;
    dot.glowRadius = dot.r * 0.55;
    return projection;
  }

  cancel() {
    if (this.run?.stage.area !== "pack") return super.cancel();
    this.drag = null;
    this.hover = null;
    for (const dot of this.units.values()) dot.manual = false;
    this.sync();
  }

  move(x, y) {
    if (this.run?.stage.area !== "pack") return super.move(x, y);
    if (!this.drag) return;
    const slot = this.packLayout().slots.find(
        (candidate) => candidate.level === this.drag.level,
      ),
      worldPointer = this.unprojectPackPoint(x, y, slot?.worldZ ?? 0);
    this.drag.x = x;
    this.drag.y = y;
    this.drag.worldOffsets.forEach((offset) => {
      const dot = this.units.get(offset.id);
      dot.wx = worldPointer.x + offset.x;
      dot.wy = worldPointer.y + offset.y;
      dot.wz = slot?.worldZ ?? dot.wz;
      dot.manual = true;
      this.projectPackUnit(dot);
    });
    this.hover = this.dropTarget(x, y);
  }

  hit(x, y) {
    if (this.run?.stage.area !== "pack") return super.hit(x, y);
    const phase = this.run.pack.phase,
      layout = this.packLayout();
    if (phase === "choose" || phase === "break") return null;
    for (const levelLayout of [...layout.levels].reverse()) {
      if (!levelLayout.slot.visible || !levelLayout.items.some((item) => item.visible))
        continue;
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

  packFocusGestureHit(x, y) {
    if (this.run?.stage.area !== "pack") return false;
    const layout = this.packLayout();
    for (const slot of layout.slots) {
      if (!slot.visible || slot.frameRadius <= 0) continue;
      if (Math.abs(Math.hypot(x - slot.x, y - slot.y) - slot.frameRadius) < 9)
        return true;
      const geometry = packNestedUnitShape(
        layout.base,
        Math.max(1, slot.level),
      );
      for (const cell of geometry.children) {
        const point = projectPackPoint(
          {
            x: slot.worldX + cell.x,
            y: slot.worldY + cell.y,
            z: slot.worldZ,
          },
          this.camera,
          this.w,
          this.h,
        );
        if (
          point.visible &&
          Math.abs(
            Math.hypot(x - point.x, y - point.y) -
              cell.radius * point.scale * 0.55,
          ) < 8
        )
          return true;
      }
    }
    return false;
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
      state.alpha += ((state.targetAlpha ?? 1) - state.alpha) * amount;
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
          .filter((dot) => dot && Number.isFinite(dot.wx)),
        x = dots.length
          ? dots.reduce((sum, dot) => sum + dot.wx, 0) / dots.length
          : this.w / 2,
        y = dots.length
          ? dots.reduce((sum, dot) => sum + dot.wy, 0) / dots.length
          : this.h * 0.6,
        z = dots.length
          ? dots.reduce((sum, dot) => sum + dot.wz, 0) / dots.length
          : 0,
        projection = projectPackPoint({ x, y, z }, this.camera, this.w, this.h),
        selected = this.drag?.itemIds?.includes(id),
        alpha = (selected ? 0.82 : state.outer ? 0.56 : 0.34) * state.alpha;
      if (!projection.visible) continue;
      this.circle(
        projection.x,
        projection.y,
        state.worldRadius * projection.scale * (selected ? 1.06 : 0.98),
        this.color + Math.round(alpha * 255).toString(16).padStart(2, "0"),
        Math.max(
          0.9,
          PACK_RAW_DOT_WORLD_RADIUS * projection.scale * (selected ? 0.2 : 0.16),
        ),
      );
    }
  }

  drawRadixFrame(slot, base, alpha) {
    if (!slot.visible) return;
    const c = this.ctx,
      frame = packNestedUnitShape(base, Math.max(1, slot.level)),
      center = { x: slot.worldX, y: slot.worldY, z: slot.worldZ },
      centerProjection = projectPackPoint(center, this.camera, this.w, this.h);
    if (!centerProjection.visible) return;
    c.save();
    c.globalAlpha *= alpha;
    c.strokeStyle = this.color;
    c.lineWidth = Math.max(
      0.9,
      PACK_RAW_DOT_WORLD_RADIUS * centerProjection.scale * 0.16,
    );
    c.beginPath();
    c.arc(
      centerProjection.x,
      centerProjection.y,
      slot.frameWorldRadius * centerProjection.scale,
      0,
      Math.PI * 2,
    );
    c.stroke();
    for (const cell of frame.children) {
      const point = projectPackPoint(
        { x: center.x + cell.x, y: center.y + cell.y, z: center.z },
        this.camera,
        this.w,
        this.h,
      );
      if (!point.visible) continue;
      const radius = cell.radius * point.scale * 0.52;
      c.beginPath();
      c.arc(point.x, point.y, radius, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
  }

  drawPackViewports(layout) {
    const c = this.ctx,
      transition = this.radixTransition,
      focusLevel = this.camera?.focusLevel,
      progress = transition
        ? clamp((this.clock - transition.started) / transition.duration, 0, 1)
        : 1;

    for (const levelLayout of layout.levels) {
      const slot = levelLayout.slot,
        hot =
          (this.hover?.kind === "normalize" &&
            this.hover.targetLevel === slot.level) ||
          (this.hover?.kind === "unpack" &&
            this.hover.targetLevel === slot.level),
        alpha = hot
          ? 0.64
          : focusLevel === slot.level
            ? 0.76
            : slot.ghost
              ? 0.28
              : levelLayout.items.length
                ? 0.46
                : 0.38;
      c.save();
      if (transition) {
        this.drawRadixFrame(slot, transition.from, alpha * (1 - progress));
        this.drawRadixFrame(slot, transition.to, alpha * progress);
      } else this.drawRadixFrame(slot, this.run.pack.base, alpha);
      c.restore();
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
      const amount = this.motion ? 1 - Math.exp(-Math.min(32, dt) / 62) : 1;
      for (const dot of this.units.values()) {
        if (!Number.isFinite(dot.twx)) continue;
        if (!dot.manual) {
          dot.wx += (dot.twx - dot.wx) * amount;
          dot.wy += (dot.twy - dot.wy) * amount;
          dot.wz += (dot.twz - dot.wz) * amount;
        }
        this.projectPackUnit(dot);
      }
    }
    super.drawUnits(dt);
  }

  async tweenPackWorld(ids, targets, ms, token) {
    const starts = ids.map((id) => {
      const dot = this.units.get(id);
      dot.visible = true;
      dot.manual = true;
      return { x: dot.wx, y: dot.wy, z: dot.wz };
    });
    if (!this.motion) ms = 1;
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
          dot.wz = origin.z + (target.z - origin.z) * progress;
          this.projectPackUnit(dot);
        });
        if (progress < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
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
        sourceLevel = result.level;
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
          source = layout.slots.find((slot) => slot.level === sourceLevel),
          formationShape = packNestedUnitShape(
            this.run.pack.base,
            sourceLevel + 1,
          );
        for (const bundle of result.bundles) {
          const childNodes = bundle.childItemIds.map(
              (id) => this.run.pack.nodes[id],
            ),
            childCenters = childNodes.map((node) => {
              const dots = node.ids.map((id) => this.units.get(id));
              return {
                x: dots.reduce((sum, dot) => sum + dot.wx, 0) / dots.length,
                y: dots.reduce((sum, dot) => sum + dot.wy, 0) / dots.length,
              };
            }),
            center = {
              x: childCenters.reduce((sum, point) => sum + point.x, 0) / childCenters.length,
              y: childCenters.reduce((sum, point) => sum + point.y, 0) / childCenters.length,
            };
          childNodes.forEach((node, index) => {
            const point = formationShape.children[index],
              childCenter = childCenters[index];
            node.ids.forEach((id) => {
              const dot = this.units.get(id);
              carryIds.push(id);
              formationTargets.push({
                x: center.x + point.x + dot.wx - childCenter.x,
                y: center.y + point.y + dot.wy - childCenter.y,
                z: source?.worldZ ?? dot.wz,
              });
              dot.visible = true;
              dot.manual = true;
            });
          });
        }
        await this.tweenPackWorld(
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
              ? { x: target.worldX, y: target.worldY, z: target.worldZ }
              : { x: this.units.get(id).wx, y: this.units.get(id).wy, z: this.units.get(id).wz };
          });
        for (const id of remainderIds) {
          const dot = this.units.get(id);
          if (dot) {
            dot.visible = true;
            dot.manual = true;
          }
        }
        await this.tweenPackWorld(
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
      } else {
        const settleIds = draggedIds,
          settleTargets = settleIds.map((id) => {
            const target = targetById.get(id);
            return target
              ? { x: target.worldX, y: target.worldY, z: target.worldZ }
              : {
                  x: this.units.get(id)?.wx ?? 0,
                  y: this.units.get(id)?.wy ?? 0,
                  z: this.units.get(id)?.wz ?? 0,
                };
          });
        await this.tweenPackWorld(settleIds, settleTargets, this.motion ? 190 : 1, token);
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
      await this.tweenPackWorld(
        childIds,
        childIds.map((id) => {
          const target = targets.get(id);
          return target
            ? { x: target.worldX, y: target.worldY, z: target.worldZ }
            : {
                x: this.units.get(id).wx,
                y: this.units.get(id).wy,
                z: this.units.get(id).wz,
              };
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
