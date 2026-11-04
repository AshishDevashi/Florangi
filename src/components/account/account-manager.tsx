"use client";

import { useState, type FormEvent } from "react";

type Address = {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pinCode: string;
  isDefault: boolean;
};

type AddressFields = { [Field in keyof Omit<Address, "id" | "isDefault">]: string };

const emptyAddress: AddressFields = {
  fullName: "",
  phone: "",
  line1: "",
  line2: "",
  landmark: "",
  city: "",
  state: "",
  pinCode: "",
};

export function AccountManager({
  initialName,
  initialPhone,
  initialAddresses,
}: {
  initialName: string;
  initialPhone: string;
  initialAddresses: Address[];
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [addresses, setAddresses] = useState(initialAddresses);
  const [newAddress, setNewAddress] = useState(emptyAddress);
  const [edited, setEdited] = useState<Record<string, AddressFields>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Profile could not be updated.");
      setMessage("Profile updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Profile could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/account/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newAddress, isDefault: addresses.length === 0 }),
      });
      const result = await response.json() as Address & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Address could not be saved.");
      setAddresses((current) => [result, ...current.map((item) => ({ ...item, isDefault: result.isDefault ? false : item.isDefault }))]);
      setNewAddress(emptyAddress);
      setMessage("Address saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Address could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAddress(address: Address) {
    const changes = edited[address.id];
    if (!changes) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/account/addresses/${address.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const result = await response.json() as Address & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Address could not be updated.");
      setAddresses((current) => current.map((item) => item.id === address.id ? result : result.isDefault ? { ...item, isDefault: false } : item));
      setEdited((current) => { const next = { ...current }; delete next[address.id]; return next; });
      setMessage("Address updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Address could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAddress(address: Address) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/account/addresses/${address.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Address could not be deleted.");
      const updated = await fetch("/api/account/addresses", { cache: "no-store" }).then((result) => result.json() as Promise<Address[]>);
      setAddresses(updated);
      setMessage("Address removed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Address could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  function addressField(addressId: string, field: keyof AddressFields, value: string) {
    setEdited((current) => ({
      ...current,
      [addressId]: {
        ...addresses.find((address) => address.id === addressId),
        ...current[addressId],
        [field]: value,
      } as AddressFields,
    }));
  }

  return (
    <div className="space-y-10">
      {(error || message) && <p className={`text-sm ${error ? "text-red-800" : "text-emerald-800"}`} role={error ? "alert" : "status"}>{error || message}</p>}
      <form className="grid gap-4 border-b border-stone-200 pb-8 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={saveProfile}>
        <h2 className="font-serif text-2xl sm:col-span-3">Profile</h2>
        <label className="text-sm" htmlFor="accountName">Name<input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" id="accountName" maxLength={120} onChange={(event) => setName(event.target.value)} required value={name} /></label>
        <label className="text-sm" htmlFor="accountPhone">Phone<input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" id="accountPhone" onChange={(event) => setPhone(event.target.value)} pattern="(\+91[- ]?)?[6-9][0-9]{9}" required value={phone} /></label>
        <button className="min-h-11 border border-stone-300 px-4 text-sm font-medium hover:border-[var(--accent)] disabled:opacity-50" disabled={busy} type="submit">Save profile</button>
      </form>

      <section>
        <h2 className="font-serif text-2xl">Saved addresses</h2>
        {addresses.length === 0 ? <p className="mt-3 text-sm text-[var(--muted)]">No saved delivery addresses yet.</p> : (
          <ul className="mt-4 divide-y divide-stone-200">
            {addresses.map((address) => {
              const values = { ...address, ...edited[address.id] };
              return (
                <li className="py-5" key={address.id}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["fullName", "phone", "line1", "line2", "landmark", "city", "state", "pinCode"] as const).map((field) => (
                      <label className={`text-sm ${field === "line1" || field === "line2" ? "sm:col-span-2" : ""}`} htmlFor={`${field}-${address.id}`} key={field}>
                        {{ fullName: "Full name", phone: "Phone", line1: "Address line 1", line2: "Address line 2", landmark: "Landmark", city: "City", state: "State", pinCode: "PIN code" }[field]}
                        <input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" id={`${field}-${address.id}`} maxLength={field === "pinCode" ? 6 : 240} onChange={(event) => addressField(address.id, field, event.target.value)} value={values[field] ?? ""} />
                      </label>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm"><input checked={Boolean(values.isDefault)} onChange={(event) => setEdited((current) => ({ ...current, [address.id]: { ...values, isDefault: event.target.checked } }))} type="checkbox" />Default address</label>
                    <div className="flex gap-2">
                      <button className="border border-stone-300 px-3 py-2 text-sm disabled:opacity-50" disabled={busy || !edited[address.id]} onClick={() => void saveAddress(address)} type="button">Save</button>
                      <button className="border border-stone-300 px-3 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={() => void deleteAddress(address)} type="button">Remove</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <form className="grid gap-3 border-t border-stone-200 pt-7 sm:grid-cols-2" onSubmit={addAddress}>
        <h2 className="font-serif text-2xl sm:col-span-2">Add an address</h2>
        {(["fullName", "phone", "line1", "line2", "landmark", "city", "state", "pinCode"] as const).map((field) => (
          <label className={`text-sm ${field === "line1" || field === "line2" ? "sm:col-span-2" : ""}`} htmlFor={`new-${field}`} key={field}>
            {{ fullName: "Full name", phone: "Phone", line1: "Address line 1", line2: "Address line 2 (optional)", landmark: "Landmark (optional)", city: "City", state: "State", pinCode: "Six-digit PIN code" }[field]}
            <input className="mt-1 block min-h-11 w-full border border-stone-300 bg-white px-3" id={`new-${field}`} maxLength={field === "pinCode" ? 6 : 240} onChange={(event) => setNewAddress((current) => ({ ...current, [field]: event.target.value }))} pattern={field === "pinCode" ? "[1-9][0-9]{5}" : field === "phone" ? "(\+91[- ]?)?[6-9][0-9]{9}" : undefined} required={field !== "line2" && field !== "landmark"} value={newAddress[field]} />
          </label>
        ))}
        <button className="min-h-11 w-fit bg-[var(--accent)] px-5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} type="submit">Save address</button>
      </form>
    </div>
  );
}