"use client";
import { useCallback, useSyncExternalStore } from "react";

export type CartLine = { qty: number; instructions?: string };
export type Cart = { laundryId: string | null; items: Record<string, CartLine> };

const KEY = "jc_cart";
const EVENT = "jc-cart";
const empty: Cart = { laundryId: null, items: {} };

// Snapshot cache: useSyncExternalStore needs a stable reference while the stored value is unchanged.
let cachedRaw: string | null | undefined;
let cached: Cart = empty;

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function snapshot(): Cart {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cached = raw ? (JSON.parse(raw) as Cart) : empty;
    } catch {
      cached = empty;
    }
  }
  return cached;
}

function write(c: Cart) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

const serverSnapshot = () => null;

/** Cart persisted in localStorage; one laundry at a time (like food apps). */
export function useCart() {
  const state = useSyncExternalStore<Cart | null>(subscribe, snapshot, serverSnapshot);
  const cart = state ?? empty;

  const setQty = useCallback((laundryId: string, serviceId: string, qty: number, confirmSwitch: () => boolean) => {
    let c = snapshot();
    if (c.laundryId && c.laundryId !== laundryId && Object.keys(c.items).length > 0) {
      if (!confirmSwitch()) return;
      c = { laundryId, items: {} };
    }
    const items = { ...c.items };
    if (qty <= 0) delete items[serviceId];
    else items[serviceId] = { ...items[serviceId], qty: Math.round(qty * 100) / 100 };
    write({ laundryId, items });
  }, []);

  const setInstructions = useCallback((serviceId: string, instructions: string) => {
    const c = snapshot();
    if (!c.items[serviceId]) return;
    write({ ...c, items: { ...c.items, [serviceId]: { ...c.items[serviceId], instructions: instructions.slice(0, 300) } } });
  }, []);

  const clear = useCallback(() => write(empty), []);

  return { cart, ready: state !== null, count: Object.keys(cart.items).length, setQty, setInstructions, clear };
}
