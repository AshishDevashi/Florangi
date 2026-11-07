"use client";

import { useSyncExternalStore } from "react";

function subscribeToHash(callback: () => void): () => void {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function getTokenFromHash(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
}

export function useFragmentToken(serverFallback = ""): string {
  return useSyncExternalStore(subscribeToHash, getTokenFromHash, () => serverFallback);
}