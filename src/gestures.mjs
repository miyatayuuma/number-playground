// CSS pixels and event timestamps: independent of device pixel ratio/render FPS.
export const PEEL = Object.freeze({
  holdDuration: 550,
  holdSlop: 5,
  peelDistance: 12,
});
export class PeelGesture {
  constructor(x, y, time) {
    this.origin = { x, y };
    this.last = { x, y, time };
    this.startedAt = time;
    this.armed = false;
    this.done = false;
  }
  update(x, y, time) {
    if (this.done) return false;

    const previousDistance = Math.hypot(
      this.last.x - this.origin.x,
      this.last.y - this.origin.y,
    );
    const distance = Math.hypot(x - this.origin.x, y - this.origin.y);
    const elapsed = time - this.startedAt;

    // Holding nearly still for long enough explicitly arms the precision peel.
    // Check the previous known position first so the first movement after a
    // successful hold can both arm and begin the peel in one pointer event.
    if (!this.armed && elapsed >= PEEL.holdDuration && previousDistance <= PEEL.holdSlop)
      this.armed = true;

    // Any meaningful movement before the hold completes commits to a normal drag.
    if (!this.armed && distance > PEEL.holdSlop) {
      this.done = true;
      return false;
    }

    this.last = { x, y, time };
    if (!this.armed) return false;

    // Once armed, direction chooses exactly one direct child; speed no longer matters.
    if (distance >= PEEL.peelDistance) {
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
