"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { ProductImage } from "./product-types";

type Props = {
  productName: string;
  images: ProductImage[];
  disabled: boolean;
  active: boolean;
  onReorder: (images: ProductImage[]) => Promise<void>;
  onRemove: (image: ProductImage) => void;
};

export function ProductImages({ productName, images, disabled, active, onReorder, onRemove }: Props) {
  const rootRef = useRef<HTMLOListElement>(null);
  const gesture = useRef<{ id: string; pointerId: number; startX: number; startY: number; x: number; y: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const targetRef = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const instructionsId = useId();

  function findTarget(x: number, y: number) {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-sort-image]");
    const id = element && rootRef.current?.contains(element) ? element.dataset.sortImage ?? null : null;
    targetRef.current = id;
    setTarget(id);
  }

  function cancelDrag() { gesture.current = null; targetRef.current = null; setDragging(null); setTarget(null); }

  useEffect(() => {
    if (!dragging) return;
    let frame: number;
    function tick() {
      const current = gesture.current;
      if (!current) return;
      const speed = current.y < 72 ? -12 : current.y > window.innerHeight - 72 ? 12 : 0;
      if (speed) { window.scrollBy(0, speed); findTarget(current.x, current.y); }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { cancelDrag(); setAnnouncement("Image move cancelled."); } };
    window.addEventListener("keydown", escape);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", escape); };
  }, [dragging]);

  async function moveTo(id: string, position: number) {
    if (disabled) return;
    const from = images.findIndex((image) => image.id === id);
    if (from < 0 || from === position) return;
    const reordered = [...images];
    const [image] = reordered.splice(from, 1);
    reordered.splice(position, 0, image);
    setAnnouncement(`Saving image ${from + 1} in position ${position + 1}.`);
    await onReorder(reordered);
  }

  function pointerDown(event: PointerEvent<HTMLSpanElement>, id: string) {
    if (disabled || images.length < 2 || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false };
  }

  function pointerMove(event: PointerEvent<HTMLSpanElement>) {
    const current = gesture.current;
    if (!current || event.pointerId !== current.pointerId) return;
    current.x = event.clientX; current.y = event.clientY;
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 5) return;
    if (!current.moved) { current.moved = true; setDragging(current.id); }
    findTarget(event.clientX, event.clientY);
  }

  function pointerUp(event: PointerEvent<HTMLSpanElement>) {
    const current = gesture.current;
    const targetIndex = images.findIndex((image) => image.id === targetRef.current);
    cancelDrag();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (current?.moved && targetIndex >= 0) void moveTo(current.id, targetIndex);
  }

  return (
    <div>
      <p className="mb-4 text-xs leading-5 text-muted" id={instructionsId}>Drag an image by its grip to any position, or choose a position below it. Position 1 is the cover. JPG, PNG or WebP, up to 5 MB each. Images used by existing orders cannot be removed.</p>
      <p aria-live="polite" className="sr-only">{announcement}</p>
      {images.length ? <ol aria-describedby={instructionsId} aria-label={`${productName} image order`} className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6" ref={rootRef}>
        {images.map((image, index) => <li className={`relative min-w-0 rounded-lg border p-2 transition-colors ${target === image.id && target !== dragging ? "border-accent bg-surface-hover ring-2 ring-accent" : "border-border"} ${dragging === image.id ? "opacity-50" : ""}`} data-sort-image={image.id} key={image.id}>
          <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-surface-muted">
            <Image alt={`${productName} image ${index + 1}`} className="pointer-events-none select-none object-cover" draggable={false} fill sizes="(max-width: 640px) 40vw, 160px" src={image.url} unoptimized />
            {images.length > 1 && <span aria-hidden="true" className={`absolute top-1 left-1 flex size-11 touch-none select-none items-center justify-center rounded-lg border border-border bg-surface/95 text-accent shadow-sm ${disabled ? "cursor-not-allowed opacity-50" : dragging ? "cursor-grabbing" : "cursor-grab"}`} data-drag-handle={image.id} onLostPointerCapture={cancelDrag} onPointerCancel={cancelDrag} onPointerDown={(event) => pointerDown(event, image.id)} onPointerMove={pointerMove} onPointerUp={pointerUp} title="Drag to reorder"><GripVertical size={20} /></span>}
            {target === image.id && target !== dragging && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 bg-accent px-2 py-1 text-center text-xs text-on-accent">Drop in position {index + 1}</span>}
          </div>
          <p className="mt-2 text-xs font-medium">{index === 0 ? "Cover image" : `Image ${index + 1}`}</p>
          <Select aria-label={`Position of ${productName} image ${index + 1}`} className="mt-2" disabled={disabled || images.length < 2} onValueChange={(position) => void moveTo(image.id, Number(position))} options={images.map((_, position) => ({ value: String(position), label: `${position + 1}${position === 0 ? " · Cover" : ""}` }))} value={String(index)} />
          <Button aria-label={`Remove ${productName} image ${index + 1}`} className="mt-1 w-full" disabled={disabled || (active && images.length === 1)} onClick={() => onRemove(image)} size="sm" title={active && images.length === 1 ? "Active products must keep one image. Hide the product first." : "Remove image"} variant="danger-link">Remove</Button>
        </li>)}
      </ol> : <p className="rounded-lg border border-dashed border-border-strong p-5 text-center text-sm text-muted">No images yet. Use Upload image to add the first one.</p>}
    </div>
  );
}
