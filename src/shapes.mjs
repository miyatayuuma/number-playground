// Four stays a 2×2 motif, with two visibly separated vertical pairs.
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
    if (fs[depth] === 4 && depth === fs.length - 1) {
      return {
        radius: Math.hypot(1.8, 1) + 1,
        dots: [-1.8, 1.8].flatMap((x, branch) =>
          [-1, 1].map((y) => ({ x, y, branch })),
        ),
        groups: [-1.8, 1.8].map((x, i) => ({
          x,
          y: 0,
          radius: 2,
          depth: depth + 1,
          indices: [i * 2, i * 2 + 1],
        })),
      };
    }
    const f = fs[depth],
      children = Array.from({ length: f }, (_, i) => {
        const angle =
          orientation -
          (f === 4 ? Math.PI * 0.75 : Math.PI / 2) +
          (i * Math.PI * 2) / f;
        return build(depth + 1, fs[depth + 1] === 2 ? angle + Math.PI / 2 : 0);
      });
    const cr = children[0].radius,
      distance =
        (cr + (depth < fs.length - 1 ? 1.2 : 0.3)) / Math.sin(Math.PI / f);
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
  const result = build(0);
  result.nodes = hierarchy(n, result.groups);
  return result;
}
// Nodes partition their parent: a fast peel can descend exactly one edge.
export function hierarchy(n, groups) {
  const entries = [
    Array.from({ length: n }, (_, i) => i),
    ...groups.map((g) => g.indices),
    ...Array.from({ length: n }, (_, i) => [i]),
  ];
  const nodes = [
    ...new Map(
      entries.map((indices) => [
        indices.join("."),
        {
          id: indices.join("."),
          indices: [...indices],
          children: [],
          parent: null,
        },
      ]),
    ).values(),
  ];
  for (const node of nodes.slice(1)) {
    const parent = nodes
      .filter(
        (p) =>
          p.indices.length > node.indices.length &&
          node.indices.every((i) => p.indices.includes(i)),
      )
      .sort((a, b) => a.indices.length - b.indices.length)[0];
    node.parent = parent.id;
    parent.children.push(node.id);
  }
  return nodes;
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
    nodes: base.nodes,
    dotRadius: scale * 0.82,
    radius,
  };
}

// The same row layout drives preview, acceptance, and the actual projectile IDs.
export function arrayShape(n, columns, radius = 54, pitchLimit = 19) {
  columns = Math.max(1, Math.min(n, Math.trunc(columns)));
  const rows = Math.floor(n / columns),
    remainder = n % columns;
  const width = columns + (remainder ? 2 : 0),
    height = Math.max(rows, remainder, 1);
  const pitch = Math.min(pitchLimit, (radius * 1.65) / Math.max(width, height));
  const dots = Array.from({ length: n }, (_, i) =>
    i < rows * columns
      ? {
          x: ((i % columns) - (columns - 1) / 2) * pitch,
          y: (Math.floor(i / columns) - (rows - 1) / 2) * pitch,
          keep: i % columns === 0,
        }
      : {
          x: ((columns - 1) / 2 + 2) * pitch,
          y: (i - rows * columns - (remainder - 1) / 2) * pitch,
          remainder: true,
        },
  );
  const groups = Array.from({ length: rows }, (_, row) => ({
    x: 0,
    y: (row - (rows - 1) / 2) * pitch,
    radius: (columns * pitch) / 2,
    depth: 1,
    indices: Array.from({ length: columns }, (_, i) => row * columns + i),
  }));
  return {
    dots,
    groups,
    dotRadius: pitch * 0.29,
    radius: Math.max(
      20,
      ...dots.map((d) => Math.hypot(d.x, d.y) + pitch * 0.29),
    ),
    pitch,
    columns,
    rows,
    remainder,
  };
}


export function packCoefficientShape(count, base, radius = 48) {
  if (!Number.isInteger(count) || count < 0 || count > 36)
    throw new RangeError("PACK coefficient must contain 0–36 items");
  if (!Number.isInteger(base) || base < 2 || base > 10)
    throw new RangeError("PACK base must be 2–10");
  if (!count)
    return { dots: [], groups: [], dotRadius: 0, radius, count, base };

  const groupCount = Math.ceil(count / base),
    centers =
      groupCount === 1
        ? [{ x: 0, y: 0 }]
        : shape(groupCount, radius * 0.54).dots,
    clusterRadius =
      groupCount === 1 ? radius * 0.68 : Math.max(10, radius * 0.27),
    dots = [],
    groups = [];
  let offset = 0;
  for (let group = 0; group < groupCount; group++) {
    const size = Math.min(base, count - offset),
      local = shape(size, clusterRadius),
      center = centers[group],
      start = dots.length;
    local.dots.forEach((d) =>
      dots.push({
        x: center.x + d.x,
        y: center.y + d.y,
        group,
      }),
    );
    groups.push({
      x: center.x,
      y: center.y,
      radius: clusterRadius + 5,
      indices: Array.from({ length: size }, (_, i) => start + i),
      packable: size === base,
    });
    offset += size;
  }
  return {
    dots,
    groups,
    dotRadius: Math.min(...groups.map((g) => {
      const first = g.indices[0];
      const localSize = g.indices.length;
      return shape(localSize, clusterRadius).dotRadius;
    })),
    radius: Math.max(
      18,
      ...dots.map((d) => Math.hypot(d.x, d.y) + clusterRadius * 0.22),
    ),
    count,
    base,
  };
}

export function placeSlotLayout(total, base, width, y) {
  if (!Number.isInteger(total) || total < 1)
    throw new RangeError("PACK total must be positive");
  if (!Number.isInteger(base) || base < 2)
    throw new RangeError("PACK base must be at least 2");
  const places = Math.floor(Math.log(total) / Math.log(base)) + 1,
    margin = Math.min(58, width * 0.17),
    gap = places === 1 ? 0 : Math.min(120, (width - margin * 2) / (places - 1));
  return Array.from({ length: places }, (_, level) => ({
    level,
    x: width / 2 + ((places - 1) / 2 - level) * gap,
    y,
  }));
}

// PACK's frame describes a scale's radix grammar. Its points are hollow marks,
// kept separate from the filled dots that represent quantity.
export function radixFrame(base, radius = 48) {
  if (!Number.isInteger(base) || base < 2 || base > 10)
    throw new RangeError("PACK radix frame must have 2–10 points");
  const points = shape(base, radius).dots
    .map(({ x, y }) => ({ x, y }))
    .sort(
      (a, b) =>
        Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x),
    );
  return { base, radius, points };
}

export const PACK_RAW_DOT_WORLD_RADIUS = 8;
export const PACK_FOCUS_DOT_SCREEN_RADIUS = 7;

function packPattern(base) {
  const points = shape(base, 54).dots,
    outerRadius = Math.max(...points.map((point) => Math.hypot(point.x, point.y)));
  let nearest = Infinity;
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++)
      nearest = Math.min(
        nearest,
        Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y),
      );
  return {
    points: points.map((point) => ({
      x: point.x / outerRadius,
      y: point.y / outerRadius,
    })),
    nearestSeparation: nearest / outerRadius,
  };
}

// One physical dot radius and one repeated world-space growth rule define all
// nested levels. Radices 2–5 share the same growth, so changing 5 to 4 changes
// only the child arrangement, not the camera's level depths.
export function packScaleGrowth(base) {
  if (!Number.isInteger(base) || base < 2 || base > 10)
    throw new RangeError("PACK scale radix must be 2–10");
  const pattern = packPattern(base);
  return Math.max(4.5, 1 + 2.25 / pattern.nearestSeparation);
}

// World-space macro geometry is recursively built from fixed-radius raw dots.
// Child marks follow the same factorization shape as the radix frame. Camera
// projection, never a level-specific dot multiplier, determines screen size.
export function packNestedUnitShape(
  base,
  levels = 1,
  rawRadius = PACK_RAW_DOT_WORLD_RADIUS,
) {
  if (!Number.isInteger(levels) || levels < 0)
    throw new RangeError("PACK nested depth must be non-negative");
  if (!(rawRadius > 0)) throw new RangeError("PACK raw dot radius must be positive");
  if (levels === 0)
    return {
      base,
      levels: 0,
      radius: rawRadius,
      rawRadius,
      children: [],
    };

  const growth = packScaleGrowth(base),
    pattern = packPattern(base),
    inner = packNestedUnitShape(base, levels - 1, rawRadius),
    childCenterRadius = (growth - 1) * inner.radius;
  return {
    base,
    levels,
    radius: growth * inner.radius,
    rawRadius,
    growth,
    children: pattern.points.map((point, index) => ({
      index,
      x: point.x * childCenterRadius,
      y: point.y * childCenterRadius,
      radius: inner.radius,
      inner,
    })),
  };
}

// Scale planes live in one perspective world. Their center offsets are chosen
// so the overview projects them into a stable higher-to-lower horizontal row.
export function packScaleViewports(maxLevel, width, height, base = 4) {
  maxLevel = Math.max(0, Math.trunc(maxLevel));
  const visibleMax = maxLevel,
    showNext = visibleMax < 2,
    lastLevel = visibleMax + (showNext ? 1 : 0),
    levels = Array.from({ length: lastLevel + 1 }, (_, index) => lastLevel - index),
    layoutMax = Math.max(2, visibleMax),
    count = layoutMax + 1,
    growth = packScaleGrowth(base),
    focalLength = Math.max(1, Math.min(width, height) * 1.15),
    baseDistance =
      (focalLength * PACK_RAW_DOT_WORLD_RADIUS) /
      PACK_FOCUS_DOT_SCREEN_RADIUS,
    overviewFrameRadius = growth * PACK_FOCUS_DOT_SCREEN_RADIUS,
    pitch = Math.min(
      overviewFrameRadius * 2 + 18,
      (width - overviewFrameRadius * 2 - 24) / Math.max(1, count - 1),
    );
  return levels.map((level) => {
    const unitWorldRadius =
        PACK_RAW_DOT_WORLD_RADIUS * growth ** level,
      frameWorldRadius = unitWorldRadius * growth,
      depth = baseDistance * growth ** level,
      overviewOffsetX = (layoutMax / 2 - level) * pitch;
    return {
      level,
      x: (overviewOffsetX * depth) / focalLength,
      y: 0,
      z: depth,
      depth,
      focalLength,
      baseDistance,
      overviewOffsetX,
      unitWorldRadius,
      frameWorldRadius,
      overviewFrameRadius,
      ghost: level > visibleMax,
    };
  });
}
