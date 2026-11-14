"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { StoreImage } from "@/components/storefront/store-image";
import { PhotoZoomGestures } from "./photo-zoom-gestures";
import styles from "./product.module.css";

export function ProductPhotoZoom({ src, alt }: { src: string; alt: string }) {
  const viewport = useRef<HTMLButtonElement>(null);
  const image = useRef<HTMLSpanElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const frame = useRef<number | null>(null);
  const instructionsId = useId();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [aspect, setAspect] = useState(2 / 3);
  const gestures = useRef<PhotoZoomGestures | null>(null);
  const imageHeight = Math.min(size.height, size.width / aspect);
  const imageWidth = imageHeight * aspect;

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const controller = new PhotoZoomGestures(() => {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const { x, y, scale } = controller.transform;
        if (image.current) image.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
        if (viewport.current) {
          viewport.current.setAttribute("aria-pressed", String(scale > 1));
          viewport.current.dataset.zoomed = String(scale > 1);
          viewport.current.dataset.input = controller.mode;
        }
        if (indicator.current) indicator.current.textContent = scale > 1 ? `${scale.toFixed(1)}×` : "";
      });
    });
    gestures.current = controller;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      gestures.current = null;
    };
  }, []);

  useEffect(() => {
    gestures.current!.resize({ ...size, imageWidth, imageHeight });
  }, [size, imageWidth, imageHeight]);

  function point(event: PointerEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function hover(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse") gestures.current!.hover(point(event));
  }

  function end(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    if (event.pointerType === "mouse") return;
    gestures.current!.end(event.pointerId, point(event), event.timeStamp, cancelled);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div className={styles.zoomContainer}>
      <button
        ref={viewport}
        type="button"
        className={styles.zoomViewport}
        aria-label={`Explore ${alt}`}
        aria-describedby={instructionsId}
        aria-pressed="false"
        onPointerEnter={hover}
        onPointerLeave={(event) => { if (event.pointerType === "mouse") gestures.current!.leave(); }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") return;
          event.currentTarget.setPointerCapture(event.pointerId);
          gestures.current!.start(event.pointerId, point(event));
        }}
        onPointerMove={(event) => {
          if (event.pointerType === "mouse") hover(event);
          else gestures.current!.move(event.pointerId, point(event));
        }}
        onPointerUp={(event) => end(event)}
        onPointerCancel={(event) => end(event, true)}
        onLostPointerCapture={(event) => end(event, true)}
        onClick={(event) => { if (event.detail === 0) gestures.current!.key("Enter"); }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") return; // Native button activation handles these.
          if (gestures.current!.key(event.key)) { event.preventDefault(); event.stopPropagation(); }
        }}
      >
        <span ref={image} className={styles.zoomImage} style={{ width: imageWidth || "100%", height: imageHeight || "100%" }}>
          <StoreImage src={src} alt={alt} fill loading="eager" sizes="1400px" draggable={false} className={styles.containImage} onLoad={(event) => {
            const photo = event.currentTarget;
            if (photo.naturalHeight) setAspect(photo.naturalWidth / photo.naturalHeight);
          }} />
        </span>
      </button>
      <span className={styles.zoomIndicator} ref={indicator} aria-hidden="true" />
      <p className="sr-only" id={instructionsId}>Move your mouse over the photo to magnify it. On touch screens, pinch to zoom, drag to explore, or double-tap to zoom and reset. Keyboard: Enter toggles zoom, plus and minus change zoom, arrow keys pan when zoomed, and zero resets.</p>
    </div>
  );
}
