import { World } from "./view.mjs";
import { FlowWorld } from "./flow-view.mjs";
import { activeTargets, gateFactor } from "./model.mjs";
import { boundsFromDots, circle, overlaps, rect } from "./interactions.mjs";

const HYSTERESIS = 7;

function dragDots(world, x, y, includeGearPair = false) {
  if (!world.drag) return [];
  const dots = world.drag.offsets.map((o) => {
    const d = world.units.get(o.id);
    return { x: x + o.x, y: y + o.y, r: d?.r || 0 };
  });

  if (includeGearPair && world.run.stage.area === "gear") {
    const source = world.positions.get(world.drag.pieceId),
      dx = x - source.x,
      dy = y - source.y;
    for (const p of world.run.pieces) {
      if (p.id === world.drag.pieceId) continue;
      const center = world.positions.get(p.id),
        shape = world.pieceShape(p);
      p.ids.forEach((id, i) => {
        const d = world.units.get(id);
        dots.push({
          x: center.x + shape.dots[i].x + dx,
          y: center.y + shape.dots[i].y + dy,
          r: d?.r || shape.dotRadius || 0,
        });
      });
    }
  }
  return dots;
}

function baseDragBounds(world, x, y) {
  return boundsFromDots(dragDots(world, x, y), "circle");
}

function flowDragBounds(world, x, y) {
  const arrayLike = world.run.stage.area !== "spark";
  return boundsFromDots(
    dragDots(world, x, y, world.run.stage.area === "gear"),
    arrayLike ? "rect" : "circle",
  );
}

function sameHover(hover, candidate) {
  if (!hover || hover.kind !== candidate.kind) return false;
  if (candidate.kind === "target") return hover.index === candidate.index;
  if (candidate.kind === "merge") return hover.pieceId === candidate.pieceId;
  return true;
}

function chooseOverlap(world, dragBounds, candidates) {
  const previous = candidates.find((candidate) => sameHover(world.hover, candidate));
  if (previous && overlaps(dragBounds, previous.bounds, HYSTERESIS))
    return previous.result;
  const hit = candidates.find((candidate) => overlaps(dragBounds, candidate.bounds));
  return hit?.result || null;
}

World.prototype.dropTarget = function dropTarget(x, y) {
  if (!this.drag) return { kind: "cancel" };
  const dragged = baseDragBounds(this, x, y),
    candidates = [];

  if (gateFactor(this.run)) {
    const gate = this.gatePoint();
    candidates.push({
      kind: "gate",
      bounds: circle(gate.x, gate.y, gate.radius),
      result: { kind: "gate" },
    });
  }

  for (const i of activeTargets(this.run)) {
    const target = this.targetPoint(i);
    candidates.push({
      kind: "target",
      index: i,
      bounds: circle(target.x, target.y, target.radius + 10),
      result: { kind: "target", index: i },
    });
  }

  for (const p of this.run.pieces) {
    if (p.id === this.drag.pieceId) continue;
    const geometry = this.displayGeometry(p);
    candidates.push({
      kind: "merge",
      pieceId: p.id,
      bounds: circle(geometry.center.x, geometry.center.y, geometry.radius + 12),
      result: { kind: "merge", pieceId: p.id },
    });
  }

  const hit = chooseOverlap(this, dragged, candidates);
  if (hit) return hit;
  return y > this.h * 0.55 && x > 8 && x < this.w - 8 && y < this.h - 8
    ? { kind: "space" }
    : { kind: "cancel" };
};

function flowTargetBounds(world, target, index) {
  const point = world.targetPoint(index);
  if (target.kind === "gear")
    return rect(point.x - 78, point.y - 20, point.x + 78, point.y + 20);
  if (target.kind !== "divide")
    return circle(point.x, point.y, point.radius + 10);

  const shape = world.targetShape(target, point.radius * 0.78),
    visible = shape.dots.filter((d) => !d.remainder),
    half = (shape.pitch || shape.dotRadius * 2 || 8) * 0.55;
  return rect(
    point.x + Math.min(...visible.map((d) => d.x)) - half,
    point.y + Math.min(...visible.map((d) => d.y)) - half,
    point.x + Math.max(...visible.map((d) => d.x)) + half,
    point.y + Math.max(...visible.map((d) => d.y)) + half,
  );
}

FlowWorld.prototype.dropTarget = function dropTarget(x, y) {
  if (!this.drag) return { kind: "cancel" };
  const dragged = flowDragBounds(this, x, y),
    candidates = activeTargets(this.run).map((i) => {
      const target = this.run.targets[i];
      return {
        kind: "target",
        index: i,
        bounds: flowTargetBounds(this, target, i),
        result: {
          kind: target.kind === "divide" ? "gate" : "target",
          index: i,
        },
      };
    });

  const hit = chooseOverlap(this, dragged, candidates);
  if (hit) return hit;
  if (this.run.stage.area === "gear") return { kind: "cancel" };
  return y > this.h * 0.55 && x > 8 && x < this.w - 8 && y < this.h - 8
    ? { kind: "space" }
    : { kind: "cancel" };
};

const baseHandleHit = FlowWorld.prototype.handleHit,
  baseDrawPieces = FlowWorld.prototype.drawPieces;

FlowWorld.prototype.handleHit = function handleHit(x, y) {
  const hit = baseHandleHit.call(this, x, y);
  if (!hit) return null;
  this.widthAdjusting = true;
  if (!this.widthAdjustListeners) {
    const finish = () => {
      this.widthAdjusting = false;
    };
    this.canvas.addEventListener("pointerup", finish, true);
    this.canvas.addEventListener("pointercancel", finish, true);
    this.canvas.addEventListener("lostpointercapture", finish, true);
    this.widthAdjustListeners = true;
  }
  return hit;
};

FlowWorld.prototype.drawPieces = function drawPieces() {
  baseDrawPieces.call(this);
  if (!this.widthAdjusting || this.run.stage.area !== "gear") return;

  const centers = this.run.pieces.map((p) => this.positions.get(p.id)).filter(Boolean),
    y = Math.max(
      this.h * 0.565,
      Math.min(...centers.map((p) => p.y)) - this.baseRadius - 30,
    ),
    x = this.w / 2,
    c = this.ctx;
  c.save();
  c.fillStyle = "#15263cee";
  c.strokeStyle = this.color + "cc";
  c.lineWidth = 1.5;
  c.beginPath();
  c.roundRect(x - 25, y - 18, 50, 36, 18);
  c.fill();
  c.stroke();
  this.label(this.run.width || "◌", x, y, this.color, 18);
  c.restore();
};
