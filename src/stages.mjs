export const AREAS = [
  { id: "spark", name: "スパーク", color: "#ffc977", glyph: "✦" },
  { id: "link", name: "リンク", color: "#75ead2", glyph: "⠿" },
  { id: "gear", name: "ギア", color: "#8bbcff", glyph: "◈" },
  { id: "core", name: "コア", color: "#c5a0ff", glyph: "◇" },
];
const target = (n, phase = 0, origin = null) => ({ n, phase, origin });
export const STAGES = [
  { id: "spark-1", area: "spark", ammo: [7, 1], targets: [target(8)] },
  { id: "spark-2", area: "spark", ammo: [12], targets: [target(4), target(8)] },
  { id: "spark-3", area: "spark", ammo: [5, 3, 2], targets: [target(10)] },
  {
    id: "link-1",
    area: "link",
    ammo: [3, 3, 3],
    targets: [target(3), target(3), target(3)],
    charge: "volley",
  },
  {
    id: "link-2",
    area: "link",
    ammo: [12],
    targets: [target(4), target(4), target(4)],
  },
  {
    id: "link-3",
    area: "link",
    ammo: [12],
    targets: [target(8), target(4, 1)],
    gates: [3],
  },
  {
    id: "gear-1",
    area: "gear",
    ammo: [14],
    targets: [target(8), target(2, 1), target(4, 1)],
    gates: [3],
  },
  {
    id: "gear-2",
    area: "gear",
    ammo: [12, 20],
    targets: [target(4, 0, 0), target(4, 0, 1)],
    charge: "resonance",
  },
  {
    id: "gear-3",
    area: "gear",
    ammo: [8, 6],
    targets: [target(10), target(4, 1)],
  },
  {
    id: "core-1",
    area: "core",
    ammo: [24],
    targets: [target(16), target(4, 1), target(4, 2)],
    gates: [3, 2],
  },
  {
    id: "core-2",
    area: "core",
    ammo: [5, 7, 11],
    targets: [target(5), target(7), target(11)],
    charge: "rings",
  },
  {
    id: "core-3",
    area: "core",
    ammo: [9, 9, 9, 9],
    targets: [target(9), target(9), target(9), target(9)],
    charge: "square",
  },
];
