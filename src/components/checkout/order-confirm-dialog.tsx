"use client";

import { useRef, useState, type PointerEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { formatPaise } from "@/server/domain/money";

export function OrderConfirmDialog({ open, onClose, onConfirm, paymentMethod, totalPaise }: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  paymentMethod: "ONLINE" | "COD";
  totalPaise: number;
}) {
  const thumb = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; distance: number } | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fillWidth = offset > 0 ? offset + 32 : 0;

  function reset() {
    drag.current = null;
    setOffset(0);
    setDragging(false);
  }

  function finish(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const distance = drag.current.distance;
    const travel = event.currentTarget.clientWidth - (thumb.current?.offsetWidth ?? 0) - 8;
    if (cancelled) suppressClick.current = true;
    reset();
    if (!cancelled && travel > 0 && distance >= travel * 0.85) onConfirm();
  }

  return (
    <Dialog
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Confirm your order"
      description={paymentMethod === "ONLINE"
        ? "Confirming creates your order and opens secure online payment."
        : "Confirming places your Cash on Delivery order for review."}
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4 rounded-lg bg-background p-4 text-sm">
          <span className="text-muted">{paymentMethod === "ONLINE" ? "Pay online" : "Cash on Delivery"}</span>
          <span className="font-semibold">{formatPaise(totalPaise)}</span>
        </div>
        <button
          type="button"
          aria-label="Confirm order: swipe right, tap, or press Enter"
          className="relative mt-6 flex h-16 w-full touch-pan-y cursor-grab items-center overflow-hidden rounded-full border border-border bg-surface p-1 text-left active:cursor-grabbing"
          onClick={(event) => {
            if (event.detail === 0 || !suppressClick.current) onConfirm();
            suppressClick.current = false;
          }}
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return;
            suppressClick.current = false;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { pointerId: event.pointerId, startX: event.clientX, distance: 0 };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            if (!drag.current || drag.current.pointerId !== event.pointerId) return;
            const travel = Math.max(0, event.currentTarget.clientWidth - (thumb.current?.offsetWidth ?? 0) - 8);
            drag.current.distance = Math.min(travel, Math.max(0, event.clientX - drag.current.startX));
            if (Math.abs(event.clientX - drag.current.startX) > 6) suppressClick.current = true;
            setOffset(drag.current.distance);
          }}
          onPointerUp={(event) => finish(event)}
          onPointerCancel={(event) => finish(event, true)}
          onLostPointerCapture={() => {
            if (drag.current) { suppressClick.current = true; reset(); }
          }}
        >
          <span aria-hidden="true" className={`absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,var(--espresso),var(--plum),color-mix(in_srgb,var(--plum)_75%,var(--rose)))] ${dragging ? "" : "motion-safe:transition-[width]"}`} style={{ width: `${fillWidth}px` }} />
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center pl-12 text-sm font-semibold text-accent">Swipe or tap to confirm</span>
          <span aria-hidden="true" className={`pointer-events-none absolute inset-0 flex items-center justify-center pl-12 text-sm font-semibold text-on-accent ${dragging ? "" : "motion-safe:transition-[clip-path]"}`} style={{ clipPath: `inset(0 calc(100% - ${fillWidth}px) 0 0)` }}>Swipe or tap to confirm</span>
          <span
            ref={thumb}
            aria-hidden="true"
            className={`relative flex size-14 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--espresso),var(--plum),color-mix(in_srgb,var(--plum)_75%,var(--rose)))] text-on-accent shadow-md ${dragging ? "" : "motion-safe:transition-transform"}`}
            style={{ transform: `translateX(${offset}px)` }}
          >
            <ArrowRight size={20} aria-hidden="true" />
          </span>
        </button>
      </div>
    </Dialog>
  );
}
