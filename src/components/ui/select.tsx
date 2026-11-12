"use client";

import { useEffect, useId, useRef, useState, type AriaAttributes, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = { value: string; label: string; disabled?: boolean };
type SelectProps = Pick<AriaAttributes, "aria-label" | "aria-labelledby" | "aria-describedby"> & {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

/** Custom listbox with a native select backing form submission and validation. */
export function Select({ options, value, defaultValue, onValueChange, id, name, required, disabled, placeholder = "Choose an option", className = "", ...aria }: SelectProps) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listId = `${triggerId}-list`;
  const errorId = `${triggerId}-error`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const nativeRef = useRef<HTMLSelectElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue ?? options[0]?.value ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [invalid, setInvalid] = useState(false);
  const typeahead = useRef({ text: "", time: 0 });
  const selectedValue = value ?? internalValue;
  const selected = options.find((option) => option.value === selectedValue);
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);

  function positionMenu() {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const upwards = below < 180 && above > below;
    const width = Math.min(Math.max(rect.width, 160), window.innerWidth - 24);
    Object.assign(menu.style, {
      width: `${width}px`,
      maxHeight: `${Math.max(44, Math.min(288, upwards ? above : below))}px`,
      left: `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`,
      top: upwards ? "auto" : `${rect.bottom + 6}px`,
      bottom: upwards ? `${window.innerHeight - rect.top + 6}px` : "auto",
    });
  }

  function closeMenu() { menuRef.current?.hidePopover(); setOpen(false); }

  function openMenu(index = options.findIndex((option) => option.value === selectedValue && !option.disabled)) {
    if (triggerRef.current?.matches(":disabled") || !enabled.length) return;
    setActive(index >= 0 ? index : enabled[0]);
    positionMenu();
    menuRef.current?.showPopover();
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    if (value === undefined) setInternalValue(option.value);
    setInvalid(false);
    onValueChange?.(option.value);
    closeMenu();
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const reposition = () => positionMenu();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  useEffect(() => {
    const form = nativeRef.current?.form;
    const reset = () => { if (value === undefined) setInternalValue(defaultValue ?? options[0]?.value ?? ""); setInvalid(false); closeMenu(); };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [value, defaultValue, options]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) { openMenu(event.key === "End" ? enabled.at(-1) : event.key === "Home" ? enabled[0] : undefined); return; }
      const current = enabled.indexOf(active);
      const index = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length;
      setActive(enabled[index]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active); else openMenu();
    } else if (event.key === "Escape" && open) {
      event.preventDefault(); event.stopPropagation(); closeMenu();
    } else if (event.key === "Tab") {
      closeMenu();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const text = now - typeahead.current.time < 600 ? typeahead.current.text + event.key.toLowerCase() : event.key.toLowerCase();
      typeahead.current = { text, time: now };
      const index = options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(text));
      if (index >= 0) { if (open) setActive(index); else choose(index); }
    }
  }

  return (
    <span className={`block min-w-0 ${className}`}>
      <select aria-hidden="true" className="sr-only" disabled={disabled} name={name} onChange={() => {}} onInvalid={(event) => { event.preventDefault(); setInvalid(true); triggerRef.current?.focus(); }} ref={nativeRef} required={required} tabIndex={-1} value={selectedValue}>
        {!options.some((option) => option.value === "") && <option value="">{placeholder}</option>}
        {options.map((option) => <option disabled={option.disabled} key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <button
        {...aria}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-controls={listId}
        aria-describedby={[aria["aria-describedby"], invalid ? errorId : ""].filter(Boolean).join(" ") || undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border bg-surface px-3 py-2.5 text-left font-sans text-sm font-medium outline-none transition-colors hover:border-accent focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-rose/30 disabled:cursor-not-allowed disabled:opacity-50 ${invalid ? "border-danger" : open ? "border-accent ring-2 ring-rose/30" : "border-border-strong"}`}
        disabled={disabled || !enabled.length}
        id={triggerId}
        onClick={() => { if (open) closeMenu(); else openMenu(); }}
        onKeyDown={onKeyDown}
        ref={triggerRef}
        role="combobox"
        type="button"
      >
        <span className={`truncate ${selected ? "text-foreground" : "text-muted"}`}>{selected?.label ?? placeholder}</span>
        <ChevronDown aria-hidden="true" className={`shrink-0 text-accent transition-transform ${open ? "rotate-180" : ""}`} size={16} />
      </button>
      <div aria-label={aria["aria-label"] ?? "Options"} aria-labelledby={aria["aria-labelledby"]} className="m-0 overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface p-1.5 text-foreground shadow-xl" id={listId} onToggle={(event) => { if (event.newState === "closed") setOpen(false); }} popover="auto" ref={menuRef} role="listbox" style={{ position: "fixed", inset: "auto" }}>
        {options.map((option, index) => <div
          aria-disabled={option.disabled || undefined}
          aria-selected={option.value === selectedValue}
          className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${option.disabled ? "cursor-not-allowed opacity-40" : active === index ? "bg-accent text-on-accent" : option.value === selectedValue ? "bg-surface-hover text-accent" : "text-foreground hover:bg-surface-muted"}`}
          data-option-index={index}
          id={`${listId}-${index}`}
          key={option.value}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); choose(index); }}
          onPointerDown={(event) => event.preventDefault()}
          onPointerMove={() => { if (!option.disabled) setActive(index); }}
          role="option"
        ><span>{option.label}</span>{option.value === selectedValue && <Check aria-hidden="true" className="shrink-0" size={16} />}</div>)}
      </div>
      {invalid && <span className="mt-1.5 block text-xs text-danger" id={errorId} role="alert">Choose an option to continue.</span>}
    </span>
  );
}
