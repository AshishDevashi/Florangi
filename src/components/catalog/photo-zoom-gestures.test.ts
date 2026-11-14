import { describe, expect, it } from "vitest";
import { PhotoZoomGestures } from "./photo-zoom-gestures";

function create() {
  const zoom = new PhotoZoomGestures();
  zoom.resize({ width: 400, height: 600, imageWidth: 400, imageHeight: 600 });
  return zoom;
}

describe("product photo gestures", () => {
  it("pinches around the fingers and keeps the fixed finger anchored", () => {
    const zoom = create();
    zoom.start(1, { x: 100, y: 200 });
    zoom.start(2, { x: 200, y: 200 });
    zoom.move(2, { x: 300, y: 200 });
    expect(zoom.transform).toEqual({ scale: 2, x: 100, y: 100 });
  });

  it("continues smoothly with one-finger panning after a pinch", () => {
    const zoom = create();
    zoom.start(1, { x: 100, y: 300 });
    zoom.start(2, { x: 300, y: 300 });
    zoom.move(1, { x: 0, y: 300 });
    zoom.move(2, { x: 400, y: 300 });
    expect(zoom.transform).toEqual({ scale: 2, x: 0, y: 0 });
    zoom.end(1, { x: 0, y: 300 }, 100);
    zoom.move(2, { x: 450, y: 300 });
    expect(zoom.transform.x).toBe(50);
    zoom.move(2, { x: 2000, y: 300 });
    expect(zoom.transform.x).toBe(200); // The image edge cannot be dragged past the viewport edge.
  });

  it("limits magnification and returns a pinched-in image to its fitted position", () => {
    const zoom = create();
    zoom.start(1, { x: 150, y: 300 });
    zoom.start(2, { x: 250, y: 300 });
    zoom.move(2, { x: 10000, y: 300 });
    expect(zoom.transform.scale).toBe(4);
    zoom.move(2, { x: 151, y: 300 });
    expect(zoom.transform).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("supports double-tap zoom and reset without mistaking drags for taps", () => {
    const zoom = create();
    const tap = (time: number) => { zoom.start(1, { x: 200, y: 300 }); zoom.end(1, { x: 200, y: 300 }, time); };
    tap(10); tap(150);
    expect(zoom.transform.scale).toBe(2.5);
    tap(600); tap(750);
    expect(zoom.transform.scale).toBe(1);
    tap(1000);
    zoom.start(1, { x: 200, y: 300 });
    zoom.move(1, { x: 250, y: 300 });
    zoom.move(1, { x: 200, y: 300 });
    zoom.end(1, { x: 200, y: 300 }, 1100);
    expect(zoom.transform.scale).toBe(1);
  });

  it("releases cancelled pointers and resets on viewport changes", () => {
    const zoom = create();
    zoom.start(1, { x: 100, y: 300 });
    zoom.end(1, { x: 100, y: 300 }, 50, true);
    zoom.move(1, { x: 300, y: 300 });
    expect(zoom.transform.scale).toBe(1);
    zoom.hover({ x: 0, y: 0 });
    expect(zoom.transform.scale).toBe(3);
    zoom.resize({ width: 300, height: 400, imageWidth: 267, imageHeight: 400 });
    expect(zoom.transform).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("tracks mouse magnification to every edge and resets on leave", () => {
    const zoom = create();
    zoom.hover({ x: 0, y: 0 });
    expect(zoom.transform).toEqual({ scale: 3, x: 400, y: 600 });
    zoom.hover({ x: 400, y: 600 });
    expect(zoom.transform).toEqual({ scale: 3, x: -400, y: -600 });
    zoom.leave();
    expect(zoom.transform).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("keeps arrow navigation available at fit, and pans only while keyboard-zoomed", () => {
    const zoom = create();
    expect(zoom.key("ArrowRight")).toBe(false);
    zoom.key("Enter");
    expect(zoom.transform.scale).toBe(2.5);
    expect(zoom.key("ArrowRight")).toBe(true);
    expect(zoom.transform.x).toBe(-60);
    zoom.key("0");
    expect(zoom.transform).toEqual({ scale: 1, x: 0, y: 0 });
    expect(zoom.key("Escape")).toBe(false);
  });

  it("keeps a portrait centered in a wide viewer until its zoomed width fills the frame", () => {
    const zoom = create();
    zoom.resize({ width: 600, height: 450, imageWidth: 300, imageHeight: 450 });
    zoom.key("+");
    zoom.key("ArrowRight");
    expect(zoom.transform.x).toBe(0);
    zoom.key("Enter");
    expect(zoom.transform.scale).toBe(1);
    zoom.hover({ x: 600, y: 450 });
    expect(zoom.transform).toEqual({ scale: 3, x: -150, y: -450 });
  });
});
