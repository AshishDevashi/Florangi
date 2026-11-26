"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Expand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { StoreImage } from "@/components/storefront/store-image";
import { ProductPhotoZoom } from "./product-photo-zoom";
import styles from "./product.module.css";

export function ProductGallery({ images, name }: { images: Array<{ url: string }>; name: string }) {
  const photos = images.length ? images : [{ url: "/images/demo-dress.svg" }];
  const trackRef = useRef<HTMLDivElement>(null);
  const pendingTarget = useRef<number | null>(null);
  const scrollTimer = useRef<number | null>(null);
  const touchingTrack = useRef(false);
  const [active, setActive] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);

  useEffect(() => () => {
    if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current);
  }, []);

  useEffect(() => {
    if (viewer === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      setViewer((index) => index === null ? null : (index + direction + photos.length) % photos.length);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewer, photos.length]);

  function goTo(index: number) {
    const next = Math.max(0, Math.min(index, photos.length - 1));
    const track = trackRef.current;
    const photo = track?.children[next];
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
    if (window.matchMedia("(max-width: 900px)").matches && track && photo instanceof HTMLElement) {
      if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current);
      const left = Math.min(photo.offsetLeft, track.scrollWidth - track.clientWidth);
      pendingTarget.current = next;
      if (Math.abs(track.scrollLeft - left) < 1) {
        track.scrollTo({ left, behavior: "instant" });
        pendingTarget.current = null;
        setActive(next);
      } else {
        track.scrollTo({ left, behavior });
      }
    } else {
      pendingTarget.current = null;
      setActive(next);
      photo?.scrollIntoView({ behavior, block: "nearest" });
    }
  }

  function settleScroll(track: HTMLDivElement) {
    if (!window.matchMedia("(max-width: 900px)").matches) {
      pendingTarget.current = null;
      return;
    }
    let closest = 0;
    let distance = Infinity;
    Array.from(track.children).forEach((photo, index) => {
      if (!(photo instanceof HTMLElement)) return;
      const left = Math.min(photo.offsetLeft, track.scrollWidth - track.clientWidth);
      const nextDistance = Math.abs(track.scrollLeft - left);
      if (nextDistance < distance) {
        distance = nextDistance;
        closest = index;
      }
    });
    if (pendingTarget.current !== null && pendingTarget.current !== closest) return;
    pendingTarget.current = null;
    setActive(closest);
  }

  function scheduleScrollSettlement(track: HTMLDivElement) {
    if ("onscrollend" in track) return;
    if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current);
    if (!touchingTrack.current) scrollTimer.current = window.setTimeout(() => settleScroll(track), 150);
  }

  function moveViewer(direction: number) {
    setViewer((index) => index === null ? null : (index + direction + photos.length) % photos.length);
  }

  return (
    <section className={styles.gallery} aria-label={`${name} photos`}>
      <div className={styles.galleryStage}>
        <div
          className={styles.galleryTrack}
          ref={trackRef}
          onScroll={(event) => scheduleScrollSettlement(event.currentTarget)}
          onScrollEnd={(event) => settleScroll(event.currentTarget)}
          onPointerDown={() => { pendingTarget.current = null; }}
          onWheel={() => { pendingTarget.current = null; }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") pendingTarget.current = null;
          }}
          onTouchStart={() => {
            touchingTrack.current = true;
            if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current);
          }}
          onTouchEnd={(event) => {
            touchingTrack.current = false;
            scheduleScrollSettlement(event.currentTarget);
          }}
          onTouchCancel={(event) => {
            touchingTrack.current = false;
            scheduleScrollSettlement(event.currentTarget);
          }}
        >
          {photos.map((photo, index) => (
            <button
              type="button"
              className={styles.galleryPhoto}
              key={`${photo.url}:${index}`}
              aria-label={`Enlarge ${name} photo ${index + 1} of ${photos.length}`}
              onClick={() => setViewer(index)}
            >
              <StoreImage src={photo.url} alt={`${name} — view ${index + 1}`} fill preload={index === 0} sizes="(max-width: 900px) 100vw, 32vw" className={styles.galleryImage} />
              <span className={styles.expandIcon}><Expand size={16} aria-hidden="true" /></span>
            </button>
          ))}
        </div>
        {photos.length > 1 && <div className={styles.galleryControls}>
          <Button variant="secondary" size="icon" aria-label="Previous product photo" disabled={active === 0} onClick={() => goTo((pendingTarget.current ?? active) - 1)}><ArrowLeft size={17} aria-hidden="true" /></Button>
          <span aria-live="polite">{active + 1} / {photos.length}</span>
          <Button variant="secondary" size="icon" aria-label="Next product photo" disabled={active === photos.length - 1} onClick={() => goTo((pendingTarget.current ?? active) + 1)}><ArrowRight size={17} aria-hidden="true" /></Button>
        </div>}
      </div>
      {photos.length > 1 && <div className={styles.thumbnails} role="group" aria-label="Choose a product photo">
        {photos.map((photo, index) => <button type="button" key={`${photo.url}:thumb:${index}`} className={styles.thumbnail} aria-label={`Show product photo ${index + 1}`} aria-pressed={active === index} onClick={() => goTo(index)}>
          <StoreImage src={photo.url} alt="" fill sizes="64px" className={styles.galleryImage} />
        </button>)}
      </div>}

      <Dialog open={viewer !== null} onClose={() => setViewer(null)} title={name} description="Hover to magnify. On touch screens, pinch or double-tap to zoom.">
        {viewer !== null && <ProductPhotoZoom key={viewer} src={photos[viewer].url} alt={`${name} — enlarged view ${viewer + 1}`} />}
        <div className={styles.viewerControls}>
          <Button variant="ghost" size="icon" aria-label="Previous enlarged photo" disabled={photos.length < 2} onClick={() => moveViewer(-1)}><ArrowLeft size={19} aria-hidden="true" /></Button>
          <span aria-live="polite">{(viewer ?? 0) + 1} / {photos.length}</span>
          <Button variant="ghost" size="icon" aria-label="Next enlarged photo" disabled={photos.length < 2} onClick={() => moveViewer(1)}><ArrowRight size={19} aria-hidden="true" /></Button>
        </div>
      </Dialog>
    </section>
  );
}
