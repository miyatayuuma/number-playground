import { FlowWorld } from "./flow-view.mjs";

const baseAnimate = FlowWorld.prototype.animate;

function waveIndex(index, count) {
  if (count <= 1) return 0;
  return Math.min(2, Math.floor((index * 3) / count));
}

FlowWorld.prototype.animate = async function animate(result) {
  if (result.type !== "volley") return baseAnimate.call(this, result);

  this.busy = true;
  this.drag = null;
  this.hover = null;
  const token = this.token,
    enemy = this.enemyPoint(),
    ids = [...result.ids],
    groupIndex = new Map();

  result.groups.forEach((group, i) => {
    const wave = waveIndex(i, result.groups.length);
    group.forEach((id) => groupIndex.set(id, wave));
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
      delay: (groupIndex.get(id) || 0) * 65,
    })),
    190,
    token,
  );
  if (token !== this.token) return;

  this.burst(enemy.x, enemy.y, this.color, result.outcome === "win" ? 2 : 1.15);
  this.onCue?.("hit");

  if (result.outcome === "repel") {
    this.onCue?.("miss");
    await this.tween(
      ids,
      ids.map((id) => ({
        ...home.get(id),
        delay: (2 - (groupIndex.get(id) || 0)) * 45,
      })),
      210,
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

  await this.tween([], [], result.complete ? 420 : 90, token);
  if (token === this.token) this.busy = false;
};
