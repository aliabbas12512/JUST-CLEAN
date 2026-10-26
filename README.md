# Just Clean — Laundry Pickup & Delivery Marketplace (Saudi Arabia)

**«غسيلك أقرب إليك، والاستلام والتوصيل علينا»**

A mobile-first, Arabic-first (Arabic + Urdu, full RTL) marketplace where customers order from nearby laundries,
laundries manage their menu and orders and pay a monthly platform subscription (SAR 100 per location by default),
riders handle two-leg pickup and delivery, and the platform owner runs everything from an admin dashboard.

| Role | Entry point | What it does |
|---|---|---|
| Customer | `/` | Nearby discovery (GPS or city), menus with each laundry's own prices, cart, checkout (4 fulfillment methods), live order tracking, handover codes, price-adjustment approval, reviews, monthly packages, support |
| Laundry partner | `/partner` | Registration and document upload, review status, orders (accept/reject, process, hand over, collect-at-shop with code), services and pricing, packages, subscription and billing history, reviews, reports and CSV export, multi-branch |
| Rider | `/rider` | Application, online/offline, open jobs in their city (area only until claimed), code-verified pickup and delivery, failed-job reasons, history and recorded fees |
| Admin | `/admin` | Metrics, laundry and rider approval, document review, orders (lookup, reassign, cancel, refunds), payment confirmation, subscriptions, revenue reports, reviews moderation, promo codes, support and disputes, cities and districts, platform settings, audit log |

---

## Architecture

- **Next.js 16** (App Router, Server Components and Server Actions), **TypeScript strict**, **Tailwind CSS v4**
- **Supabase**: Postgres, Auth (phone OTP, with email OTP as a fallback), Row Level Security, Realtime and Storage
- **Zod** validation in every server action. **No client-side trust** for prices, statuses or money.

All money and custody transitions run as `SECURITY DEFINER` Postgres functions that check the caller themselves
(`supabase/migrations/20261026000003_order_engine.sql`). The UI cannot set a price, change an order status, or confirm
a payment by writing to a table directly. Row Level Security makes sure each laundry sees only its own orders, and
each rider sees customer contact details only while a job assigned to them is live.

Key rules enforced in the database:

| Rule | Where |
|---|---|
| Order totals are computed on the server from the laundry's current prices. Client-supplied prices are ignored. | `quote_order()` and `place_order()` |
| No duplicate orders: each checkout sends a `client_token`, and a retry returns the original order | unique index `orders_idempotency` |
| No double charging: at most one confirmed payment per order | unique index `payments_one_confirmed_per_order` |
| Collision-safe order numbers `JC-2026-000123` (the prefix is configurable) | Postgres sequence |
| Handover needs a 4-digit code. Only the customer can read it. Five wrong attempts lock the code. | `order_secrets`, `rider_confirm_*`, `partner_advance_order` |
| Each fulfillment method has its own status path; the UI timeline follows it | `_needs_pickup` / `_needs_return`, `src/lib/orders.ts` |
| Per-kg and "quote" items are estimates. The laundry sets a final price, and the customer approves or disputes it before payment. | `partner_adjust_price`, `respond_price_adjustment` |
| Only approved, active laundries with an active subscription (or within the grace period) appear in search and can take orders. Existing orders are kept. | `laundry_can_receive_orders()` |
| A subscription is never active without a confirmed payment | `_confirm_payment()` |
| Package credits are locked during checkout. Pieces beyond the remaining credits are charged at the normal price (the explicit overage flow). Credits are restored if the order is cancelled. | `quote_order`, `_release_package` |
| An order that is not accepted in time is cancelled automatically. The customer is notified and a refund record is opened if the order was paid. | `run_maintenance()` |
| Sensitive tables are audit-logged, including admin actions | `audit_row()` trigger |

## Local development

Prerequisites: Node.js 20.9 or later, and Docker for the local Supabase stack.

```bash
npm install
npm run db:start                     # local Supabase; applies supabase/migrations + seed.sql
cp .env.example .env.local           # then fill in the URL and keys printed by db:start
npm run dev
```

The local stack has test phone numbers. Sign in with `0500000001`, `0500000002`, `0500000003` or `0500000004` and the
code `123456` (see `[auth.sms.test_otp]` in `supabase/config.toml`). The local stack needs
`SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN` set to any dummy value. Test numbers never reach Twilio.

Make yourself an admin:

```sql
update public.profiles set is_admin = true where phone = '966500000001';
```

### Tests

```bash
npm run lint && npm run typecheck
npm run test:db     # plain Postgres: schema + RLS + full order lifecycle, packages, promos, refunds, timeouts
npm run test:e2e    # real browser (Playwright) against the local stack + `npm run build && npm start`
```

`test:e2e` covers this whole flow: partner registers, adds prices, admin approves and records the SAR 100 subscription,
customer finds the laundry by GPS and orders, partner accepts, rider applies and is approved, goes online and claims
the job, a wrong pickup code is rejected and the right one accepted, laundry processes the order, return leg,
delivery code, cash payment, completion and a 5★ review. It then smoke-tests all 41 pages for all four roles and
checks access control. Screenshots are saved to `e2e/screenshots/`. **The test truncates the local database.** It
refuses to run against anything that is not localhost.

## Production setup (Supabase + Vercel)

1. **Create a Supabase project** for this app. Do not reuse another app's project. Pick the closest region available.
2. **Apply the schema**:
   `npx supabase@2.122.0 link --project-ref <ref> && npx supabase@2.122.0 db push`, then run `supabase/seed.sql`
   once in the SQL editor (it adds cities and service categories only, never fake laundries).
3. **Auth**:
   - Phone provider: enable it and connect an SMS provider (Twilio, MessageBird, Vonage or Textlocal). Check with the
     provider what Saudi sender-ID registration they require.
   - Email OTP fallback: edit the "Magic Link" email template to include `{{ .Token }}` so users get a code.
   - URL configuration: Site URL = your domain; Redirect URLs = `https://<domain>/auth/callback`.
4. **Scheduler**: enable the `pg_cron` extension and run:
   `select cron.schedule('just-clean-maintenance', '*/5 * * * *', 'select public.run_maintenance()');`
   This handles order-acceptance timeouts, subscription expiry and grace periods, reminders and auto-completion. The
   Vercel cron in `vercel.json` runs once a day as a fallback, because Hobby plans only allow daily crons.
5. **Vercel environment variables**:

   | Variable | Required | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | anon or publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | yes | server only: cron and payment callbacks |
   | `NEXT_PUBLIC_SITE_URL` | yes | e.g. `https://justclean.sa` |
   | `CRON_SECRET` | yes | random string; Vercel Cron sends it as a Bearer token |
   | `MOYASAR_SECRET_KEY` | optional | turns on online subscription payments |
   | `NEXT_PUBLIC_BRAND_NAME_AR/UR/EN` | optional | rebranding without code changes |

6. **First admin**: sign in once, then run the `update public.profiles set is_admin = true …` statement above.
7. **Admin → Settings**: fill in the bank-transfer instructions that laundries see when they renew, the support
   phone and WhatsApp, and review the subscription price, trial days, grace days and acceptance timeout.

## Commercial model (configurable in Admin → Settings)

- Partner subscription: **SAR 100 per month per laundry location** by default. Price, billing cycle, trial days and
  grace days are editable. Registration and review are **free**; the subscription starts after approval (or a trial,
  if trial days > 0).
- Payment: bank transfer (the partner submits a reference, admin confirms it, an invoice number is issued and the
  period is extended). Moyasar hosted invoices are used when `MOYASAR_SECRET_KEY` is set. Every payment state is
  re-fetched from the Moyasar API before anything is confirmed.
- Order commission: **off** by default. When enabled, it is recorded on completed orders.
- Reports keep subscription revenue, commissions, gross order value (laundry money, not platform profit), refunds
  and rider payouts separate.
- Prices are treated as **VAT-inclusive**. If a laundry is VAT-registered, the VAT portion is shown.

## Not built yet, or needs external setup

The app does not claim any of the following:

- **Native iOS and Android apps** are not built. The web app is a mobile-first, installable **PWA**.
- **Live GPS tracking of riders** is not implemented. A rider's location is only captured when they go online, to sort
  nearby jobs. Navigation opens Google Maps links. There is no embedded map picker, because that needs a Maps API key;
  partners set their location from device GPS or by entering coordinates.
- **Online payment for customer orders and packages** is not implemented. Customers pay the laundry in cash, by card
  terminal or by transfer, and the partner records it. Online payment exists only for partner subscriptions (Moyasar),
  and that integration **has not been tested against a live Moyasar account**.
- **Automatic recurring billing** is not implemented. Renewal is manual and reminders are sent in the app.
- **SMS, WhatsApp and push notifications** are not sent. Notifications are in-app and realtime. The SMS preference is
  stored for future use. Notification texts live in the i18n dictionaries; there is no admin template editor.
- **ZATCA e-invoicing (Fatoora)** is not implemented. Invoice numbers are internal receipts, not ZATCA-compliant tax
  invoices. Check this with a Saudi tax advisor before charging VAT.
- **Settlements and payouts** to laundries and riders are recorded only. No money moves automatically.
- When an order is rejected or times out it is **cancelled, not reassigned** to another laundry.
- **Legal pages** (`/legal/terms`, `/legal/privacy`) are drafts and must be reviewed by counsel.
- **Districts** are not seeded. Add them in Admin → Cities and districts. Customers can also type a district.

## Project layout

```
supabase/migrations/   schema, RLS, order engine, storage/realtime/cron, read helpers
supabase/tests/        plain-Postgres scenario tests (scripts/test-db.sh)
src/app/(customer)/    customer marketplace
src/app/partner/       laundry portal
src/app/rider/         rider portal
src/app/admin/         admin dashboard
src/app/actions/       server actions (Zod-validated; they call the RPCs)
src/app/api/           cron, CSV export, Moyasar payment routes
src/lib/i18n/          ar.ts (source of keys) and ur.ts (type-checked against it)
e2e/full-flow.mjs      browser walkthrough of the full marketplace
```
