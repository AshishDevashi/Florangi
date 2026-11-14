"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./product.module.css";

/** Tall panels scroll naturally before pinning their bottom within the viewport. */
export function ProductDetails({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const observer = new ResizeObserver(() => {
      panel.style.setProperty("--purchase-height", `${panel.getBoundingClientRect().height}px`);
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);
  return <div className={styles.detailsColumn} ref={ref}>{children}</div>;
}
