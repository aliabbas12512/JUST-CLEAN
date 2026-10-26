"use client";
import { useCallback, useEffect, useState } from "react";

export type CartLine = { qty: number; instructions?: string };
export type Cart = { laundryId: string | null; items: Record<string, CartLine> };

const KEY = "jc_cart";
const EVENT = "jc-cart";
const empty: Cart = { laundryId: null, items: {} };

function read(): Cart {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Cart) : empty;
  } catch {
    return empty;
  }
}

function write(c: Cart) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** Cart persisted in localStorage; one laundry at a time (like food apps). */
export function useCart() {
  const [cart, setCart] = useState<Cart>(empty);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setCart(read());
    sync();
    setReady(true);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setQty = useCallback((laundryId: string, serviceId: string, qty: number, confirmSwitch: () => boolean) => {
    let c = read();
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
    const c = read();
    if (!c.items[serviceId]) return;
    write({ ...c, items: { ...c.items, [serviceId]: { ...c.items[serviceId], instructions: instructions.slice(0, 300) } } });
  }, []);

  const clear = useCallback(() => write(empty), []);

  const count = Object.keys(cart.items).length;
  return { cart, ready, count, setQty, setInstructions, clear };
}
