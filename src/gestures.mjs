// CSS pixels and event timestamps: independent of device pixel ratio/render FPS.
export const PEEL = Object.freeze({
  sampleWindow: 80,
  minDistance: 12,
  minDuration: 120,
  maxDuration: 360,
  maxSpeed: 0.25,
  fastCommitSpeed: 0.55,
});
export class PeelGesture {
  constructor(x, y, time) {
    this.origin = { x, y };
    this.samples = [{ x, y, time }];
    this.started = null;
    this.done = false;
  }
  update(x, y, time) {
    if (this.done) return false;
    const distance = Math.hypot(x - this.origin.x, y - this.origin.y);
    if (this.started === null && distance >= 4) this.started = time;
    const sample = this.samples.find(
      (s) => time - s.time <= PEEL.sampleWindow,
    );
    const elapsed = sample ? time - sample.time : 0;
    const speed =
      elapsed > 0 ? Math.hypot(x - sample.x, y - sample.y) / elapsed : 0;
    this.samples = this.samples.filter(
      (s) => time - s.time <= PEEL.sampleWindow,
    );
    this.samples.push({ x, y, time });
    if (this.started === null) return false;

    const duration = time - this.started;
    // A decisive normal/flick drag commits to the originally grabbed range.
    // It must not become a fine peel just because the pointer slows down later.
    if (speed >= PEEL.fastCommitSpeed || duration > PEEL.maxDuration) {
      this.done = true;
      return false;
    }
    // A deliberate, slow pull peels exactly one direct child of the selection.
    if (
      duration >= PEEL.minDuration &&
      distance >= PEEL.minDistance &&
      speed <= PEEL.maxSpeed
    ) {
      this.done = true;
      return true;
    }
    return false;
  }
}
export function finerSelection(selection, x, y, dx, dy) {
  if (selection.kind === "grip" || !selection.children?.length) return null;
  const distance = (c) => Math.hypot(c.anchor.x - x, c.anchor.y - y);
  const nearest = Math.min(...selection.children.map(distance));
  // At the seam, follow the direction of the peel; precise contact still wins.
  // Only direct children are considered, so one gesture descends one level.
  return selection.children
    .filter((c) => distance(c) <= nearest + 4)
    .sort(
      (a, b) =>
        (b.anchor.x - selection.anchor.x) * dx +
        (b.anchor.y - selection.anchor.y) * dy -
        ((a.anchor.x - selection.anchor.x) * dx +
          (a.anchor.y - selection.anchor.y) * dy),
    )[0];
}
