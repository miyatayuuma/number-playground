import { World } from "./view.mjs";
import { FlowWorld } from "./flow-view.mjs";
import { activeTargets, gateFactor } from "./model.mjs";
import {
  boundsFromDots,
  circle,
  compound,
  overlaps,
  rect,
} from "./interactions.mjs";

const HYSTERESIS = 7;

function dragDots(world, x, y) {
  if (!world.drag) return [];
  return world.drag.offsets.map((o) => {
    const d = world.units.get(o.id);
    return { x: x + o.x, y: y + o.y, r: d?.r || 0 };
  });
}

function baseDragBounds(world, x, y) {
  return boundsFromDots(dragDots(world, x, y), "circle");
}

function gearDragBounds(world, x, y) {
  const source = world.positions.get(world.drag.pieceId),
    dx = x - source.x,
    dy = y - source.y,
    parts = [];

  for (const p of world.run.pieces) {
    if (p.id === world.drag.pieceId) {
      parts.push(boundsFromDots(dragDots(world, x, y), "rect"));
      continue;
    }
    const center = world.positions.get(p.id),
      shape = world.pieceShape(p),
      dots = p.ids.map((id, i) => {
        const d = world.units.get(id);
        return {
          x: center.x + shape.dots[i].x + dx,
          y: center.y + shape.dots[i].y + dy,
          r: d?.r || shape.dotRadius || 0,
        };
      });
    parts.push(boundsFromDots(dots, "rect"));
  }
  return compound(parts);
}

function flowDragBounds(world, x, y) {
  if (world.run.stage.area === "gear") return gearDragBounds(world, x, y);
  return boundsFromDots(dragDots(world, x, y), "rect");
}

function sameHover(hover, candidate) {
  if (!hover || hover.kind !== candidate.kind) return false;
  if (candidate.kind === "target" || candidate.kind === "gate")
    return hover.index === candidate.index;
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
  if (target.kind === "gear") {
    const count = Math.max(2, world.run.width || 3),
      pitch = Math.min(11, 55 / count),
      halfWidth = (count * pitch + 8) / 2;
    return compound(
      [-38, 38].map((dx) =>
        rect(
          point.x + dx - halfWidth,
          point.y - 12,
          point.x + dx + halfWidth,
          point.y + 12,
        ),
      ),
    );
  }
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
  if (this.run.stage.area === "spark")
    return World.prototype.dropTarget.call(this, x, y);

  const dragged = flowDragBounds(this, x, y),
    candidates = activeTargets(this.run).map((i) => {
      const target = this.run.targets[i],
        kind = target.kind === "divide" ? "gate" : "target";
      return {
        kind,
        index: i,
        bounds: flowTargetBounds(this, target, i),
        result: { kind, index: i },
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
  baseDrawPieces = FlowWorld.prototype.drawPieces,
  baseDrawTargets = FlowWorld.prototype.drawTargets;

FlowWorld.prototype.handleHit = function handleHit(x, y) {
  const hit = baseHandleHit.call(this, x, y);
  if (!hit) return null;
  this.widthAdjusting = true;
  this.widthAdjustPieceId = hit.pieceId;
  if (!this.widthAdjustListeners) {
    const finish = () => {
      this.widthAdjusting = false;
      this.widthAdjustPieceId = null;
    };
    this.canvas.addEventListener("pointerup", finish, true);
    this.canvas.addEventListener("pointercancel", finish, true);
    this.canvas.addEventListener("lostpointercapture", finish, true);
    this.widthAdjustListeners = true;
  }
  return hit;
};

FlowWorld.prototype.drawTargets = function drawTargets() {
  baseDrawTargets.call(this);
  if (this.run.stage.area !== "gear" || this.hover?.kind !== "target") return;

  const i = this.hover.index,
    target = this.run.targets[i];
  if (!target || target.kind !== "gear") return;

  const p = this.targetPoint(i),
    count = Math.max(2, this.run.width || 3),
    pitch = Math.min(11, 55 / count),
    width = count * pitch + 8,
    c = this.ctx;

  c.save();
  c.strokeStyle = this.color + "ff";
  c.fillStyle = this.color + "18";
  c.lineWidth = 2.5;
  c.shadowColor = this.color;
  c.shadowBlur = 12;
  for (const dx of [-38, 38]) {
    const x = p.x + dx - width / 2,
      y = p.y - 12;
    c.fillRect(x, y, width, 24);
    c.strokeRect(x, y, width, 24);
  }
  c.restore();
};

FlowWorld.prototype.drawPieces = function drawPieces() {
  baseDrawPieces.call(this);
  if (!this.widthAdjusting) return;
  const area = this.run.stage.area;
  if (area !== "gear" && area !== "link") return;

  const piece = this.run.pieces.find((p) => p.id === this.widthAdjustPieceId),
    centers = this.run.pieces.map((p) => this.positions.get(p.id)).filter(Boolean),
    center = piece ? this.positions.get(piece.id) : null,
    x = area === "gear" ? this.w / 2 : center?.x,
    y =
      area === "gear"
        ? Math.max(
            this.h * 0.565,
            Math.min(...centers.map((p) => p.y)) - this.baseRadius - 30,
          )
        : Math.max(36, (center?.y ?? this.h * 0.7) - this.baseRadius - 42),
    value = area === "gear" ? this.run.width : piece?.width,
    c = this.ctx;
  if (x == null) return;

  c.save();
  c.fillStyle = "#15263cee";
  c.strokeStyle = this.color + "cc";
  c.lineWidth = 1.5;
  c.beginPath();
  c.roundRect(x - 25, y - 18, 50, 36, 18);
  c.fill();
  c.stroke();
  this.label(value || "◌", x, y, this.color, 18);
  c.restore();
};
