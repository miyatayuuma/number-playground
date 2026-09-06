import { FlowWorld } from "./flow-view.mjs";

const baseAnimate = FlowWorld.prototype.animate;

function volleyGap(groupCount) {
  if (groupCount <= 1) return 0;
  // Keep small volleys legible. Only compress dense attacks enough to cap
  // the launch span, instead of forcing every attack into the same fast tempo.
  return Math.min(150, 820 / (groupCount - 1));
}

FlowWorld.prototype.animate = async function animate(result) {
  if (result.type !== "volley") return baseAnimate.call(this, result);

  this.busy = true;
  this.drag = null;
  this.hover = null;
  const token = this.token,
    enemy = this.enemyPoint(),
    ids = [...result.ids],
    groupIndex = new Map(),
    gap = volleyGap(result.groups.length);

  result.groups.forEach((group, i) => {
    group.forEach((id) => groupIndex.set(id, i));
  });

  const home = new Map();
  if (result.outcome === "repel") {
    for (const piece of this.run.pieces) {
      const center = this.positions.get(piece.id),
        s = this.pieceShape(piece);
      piece.ids.forEach((id, i) =>
        home.set(id, { x: center.x + s.dots[i].x, y: center.y + s.dots[i].y }),
      );
    }
  }

  ids.forEach((id) => (this.units.get(id).flight = true));
  await this.tween(
    ids,
    ids.map((id, i) => ({
      x: enemy.x + ((i % 11) - 5) * 4.2,
      y: enemy.y + (Math.floor(i / 11) - 1) * 4.2,
      delay: (groupIndex.get(id) || 0) * gap,
    })),
    230,
    token,
  );
  if (token !== this.token) return;

  this.burst(enemy.x, enemy.y, this.color, result.outcome === "win" ? 2 : 1.25);
  this.onCue?.("hit");

  if (result.outcome === "repel") {
    // Let the impact register before the volley is visibly pushed back.
    await this.tween([], [], 180, token);
    if (token !== this.token) return;
    this.burst(enemy.x, enemy.y, this.color, 0.9);
    this.onCue?.("miss");
    const returnSpan = Math.min(120, Math.max(0, (result.groups.length - 1) * 28)),
      returnGap =
        result.groups.length <= 1 ? 0 : returnSpan / (result.groups.length - 1);
    await this.tween(
      ids,
      ids.map((id) => ({
        ...home.get(id),
        delay: (result.groups.length - 1 - (groupIndex.get(id) || 0)) * returnGap,
      })),
      300,
      token,
    );
    if (token !== this.token) return;
  } else {
    ids.forEach((id) => (this.units.get(id).visible = false));
  }

  for (const id of ids) {
    const d = this.units.get(id);
    d.manual = false;
    d.flight = false;
    d.keep = false;
    d.vx = 0;
    d.vy = 0;
  }
  this.sync();

  if (result.complete) {
    this.deadAt = this.clock;
    this.burst(enemy.x, enemy.y, this.color, 2.3);
    this.onCue?.("hit");
  }

  await this.tween([], [], result.complete ? 420 : 120, token);
  if (token === this.token) this.busy = false;
};
