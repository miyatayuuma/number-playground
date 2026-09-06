// Four is a square motif; reversed factor order gives each integer one identity.
export function factors(n) {
  if (!Number.isInteger(n) || n < 1 || n > 36)
    throw new RangeError("Shape must contain 1–36 dots");
  const out = [];
  while (n > 1) {
    let f = n % 4 === 0 ? 4 : n % 2 === 0 ? 2 : 0;
    if (!f) {
      for (let p = 3; p * p <= n; p += 2)
        if (n % p === 0) {
          f = p;
          break;
        }
    }
    f ||= n;
    out.push(f);
    n /= f;
  }
  return out.reverse();
}
function geometry(n) {
  const fs = factors(n);
  function build(depth, orientation = 0) {
    if (depth === fs.length)
      return { radius: 1, dots: [{ x: 0, y: 0, branch: 0 }], groups: [] };
    const f = fs[depth],
      children = Array.from({ length: f }, () =>
        build(depth + 1, f === 2 ? orientation + Math.PI / 2 : orientation),
      );
    const cr = children[0].radius,
      distance = (cr + 0.3) / Math.sin(Math.PI / f);
    const dots = [],
      groups = [];
    children.forEach((child, i) => {
      const a =
        orientation -
        (f === 4 ? Math.PI * 0.75 : Math.PI / 2) +
        (i * 2 * Math.PI) / f;
      const x = Math.cos(a) * distance,
        y = Math.sin(a) * distance,
        offset = dots.length;
      dots.push(
        ...child.dots.map((d) => ({
          x: d.x + x,
          y: d.y + y,
          branch: depth === 0 ? i : d.branch,
        })),
      );
      groups.push(
        ...child.groups.map((g) => ({
          ...g,
          x: g.x + x,
          y: g.y + y,
          indices: g.indices.map((j) => j + offset),
        })),
      );
      if (child.dots.length > 1)
        groups.push({
          x,
          y,
          radius: cr,
          depth: depth + 1,
          indices: child.dots.map((_, j) => offset + j),
        });
    });
    return { dots, groups, radius: distance + cr };
  }
  return build(0);
}
const shapes = new Map();
export function intrinsic(n) {
  if (!shapes.has(n)) shapes.set(n, geometry(n));
  return shapes.get(n);
}
export function shape(n, radius = 54) {
  const base = intrinsic(n),
    scale = radius / base.radius;
  return {
    dots: base.dots.map((d) => ({ ...d, x: d.x * scale, y: d.y * scale })),
    groups: base.groups.map((g) => ({
      ...g,
      x: g.x * scale,
      y: g.y * scale,
      radius: g.radius * scale,
    })),
    dotRadius: scale * 0.82,
    radius,
  };
}
