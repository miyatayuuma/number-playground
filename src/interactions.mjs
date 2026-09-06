export function circle(x, y, radius) {
  return { kind: "circle", x, y, radius };
}

export function rect(left, top, right, bottom) {
  return { kind: "rect", left, top, right, bottom };
}

export function compound(shapes) {
  return { kind: "compound", shapes };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function expand(shape, padding = 0) {
  if (!padding) return shape;
  if (shape.kind === "compound")
    return compound(shape.shapes.map((part) => expand(part, padding)));
  if (shape.kind === "circle")
    return { ...shape, radius: shape.radius + padding };
  return {
    ...shape,
    left: shape.left - padding,
    top: shape.top - padding,
    right: shape.right + padding,
    bottom: shape.bottom + padding,
  };
}

export function overlaps(a, b, padding = 0) {
  b = expand(b, padding);
  if (a.kind === "compound") return a.shapes.some((part) => overlaps(part, b));
  if (b.kind === "compound") return b.shapes.some((part) => overlaps(a, part));

  if (a.kind === "circle" && b.kind === "circle")
    return Math.hypot(a.x - b.x, a.y - b.y) <= a.radius + b.radius;

  if (a.kind === "rect" && b.kind === "rect")
    return !(
      a.right < b.left ||
      a.left > b.right ||
      a.bottom < b.top ||
      a.top > b.bottom
    );

  const c = a.kind === "circle" ? a : b,
    r = a.kind === "rect" ? a : b,
    nearestX = clamp(c.x, r.left, r.right),
    nearestY = clamp(c.y, r.top, r.bottom);
  return Math.hypot(c.x - nearestX, c.y - nearestY) <= c.radius;
}

export function boundsFromDots(dots, kind = "circle") {
  if (!dots.length) return circle(0, 0, 0);
  const left = Math.min(...dots.map((d) => d.x - (d.r || 0))),
    right = Math.max(...dots.map((d) => d.x + (d.r || 0))),
    top = Math.min(...dots.map((d) => d.y - (d.r || 0))),
    bottom = Math.max(...dots.map((d) => d.y + (d.r || 0)));
  if (kind === "rect") return rect(left, top, right, bottom);
  const x = (left + right) / 2,
    y = (top + bottom) / 2,
    radius = Math.max(
      ...dots.map((d) => Math.hypot(d.x - x, d.y - y) + (d.r || 0)),
    );
  return circle(x, y, radius);
}
