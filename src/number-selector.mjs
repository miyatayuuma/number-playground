import { shape } from "./shapes.mjs";

// Static number selectors use the game's canonical number geometry. A value of
// zero has a readout, but no quantity glyph or placeholder geometry.
export function canonicalSelectorShape(value, radius = 10) {
  if (!Number.isInteger(value) || value < 0)
    throw new RangeError("Selector values must be non-negative integers");
  if (!value) return { dots: [], dotRadius: 0, radius: 0 };
  return shape(value, radius);
}

export function drawNumberReadout(world, value, x, y, color, size = 15) {
  world.label(String(value), x, y, color, size);
}

export function drawSelectorDots(
  world,
  value,
  x,
  y,
  color,
  { radius = 10, dotScale = 0.58, minimumDotRadius = 1.2, alpha = 1 } = {},
) {
  const geometry = canonicalSelectorShape(value, radius),
    ctx = world.ctx;
  if (!geometry.dots.length) return geometry;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  for (const dot of geometry.dots) {
    ctx.beginPath();
    ctx.arc(
      x + dot.x,
      y + dot.y,
      Math.max(minimumDotRadius, geometry.dotRadius * dotScale),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
  return geometry;
}
