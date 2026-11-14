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
  const [active, setActive] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);

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
    setActive(next);
    const photo = trackRef.current?.children[next];
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
    if (window.matchMedia("(max-width: 900px)").matches) {
      trackRef.current?.scrollTo({ left: (photo as HTMLElement | undefined)?.offsetLeft ?? 0, behavior });
    } else {
      photo?.scrollIntoView({ behavior, block: "nearest" });
    }
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
          onScroll={(event) => {
            const width = event.currentTarget.firstElementChild?.getBoundingClientRect().width;
            if (width && window.matchMedia("(max-width: 900px)").matches) {
              setActive(Math.min(photos.length - 1, Math.max(0, Math.round(event.currentTarget.scrollLeft / (width + 4)))));
            }
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
          <Button variant="secondary" size="icon" aria-label="Previous product photo" disabled={active === 0} onClick={() => goTo(active - 1)}><ArrowLeft size={17} aria-hidden="true" /></Button>
          <span aria-live="polite">{active + 1} / {photos.length}</span>
          <Button variant="secondary" size="icon" aria-label="Next product photo" disabled={active === photos.length - 1} onClick={() => goTo(active + 1)}><ArrowRight size={17} aria-hidden="true" /></Button>
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
