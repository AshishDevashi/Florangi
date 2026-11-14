"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "./button";

export function RefreshButton({ label = "Refresh" }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <><Button aria-label={label} disabled={pending} onClick={() => startTransition(() => router.refresh())}><RefreshCw aria-hidden="true" className={pending ? "animate-spin" : ""} size={16} />{pending ? "Refreshing…" : label}</Button><span aria-live="polite" className="sr-only">{pending ? "Refreshing the overview." : ""}</span></>;
}
