"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, Check, Loader2, RotateCcw, Save, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatIndiaDateTime } from "@/server/domain/clock";
import type { SettingKey, SettingMetadata } from "./settings-types";

type Props<T extends Record<string, string>> = {
  id: string;
  settingKey: SettingKey;
  title: string;
  description: string;
  icon: LucideIcon;
  initialDraft: T;
  metadata?: SettingMetadata;
  buildValue: (draft: T) => unknown;
  onSaved: (key: SettingKey, metadata: SettingMetadata) => void;
  children: (draft: T, setField: (field: keyof T, value: string) => void) => ReactNode;
  headingLevel?: "h2" | "h3";
};

/** Each editor owns its draft and request state; unrelated settings remain untouched. */
export function SettingEditor<T extends Record<string, string>>({ id, settingKey, title, description, icon: Icon, initialDraft, metadata, buildValue, onSaved, children, headingLevel: Heading = "h2" }: Props<T>) {
  const [draft, setDraft] = useState(initialDraft);
  const [savedDraft, setSavedDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const changed = draftsDiffer(draft, savedDraft, buildValue);
  const canSave = changed || !metadata;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !canSave) return;
    lock.current = true; setSaving(true); setError(""); setMessage("");
    try {
      const value = buildValue(draft);
      const response = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: settingKey, value }) });
      const result = await response.json() as SettingMetadata & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "This setting could not be saved. Your changes have been kept.");
      setSavedDraft({ ...draft });
      onSaved(settingKey, { version: result.version, effectiveAt: result.effectiveAt, isDevDefault: result.isDevDefault });
      setMessage(`Version ${result.version} saved and effective. Existing order snapshots are unchanged.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check your connection and try saving again.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { lock.current = false; setSaving(false); }
  }

  return (
    <form aria-labelledby={`${id}-title`} className="min-w-0 scroll-mt-5 overflow-hidden rounded-xl border border-border bg-surface" id={id} onSubmit={save}>
      <header className="border-b border-border px-4 py-4 sm:px-5"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2.5"><Icon aria-hidden="true" className="shrink-0 text-accent" size={18} /><Heading className="font-serif text-2xl" id={`${id}-title`}>{title}</Heading></div>{changed && <span className="rounded-full bg-surface-hover px-2.5 py-1 text-[10px] font-semibold text-accent">Unsaved changes</span>}</div><p className="mt-2 text-xs leading-5 text-muted">{description}</p></header>
      <div className="space-y-4 p-4 sm:p-5">
        <fieldset className="min-w-0 space-y-4" disabled={saving}>{children(draft, (field, value) => { setDraft((current) => ({ ...current, [field]: value })); setMessage(""); })}</fieldset>
        {error && <p className="flex items-start gap-2 rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger" ref={errorRef} role="alert" tabIndex={-1}><AlertCircle aria-hidden="true" className="shrink-0" size={16} />{error}</p>}
        {message && <p className="flex items-start gap-2 rounded-lg border border-success-border bg-success-bg p-3 text-xs leading-5 text-success" role="status"><Check aria-hidden="true" className="mt-0.5 shrink-0" size={15} />{message}</p>}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-muted px-4 py-3 sm:px-5">
        <div className="min-w-0 space-y-1 text-xs text-muted"><p className="flex flex-wrap items-center gap-2">{metadata ? <span>Version {metadata.version}</span> : <span>Not configured</span>}{metadata?.isDevDefault && <span className="rounded-full border border-warning-border px-2 py-0.5 text-[10px] font-semibold text-warning">DEV DEFAULT</span>}</p>{metadata && <p className="text-[10px] leading-5">Effective {formatIndiaDateTime(new Date(metadata.effectiveAt))}</p>}</div>
        <div className="flex flex-wrap gap-2"><Button disabled={saving || !changed} onClick={() => { setDraft({ ...savedDraft }); setError(""); setMessage(""); }} size="sm" variant="ghost"><RotateCcw aria-hidden="true" size={14} />Reset</Button><Button disabled={saving || !canSave} size="sm" type="submit" variant="primary">{saving ? <Loader2 aria-hidden="true" className="animate-spin" size={14} /> : <Save aria-hidden="true" size={14} />}{saving ? "Saving…" : "Save changes"}</Button></div>
      </footer>
    </form>
  );
}

function draftsDiffer<T extends Record<string, string>>(draft: T, saved: T, buildValue: (draft: T) => unknown) {
  if (JSON.stringify(draft) === JSON.stringify(saved)) return false;
  try { return JSON.stringify(buildValue(draft)) !== JSON.stringify(buildValue(saved)); }
  catch { return true; }
}
