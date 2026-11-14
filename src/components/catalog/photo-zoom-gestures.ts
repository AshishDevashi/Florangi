export type PhotoPoint = { x: number; y: number };
export type PhotoTransform = PhotoPoint & { scale: number };
type Bounds = { width: number; height: number; imageWidth: number; imageHeight: number };
type Gesture = { midpoint: PhotoPoint; distance: number; transform: PhotoTransform };

const distance = (a: PhotoPoint, b: PhotoPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: PhotoPoint, b: PhotoPoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const clamp = (value: number, limit: number) => limit > 0 ? Math.max(-limit, Math.min(limit, value)) : 0;

/** Input-independent gesture state, shared by touch, pen, mouse and keyboard. */
export class PhotoZoomGestures {
  transform: PhotoTransform = { scale: 1, x: 0, y: 0 };
  mode: "mouse" | "touch" | "keyboard" = "keyboard";
  private bounds: Bounds = { width: 0, height: 0, imageWidth: 0, imageHeight: 0 };
  private pointers = new Map<number, PhotoPoint>();
  private gesture: Gesture | null = null;
  private pinched = false;
  private moved = false;
  private tap: { point: PhotoPoint; time: number } | null = null;

  constructor(private readonly onChange: (transform: PhotoTransform) => void = () => {}) {}

  resize(bounds: Bounds) {
    this.bounds = bounds;
    this.pointers.clear();
    this.gesture = null;
    this.tap = null;
    this.reset();
  }

  private update(value: PhotoTransform) {
    const scale = Math.max(1, Math.min(4, value.scale));
    const { width, height, imageWidth, imageHeight } = this.bounds;
    this.transform = {
      scale,
      x: clamp(value.x, Math.max(0, (imageWidth * scale - width) / 2)),
      y: clamp(value.y, Math.max(0, (imageHeight * scale - height) / 2)),
    };
    this.onChange(this.transform);
  }

  reset() { this.update({ scale: 1, x: 0, y: 0 }); }

  hover(point: PhotoPoint) {
    if (this.pointers.size) return;
    this.mode = "mouse";
    const { width, height, imageWidth, imageHeight } = this.bounds;
    if (!imageWidth || !imageHeight) return;
    const x = (point.x - (width - imageWidth) / 2) / imageWidth;
    const y = (point.y - (height - imageHeight) / 2) / imageHeight;
    this.update({ scale: 3, x: (0.5 - Math.max(0, Math.min(1, x))) * Math.max(0, imageWidth * 3 - width), y: (0.5 - Math.max(0, Math.min(1, y))) * Math.max(0, imageHeight * 3 - height) });
  }

  leave() { if (this.mode === "mouse") this.reset(); }

  private rebase() {
    const [a, b] = [...this.pointers.values()];
    this.gesture = a ? { midpoint: b ? midpoint(a, b) : a, distance: b ? distance(a, b) : 0, transform: { ...this.transform } } : null;
  }

  start(id: number, point: PhotoPoint) {
    if (this.pointers.size >= 2) return;
    if (!this.pointers.size) {
      this.pinched = false;
      this.moved = false;
      if (this.mode === "mouse") this.reset();
    }
    this.mode = "touch";
    this.pointers.set(id, point);
    if (this.pointers.size === 2) { this.pinched = true; this.tap = null; }
    this.rebase();
  }

  move(id: number, point: PhotoPoint) {
    if (!this.pointers.has(id) || !this.gesture) return;
    this.pointers.set(id, point);
    const [a, b] = [...this.pointers.values()];
    const current = b ? midpoint(a, b) : a;
    const base = this.gesture;
    if (distance(current, base.midpoint) >= 8) this.moved = true;
    const scale = b && base.distance > 0 ? Math.max(1, Math.min(4, base.transform.scale * distance(a, b) / base.distance)) : base.transform.scale;
    const center = { x: this.bounds.width / 2, y: this.bounds.height / 2 };
    this.update({
      scale,
      x: current.x - center.x - (base.midpoint.x - center.x - base.transform.x) * scale / base.transform.scale,
      y: current.y - center.y - (base.midpoint.y - center.y - base.transform.y) * scale / base.transform.scale,
    });
  }

  end(id: number, point: PhotoPoint, time: number, cancelled = false) {
    if (!this.pointers.has(id)) return;
    const isTap = !cancelled && !this.pinched && !this.moved && this.pointers.size === 1 && this.gesture && distance(point, this.gesture.midpoint) < 8;
    this.pointers.delete(id);
    if (isTap) {
      if (this.tap && time - this.tap.time < 300 && distance(point, this.tap.point) < 24) {
        this.zoomAt(this.transform.scale > 1 ? 1 : 2.5, point);
        this.tap = null;
      } else this.tap = { point, time };
    } else this.tap = null;
    this.rebase();
  }

  private zoomAt(scale: number, point = { x: this.bounds.width / 2, y: this.bounds.height / 2 }) {
    const { width, height } = this.bounds;
    const previous = this.transform;
    scale = Math.max(1, Math.min(4, scale));
    this.update({ scale, x: point.x - width / 2 - (point.x - width / 2 - previous.x) * scale / previous.scale, y: point.y - height / 2 - (point.y - height / 2 - previous.y) * scale / previous.scale });
  }

  key(key: string) {
    if (!["+", "=", "-", "_", "0", "Enter", " "].includes(key) && !(this.transform.scale > 1 && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key))) return false;
    this.mode = "keyboard";
    if (["+", "="].includes(key)) this.zoomAt(this.transform.scale + 0.5);
    else if (["-", "_"].includes(key)) this.zoomAt(this.transform.scale - 0.5);
    else if (key === "0") this.reset();
    else if (key === "Enter" || key === " ") this.zoomAt(this.transform.scale > 1 ? 1 : 2.5);
    else this.update({ ...this.transform, x: this.transform.x + (key === "ArrowLeft" ? 60 : key === "ArrowRight" ? -60 : 0), y: this.transform.y + (key === "ArrowUp" ? 60 : key === "ArrowDown" ? -60 : 0) });
    return true;
  }
}
