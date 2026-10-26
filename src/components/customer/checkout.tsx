"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { placeOrder, quoteOrder, type Quote } from "@/app/actions/customer";
import type { AddressRow } from "@/app/(customer)/checkout/[id]/page";
import { Icon } from "@/components/ui/icon";
import { Alert, Button, Card, CardHeader, Checkbox, EmptyState, Field, Input, KV, LinkButton, Select, Textarea } from "@/components/ui/primitives";
import { money } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n/shared";
import { displayPhone, normalizeSaudiPhone } from "@/lib/phone";
import { availableSlots, slotIso, upcomingDays } from "@/lib/slots";
import type { City, CustomerPackage, Fulfillment, Service } from "@/lib/types";
import { useCart } from "./cart";
import { stepFor } from "./menu-item";

type LaundryLite = {
  id: string; name: string; city_id: number; address: string;
  supports_pickup: boolean; supports_delivery: boolean; supports_dropoff: boolean;
};

const METHODS: Fulfillment[] = ["pickup_delivery", "pickup_only", "delivery_only", "dropoff"];

function supported(l: LaundryLite, m: Fulfillment) {
  if (m === "pickup_delivery") return l.supports_pickup && l.supports_delivery;
  if (m === "pickup_only") return l.supports_pickup;
  if (m === "delivery_only") return l.supports_delivery;
  return l.supports_dropoff;
}

export function Checkout({ laundry, services, cities, addresses, packages, profile }:
  { laundry: LaundryLite; services: Service[]; cities: City[]; addresses: AddressRow[]; packages: CustomerPackage[]; profile: { name: string; phone: string } }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { cart, ready, setQty, setInstructions, clear } = useCart();
  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

  const [method, setMethod] = useState<Fulfillment>(() => METHODS.find((m) => supported(laundry, m)) ?? "dropoff");
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(displayPhone(profile.phone));
  const [addressId, setAddressId] = useState<string>(addresses[0]?.id ?? "new");
  const [cityId, setCityId] = useState<number>(laundry.city_id);
  const [district, setDistrict] = useState("");
  const [line, setLine] = useState("");
  const [addrNotes, setAddrNotes] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [saveAddress, setSaveAddress] = useState(addresses.length === 0);
  const days = useMemo(() => upcomingDays(7).filter((d) => availableSlots(d).length > 0), []);
  const [day, setDay] = useState<string>("");
  const [slot, setSlot] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState("");
  const [pkgId, setPkgId] = useState<string>("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placing, startPlacing] = useTransition();
  // One token per checkout visit: double taps and retries cannot create duplicate orders.
  const [clientToken] = useState(() => crypto.randomUUID());

  const lines = useMemo(() => {
    if (cart.laundryId !== laundry.id) return [];
    return Object.entries(cart.items)
      .filter(([sid]) => byId.has(sid))
      .map(([sid, v]) => ({ service_id: sid, quantity: v.qty, instructions: v.instructions || undefined }));
  }, [cart, laundry.id, byId]);

  const itemsKey = JSON.stringify(lines.map((l) => [l.service_id, l.quantity]));
  useEffect(() => {
    if (lines.length === 0) { setQuote(null); return; }
    let cancelled = false;
    setQuoting(true);
    const h = setTimeout(async () => {
      const r = await quoteOrder({ laundryId: laundry.id, fulfillment: method, items: lines, promo, customerPackageId: pkgId || null });
      if (cancelled) return;
      setQuoting(false);
      if (r.ok && r.data) setQuote(r.data);
      else setError(r.ok ? null : r.error);
    }, 250);
    return () => { cancelled = true; clearTimeout(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, method, promo, pkgId, laundry.id]);

  const needsAddress = method !== "dropoff";
  const err = (k: string | null) => (k ? ((t.errors as Record<string, string>)[k] ?? t.errors.generic) : null);

  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setPin({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }),
      () => setError("validation"),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const submit = () => {
    setError(null);
    const normalized = normalizeSaudiPhone(phone);
    if (!normalized || name.trim().length < 2) return setError("contact_invalid");
    let address: Record<string, unknown> = {};
    if (needsAddress) {
      if (addressId !== "new") {
        const a = addresses.find((x) => x.id === addressId);
        if (!a) return setError("address_required");
        address = { city_id: a.city_id, district_text: a.district_text ?? undefined, line: a.line, lat: a.lat ?? undefined, lng: a.lng ?? undefined, notes: a.notes ?? undefined };
      } else {
        if (line.trim().length < 3) return setError("address_required");
        address = { city_id: cityId, district_text: district || undefined, line, notes: addrNotes || undefined, lat: pin?.lat, lng: pin?.lng };
      }
    }
    const win = day && slot ? { windowStart: slotIso(day, slot.split("|")[0]), windowEnd: slotIso(day, slot.split("|")[1]) } : { windowStart: null, windowEnd: null };
    startPlacing(async () => {
      const r = await placeOrder({
        clientToken, laundryId: laundry.id, fulfillment: method, items: lines,
        contact: { name: name.trim(), phone: normalized }, address,
        saveAddress: needsAddress && addressId === "new" && saveAddress,
        ...win, notes: notes || undefined, promo: promo || undefined, customerPackageId: pkgId || null,
      });
      if (r.ok && r.data) {
        clear();
        router.push(`/orders/${r.data.id}?placed=1`);
      } else if (!r.ok) {
        setError(r.error);
      }
    });
  };

  if (!ready) return <div className="skeleton h-64 rounded-2xl" />;
  if (lines.length === 0) {
    return <EmptyState icon="shirt" title={t.cart.empty} action={<LinkButton href={`/laundry/${laundry.id}`}>{t.laundry.viewServices}</LinkButton>} />;
  }

  const total = quote?.total ?? 0;
  const blocking = quote?.errors ?? [];

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {/* Cart */}
        <Card>
          <CardHeader title={t.cart.title} />
          <ul className="divide-y divide-[var(--line)] px-4">
            {lines.map((li) => {
              const s = byId.get(li.service_id)!;
              const step = stepFor(s.pricing_model);
              return (
                <li key={li.service_id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-brand-950">{locale === "ur" && s.name_ur ? s.name_ur : s.name_ar}</p>
                      <p className="text-sm text-[var(--muted)]">
                        {s.pricing_model === "quote" ? t.laundry.quote : <><span className="font-num">{money(s.price, locale)}</span> {t.pricing[s.pricing_model]}</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 rounded-xl ring-1 ring-[var(--line)]">
                      <button type="button" className="p-2" aria-label="-" onClick={() => setQty(laundry.id, s.id, li.quantity - step, () => true)}><Icon name={li.quantity - step <= 0 ? "trash" : "minus"} className="size-4" /></button>
                      <span className="font-num min-w-8 text-center text-sm font-bold">{li.quantity}</span>
                      <button type="button" className="p-2" aria-label="+" onClick={() => setQty(laundry.id, s.id, li.quantity + step, () => true)}><Icon name="plus" className="size-4" /></button>
                    </div>
                  </div>
                  <input
                    defaultValue={cart.items[s.id]?.instructions ?? ""}
                    onBlur={(e) => setInstructions(s.id, e.target.value)}
                    placeholder={t.cart.instructions}
                    maxLength={300}
                    className="mt-2 w-full rounded-lg bg-slate-50 px-3 py-1.5 text-sm ring-1 ring-inset ring-transparent focus:ring-brand-300"
                  />
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Fulfillment */}
        <Card>
          <CardHeader title={t.checkout.fulfillment} />
          <div className="grid gap-2 p-4 sm:grid-cols-2">
            {METHODS.map((m) => {
              const ok = supported(laundry, m);
              return (
                <label key={m} className={`flex cursor-pointer gap-3 rounded-xl p-3 ring-1 ${method === m ? "bg-brand-50 ring-2 ring-brand-600" : "ring-[var(--line)]"} ${ok ? "" : "cursor-not-allowed opacity-50"}`}>
                  <input type="radio" name="method" className="mt-1 accent-brand-700" checked={method === m} disabled={!ok} onChange={() => setMethod(m)} />
                  <span>
                    <span className="block font-bold text-brand-950">{t.checkout.methods[m].title}</span>
                    <span className="block text-sm text-[var(--muted)]">{ok ? t.checkout.methods[m].body : t.checkout.unsupported}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </Card>

        {/* Contact & address */}
        <Card>
          <CardHeader title={t.checkout.contact} />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label={t.common.name}><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></Field>
            <Field label={t.common.phone}><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" dir="ltr" placeholder="05XXXXXXXX" autoComplete="tel" required /></Field>
          </div>
          {needsAddress && (
            <div className="space-y-3 border-t border-[var(--line)] p-4">
              <p className="font-bold text-brand-950">{t.checkout.address}</p>
              {addresses.length > 0 && (
                <Select value={addressId} onChange={(e) => setAddressId(e.target.value)} aria-label={t.checkout.savedAddresses}>
                  {addresses.map((a) => <option key={a.id} value={a.id}>{(t.account.labels as Record<string, string>)[a.label] ?? a.label} — {a.line}</option>)}
                  <option value="new">+ {t.checkout.newAddress}</option>
                </Select>
              )}
              {addressId === "new" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t.common.city}>
                    <Select value={cityId} onChange={(e) => setCityId(Number(e.target.value))}>
                      {cities.map((c) => <option key={c.id} value={c.id}>{locale === "ur" ? c.name_ur : c.name_ar}</option>)}
                    </Select>
                  </Field>
                  <Field label={t.common.district}><Input value={district} onChange={(e) => setDistrict(e.target.value)} maxLength={120} /></Field>
                  <Field label={t.checkout.addressLine} className="sm:col-span-2"><Input value={line} onChange={(e) => setLine(e.target.value)} maxLength={500} required /></Field>
                  <Field label={t.checkout.addressNotes} className="sm:col-span-2"><Input value={addrNotes} onChange={(e) => setAddrNotes(e.target.value)} maxLength={500} /></Field>
                  <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                    <Button type="button" variant="secondary" size="sm" icon="locate" onClick={locate}>{t.checkout.pinLocation}</Button>
                    {pin && <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><Icon name="check" className="size-4" />{t.checkout.pinned}</span>}
                  </div>
                  <div className="sm:col-span-2"><Checkbox label={t.checkout.saveAddress} checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} /></div>
                </div>
              )}
            </div>
          )}
          <div className="grid gap-3 border-t border-[var(--line)] p-4 sm:grid-cols-2">
            <p className="font-bold text-brand-950 sm:col-span-2">{method === "dropoff" || method === "delivery_only" ? t.checkout.timeWindowDropoff : t.checkout.timeWindow}</p>
            <Field label={t.checkout.day}>
              <Select value={day} onChange={(e) => { setDay(e.target.value); setSlot(""); }}>
                <option value="">{t.checkout.asap}</option>
                {days.map((d, i) => (
                  <option key={d} value={d}>{i === 0 && d === upcomingDays(1)[0] ? t.checkout.today : new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "ur-PK", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d))}</option>
                ))}
              </Select>
            </Field>
            <Field label={t.checkout.slot}>
              <Select value={slot} onChange={(e) => setSlot(e.target.value)} disabled={!day}>
                <option value="">—</option>
                {day && availableSlots(day).map(([a, b]) => <option key={a} value={`${a}|${b}`}>{a} – {b}</option>)}
              </Select>
            </Field>
            <Field label={t.checkout.orderNotes} className="sm:col-span-2"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></Field>
          </div>
        </Card>
      </div>

      {/* Summary */}
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader title={t.checkout.summary} />
          <div className="space-y-3 p-4">
            {packages.length > 0 && (
              <Field label={t.checkout.usePackage}>
                <Select value={pkgId} onChange={(e) => setPkgId(e.target.value)}>
                  <option value="">{t.checkout.noPackage}</option>
                  {packages.map((p) => <option key={p.id} value={p.id}>{fmt(t.checkout.packageRemaining, { n: p.piece_credits - p.pieces_used })}</option>)}
                </Select>
              </Field>
            )}
            <div className="flex gap-2">
              <Input value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} placeholder={t.checkout.promo} dir="ltr" maxLength={20} />
              <Button type="button" variant="secondary" onClick={() => setPromo(promoInput.trim())}>{t.checkout.applyPromo}</Button>
            </div>
            <div className="divide-y divide-[var(--line)]">
              <div className="pb-2">
                <KV k={t.checkout.subtotal} v={<span className="font-num">{money(quote?.subtotal, locale)}</span>} />
                {!!quote?.package_credit && <KV k={fmt(t.checkout.packageCredit, { n: quote.package_pieces })} v={<span className="font-num text-emerald-700">−{money(quote.package_credit, locale)}</span>} />}
                {(method === "pickup_delivery" || method === "pickup_only") && <KV k={t.checkout.pickupFee} v={<span className="font-num">{quote?.pickup_fee ? money(quote.pickup_fee, locale) : t.laundry.free}</span>} />}
                {(method === "pickup_delivery" || method === "delivery_only") && <KV k={t.checkout.deliveryFee} v={<span className="font-num">{quote?.delivery_fee ? money(quote.delivery_fee, locale) : t.laundry.free}</span>} />}
                {!!quote?.discount && <KV k={t.checkout.discount} v={<span className="font-num text-emerald-700">−{money(quote.discount, locale)}</span>} />}
              </div>
              <div className="pt-2">
                <div className="flex items-center justify-between text-lg font-extrabold text-brand-950">
                  <span>{quote?.is_estimate ? t.checkout.estimatedTotal : t.checkout.total}</span>
                  <span className="font-num">{quoting && !quote ? "…" : money(total, locale)}</span>
                </div>
                {!!quote?.vat_included && <p className="text-xs text-[var(--muted)]">{t.checkout.vatIncluded}: <span className="font-num">{money(quote.vat_included, locale)}</span></p>}
              </div>
            </div>
            {quote?.is_estimate && <Alert tone="amber">{t.checkout.estimateNote}</Alert>}
            {blocking.map((e) => (
              <Alert key={e} tone="red">{e === "below_min_order" ? fmt(t.checkout.belowMin, { amount: money(quote?.min_order, locale) }) : err(e)}</Alert>
            ))}
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <p className="font-bold text-brand-950">{t.checkout.payment}</p>
              <p className="mt-0.5 font-semibold">{t.checkout.payCash}</p>
              <p className="text-[var(--muted)]">{t.checkout.payCashBody}</p>
              <p className="mt-1 text-xs text-slate-400">{t.checkout.payOnlineUnavailable}</p>
            </div>
            {error && !blocking.includes(error) && <Alert tone="red">{err(error)}</Alert>}
            <Button type="button" size="lg" className="w-full" disabled={placing || quoting || !quote || blocking.length > 0} onClick={submit}>
              {placing ? t.checkout.placing : quoting ? t.checkout.calculating : `${t.checkout.placeOrder} · ${money(total, locale)}`}
            </Button>
          </div>
        </Card>
      </aside>
    </div>
  );
}
