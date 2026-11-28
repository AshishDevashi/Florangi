"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { StoreImage } from "./store-image";
import styles from "./home.module.css";

type HeroSlide = { image: string; name: string; href: string };

export function HeroSlideshow({ image, companionImage, name, href, slides }: {
  image: string;
  companionImage?: string;
  name: string;
  href: string;
  slides: HeroSlide[];
}) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const lastSwipe = useRef<number | null>(null);
  const pauseButton = useRef<HTMLButtonElement>(null);
  const indicators = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" &&
        window.matchMedia("(max-width: 700px)").matches &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setActive((current) => (current + 1) % slides.length);
      }
    }, 6000);
    return () => window.clearInterval(timer);
  }, [slides.length, paused]);

  useEffect(() => {
    const strip = indicators.current;
    const selected = strip?.children[active];
    if (!(selected instanceof HTMLElement) || !strip) return;
    const stripBounds = strip.getBoundingClientRect();
    const selectedBounds = selected.getBoundingClientRect();
    if (selectedBounds.left < stripBounds.left) strip.scrollLeft -= stripBounds.left - selectedBounds.left;
    if (selectedBounds.right > stripBounds.right) strip.scrollLeft += selectedBounds.right - stripBounds.right;
  }, [active]);

  function moveSlide(direction: number) {
    setPaused(true);
    setActive((current) => (current + direction + slides.length) % slides.length);
  }

  const slide = slides[active] ?? slides[0];

  return (
    <section
      className={styles.hero}
      aria-labelledby="hero-title"
      onFocusCapture={(event) => {
        if (event.target !== pauseButton.current) setPaused(true);
      }}
      onTouchStart={(event) => {
        touchStart.current = event.touches.length === 1
          ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
          : null;
      }}
      onTouchEnd={(event) => {
        if (slides.length < 2 || !touchStart.current || event.changedTouches.length !== 1) return;
        const dx = event.changedTouches[0].clientX - touchStart.current.x;
        const dy = event.changedTouches[0].clientY - touchStart.current.y;
        touchStart.current = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
          lastSwipe.current = performance.now();
          moveSlide(dx < 0 ? 1 : -1);
        }
      }}
      onTouchCancel={() => { touchStart.current = null; }}
      onClickCapture={(event) => {
        if (lastSwipe.current !== null && performance.now() - lastSwipe.current < 400) {
          event.preventDefault();
          event.stopPropagation();
        }
        lastSwipe.current = null;
      }}
    >
      <div className={`${styles.heroImages} ${companionImage ? "" : styles.singlePhoto}`}>
        <div className={styles.heroPhoto}>
          <StoreImage src={image} alt={`${name} — Florangi occasionwear`} fill loading="eager" sizes={companionImage ? "(max-width: 700px) 1px, 50vw" : "(max-width: 700px) 1px, 100vw"} className={styles.coverImage} />
        </div>
        {companionImage && (
          <div className={styles.heroCompanion}>
            <StoreImage src={companionImage} alt="" fill loading="eager" sizes="(max-width: 700px) 1px, 50vw" className={styles.coverImage} />
          </div>
        )}
      </div>
      <div className={styles.heroMobileImages}>
        {slides.map((item, index) => (
          <div className={`${styles.heroMobileSlide} ${active === index ? styles.heroMobileSlideActive : ""}`} key={item.href}>
            <StoreImage src={item.image} alt="" fill loading={index === 0 ? "eager" : "lazy"} sizes="(max-width: 700px) 100vw, 1px" className={styles.coverImage} />
          </div>
        ))}
      </div>
      <div className={styles.heroCaption}>
        <p className={styles.heroEyebrow}>The collection</p>
        <h1 id="hero-title"><span className={styles.heroDesktopText}>{name}</span><span className={styles.heroMobileText}>{slide.name}</span></h1>
        <Link href={href} className={buttonStyles({ variant: "primary", className: `${styles.campaignButton} ${styles.heroDesktopAction}` })}>
          Shop the collection <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
        <Link href={slide.href} className={buttonStyles({ variant: "primary", className: `${styles.campaignButton} ${styles.heroMobileAction}` })}>
          Shop the collection <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
        {slides.length > 1 && (
          <div className={styles.heroSlideshowControls} role="group" aria-label="Collection slideshow controls">
            <div className={styles.heroControlRow}>
              <div className={styles.heroIndicators} ref={indicators} role="group" aria-label="Choose a collection">
                {slides.map((item, index) => (
                  <button type="button" className={styles.heroIndicator} key={item.href} aria-label={`Show ${item.name}, ${index + 1} of ${slides.length}`} aria-pressed={active === index} onClick={() => { setPaused(true); setActive(index); }}>
                    <span />
                  </button>
                ))}
              </div>
              <button type="button" ref={pauseButton} className={styles.heroPauseButton} aria-label={paused ? "Play slideshow" : "Pause slideshow"} onClick={() => setPaused((current) => !current)}>
                {paused ? <Play size={12} fill="currentColor" aria-hidden="true" /> : <Pause size={12} fill="currentColor" aria-hidden="true" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
