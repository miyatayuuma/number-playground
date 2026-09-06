// CSS pixels and event timestamps: independent of device pixel ratio/render FPS.
export const SWIPE = Object.freeze({
  window: 100,
  sampleWindow: 50,
  distance: 14,
  speed: 0.7,
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
      (s) => time - s.time <= SWIPE.sampleWindow,
    );
    const elapsed = sample ? time - sample.time : 0;
    const speed =
      elapsed > 0 ? Math.hypot(x - sample.x, y - sample.y) / elapsed : 0;
    this.samples = this.samples.filter(
      (s) => time - s.time <= SWIPE.sampleWindow,
    );
    this.samples.push({ x, y, time });
    if (this.started === null) return false;
    if (time - this.started > SWIPE.window) {
      this.done = true;
      return false;
    }
    if (distance >= SWIPE.distance && speed >= SWIPE.speed) {
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
