"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import { useState, type FormEvent } from "react";

type Line = { id: string; productName: string; productType: "DESIGNER_DRESS" | "CUSTOM_DRESS"; size: "XS" | "S" | "M" | null };

export function ReplacementRequestForm({ orderId, lines }: { orderId: string; lines: Line[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [desiredSizes, setDesiredSizes] = useState<Record<string, string>>({});
  const [fitCorrections, setFitCorrections] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const requestLines = lines.filter((line) => selected[line.id]).map((line) => ({
      orderLineId: line.id,
      ...(line.productType === "DESIGNER_DRESS" ? { desiredSize: desiredSizes[line.id] } : { fitCorrection: fitCorrections[line.id] }),
    }));
    const formData = new FormData();
    formData.set("request", JSON.stringify({ orderId, reason, notes, lines: requestLines }));
    const photos = (event.currentTarget.elements.namedItem("photos") as HTMLInputElement | null)?.files;
    if (photos) for (const photo of [...photos]) formData.append("photos", photo);

    try {
      const response = await fetch("/api/replacements", { method: "POST", body: formData });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Replacement request could not be submitted.");
      setMessage("Your replacement request has been sent for review.");
      setSelected({});
      setReason("");
      setNotes("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Replacement request could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-5 space-y-5 border-t border-border pt-5" onSubmit={submit}>
      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold">Choose items</legend>
        {lines.map((line) => (
          <div className="border border-border p-3" key={line.id}>
            <label className="flex items-start gap-2 text-sm"><input className="mt-1" checked={Boolean(selected[line.id])} onChange={(event) => setSelected((current) => ({ ...current, [line.id]: event.target.checked }))} type="checkbox" />{line.productName} · {line.productType === "CUSTOM_DRESS" ? "Custom dress" : `Size ${line.size}`}</label>
            {selected[line.id] && line.productType === "DESIGNER_DRESS" && (
              <label className="mt-3 block text-sm" htmlFor={`desired-${line.id}`}>Requested exchange size
                <Select aria-label="Requested exchange size" className="mt-1 sm:max-w-xs" id={`desired-${line.id}`} onValueChange={(value) => setDesiredSizes((current) => ({ ...current, [line.id]: value }))} options={[{ value: "", label: "Choose size" }, ...(["XS", "S", "M"] as const).filter((size) => size !== line.size).map((size) => ({ value: size, label: size }))]} required value={desiredSizes[line.id] ?? ""} />
              </label>
            )}
            {selected[line.id] && line.productType === "CUSTOM_DRESS" && (
              <label className="mt-3 block text-sm" htmlFor={`fit-${line.id}`}>Fit adjustment requested
                <textarea className="mt-1 min-h-20 w-full border border-border-strong bg-surface px-3 py-2" id={`fit-${line.id}`} maxLength={1000} onChange={(event) => setFitCorrections((current) => ({ ...current, [line.id]: event.target.value }))} required value={fitCorrections[line.id] ?? ""} />
              </label>
            )}
          </div>
        ))}
      </fieldset>
      <label className="block text-sm" htmlFor="replacementReason">Reason<textarea className="mt-1 min-h-20 w-full border border-border-strong bg-surface px-3 py-2" id="replacementReason" maxLength={500} onChange={(event) => setReason(event.target.value)} required value={reason} /></label>
      <label className="block text-sm" htmlFor="replacementNotes">Additional notes <span className="text-muted">(optional)</span><textarea className="mt-1 min-h-20 w-full border border-border-strong bg-surface px-3 py-2" id="replacementNotes" maxLength={2000} onChange={(event) => setNotes(event.target.value)} value={notes} /></label>
      <label className="block text-sm" htmlFor="photos">Photos <span className="text-muted">(optional, up to 3; JPEG, PNG or WebP, max 5 MB each)</span><input accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm" id="photos" multiple name="photos" type="file" /></label>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {message && <p className="text-sm text-success" role="status">{message}</p>}
      <button className="min-h-11 bg-accent px-5 text-sm font-semibold text-on-accent disabled:opacity-50" disabled={busy || !Object.values(selected).some(Boolean)} type="submit">{busy ? "Sending…" : "Submit request"}</button>
    </form>
  );
}