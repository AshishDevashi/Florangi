"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  busy?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

export function Dialog({ open, onClose, title, description, busy = false, initialFocusRef, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    initialFocusRef?.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open, initialFocusRef]);

  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-2xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-espresso/50"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      ref={ref}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border p-5 sm:px-6">
          <div>
            <h2 className="font-serif text-3xl" id={titleId}>{title}</h2>
            <p className="mt-1 text-sm leading-6 text-muted" id={descriptionId}>{description}</p>
          </div>
          <Button aria-label="Close dialog" disabled={busy} onClick={onClose} size="icon" variant="ghost"><X aria-hidden="true" size={20} /></Button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
