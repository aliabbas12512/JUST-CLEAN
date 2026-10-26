// End-to-end walkthrough of the whole marketplace in a real browser.
// Prereqs: `npx supabase start` (local stack with test OTPs from supabase/config.toml),
// the app running on BASE_URL against it, and Playwright available.
//   node e2e/full-flow.mjs
import { createRequire } from "node:module";
// CommonJS require so a globally installed Playwright (NODE_PATH) also resolves.
const { chromium } = createRequire(import.meta.url)("playwright");
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? "e2e/screenshots";
const DB = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
mkdirSync(SHOTS, { recursive: true });

const PHONES = { admin: "500000001", partner: "500000002", rider: "500000003", customer: "500000004" };
const KHOBAR = { latitude: 26.2172, longitude: 50.1971 };

const sql = (q) => execSync(`psql "${DB}" -tAq -v ON_ERROR_STOP=1`, { input: q }).toString().trim();
const step = (msg) => console.log(`\n▶ ${msg}`);

const browser = await chromium.launch();
const ctxFor = async (opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ar-SA", geolocation: KHOBAR, permissions: ["geolocation"], ...opts });
  // Confirm dialogs ("are you sure?") are accepted automatically.
  ctx.on("page", (p) => p.on("dialog", (d) => d.accept()));
  return ctx;
};

async function login(page, phone, next = "/") {
  await page.goto(`${BASE}/login?next=${encodeURIComponent(next)}`);
  await page.fill('input[autocomplete="tel-national"]', phone);
  await page.click('button[type="submit"]');
  await page.fill('input[autocomplete="one-time-code"]', "123456");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
}

async function submitAndWait(page, locator) {
  await locator.click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
}

async function expectNoAlert(page, label) {
  const err = page.locator('[data-tone="red"]');
  if (await err.count()) throw new Error(`${label}: ${await err.first().innerText()}`);
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

if (!/127\.0\.0\.1|localhost/.test(DB)) throw new Error("Refusing to reset a non-local database");
// Fresh state for every run (local stack only). Reference data (cities, categories, settings) is kept.
sql(`truncate public.order_events, public.order_items, public.order_secrets, public.delivery_jobs, public.refunds, public.payments,
  public.reviews, public.orders, public.customer_packages, public.packages, public.services, public.laundry_categories,
  public.laundry_documents, public.partner_subscriptions, public.laundries, public.riders, public.notifications,
  public.ticket_messages, public.support_tickets, public.addresses, public.favorites, public.audit_logs cascade;
  delete from auth.users;`);

try {
  // ---------------------------------------------------------------- customer: public browsing
  step("Guest home page (Arabic, no location yet)");
  const guest = await (await ctxFor()).newPage();
  await guest.goto(BASE);
  await shot(guest, "01-home-ar");

  // ---------------------------------------------------------------- admin bootstrap
  step("Admin signs in and is promoted via SQL (documented bootstrap)");
  const adminCtx = await ctxFor({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const admin = await adminCtx.newPage();
  await login(admin, PHONES.admin);
  sql(`update public.profiles set is_admin = true, full_name = 'Platform Admin' where phone = '966${PHONES.admin}'`);

  // ---------------------------------------------------------------- partner registers
  step("Partner registers a laundry");
  const partnerCtx = await ctxFor();
  const partner = await partnerCtx.newPage();
  await login(partner, PHONES.partner, "/partner/register");
  await partner.waitForURL("**/partner/register");
  await partner.fill('input[name="representative_name"]', "أبو محمد");
  await partner.fill('input[name="phone"]', "0500000002");
  await partner.fill('input[name="name"]', "مغسلة النخبة");
  await partner.fill('input[name="cr_number"]', "2051234567");
  await partner.selectOption('select[name="city_id"]', { label: "الخبر" });
  await partner.fill('input[name="district_text"]', "العقربية");
  await partner.fill('input[name="address"]', "شارع الملك فهد، مبنى 12");
  await partner.click("text=استخدم موقعي الحالي");
  await partner.waitForFunction(() => document.querySelector('input[name="lat"]')?.value !== "");
  await partner.fill('input[name="pickup_fee"]', "7");
  await partner.fill('input[name="delivery_fee"]', "8");
  await partner.locator('input[name="categories"]').first().check();
  await partner.check('input[name="accept_terms"]');
  await shot(partner, "02-partner-register");
  await submitAndWait(partner, partner.locator('button[name="intent"][value="submit"]'));
  await partner.waitForURL(`${BASE}/partner`, { timeout: 15000 });
  await shot(partner, "03-partner-dashboard-submitted");
  const laundryId = sql(`select id from public.laundries where name = 'مغسلة النخبة'`);
  console.log("  laundry", laundryId, "status", sql(`select status from public.laundries where id = '${laundryId}'`));

  step("Partner adds services with their own prices");
  await partner.goto(`${BASE}/partner/services`);
  const addService = async (name, model, price) => {
    const form = partner.locator("form").filter({ has: partner.locator('input[name="name_ar"]') }).first();
    await form.locator('input[name="name_ar"]').fill(name);
    await form.locator('select[name="pricing_model"]').selectOption(model);
    if (price !== null) await form.locator('input[name="price"]').fill(String(price));
    await submitAndWait(partner, form.locator('button[type="submit"]'));
    await expectNoAlert(partner, `add service ${name}`);
  };
  await addService("غسيل وكي ثوب", "per_piece", 6);
  await addService("غسيل بالكيلو", "per_kg", 12);
  await addService("تنظيف ستائر", "quote", null);
  console.log("  services:", sql(`select count(*) from public.services where laundry_id = '${laundryId}'`));
  await shot(partner, "04-partner-services");

  // ---------------------------------------------------------------- admin approves + records subscription
  step("Admin approves laundry and records the SAR 100 subscription payment");
  await admin.goto(`${BASE}/admin/laundries/${laundryId}`);
  await submitAndWait(admin, admin.locator('form:has(textarea[name="notes"]) button[type="submit"]'));
  await expectNoAlert(admin, "approve laundry");
  console.log("  laundry status:", sql(`select status from public.laundries where id = '${laundryId}'`));
  await admin.fill('input[name="reference"]', "TRX-778899");
  await submitAndWait(admin, admin.locator('form:has(input[name="reference"]) button[type="submit"]'));
  console.log("  subscription:", sql(`select status || ' until ' || current_period_end::date from public.partner_subscriptions where laundry_id = '${laundryId}'`));
  await shot(admin, "05-admin-laundry-approved");

  // ---------------------------------------------------------------- customer orders
  step("Customer finds the laundry nearby and orders");
  const customerCtx = await ctxFor();
  const customer = await customerCtx.newPage();
  await login(customer, PHONES.customer, "/");
  await customer.goto(BASE);
  await customer.click("text=استخدم موقعي الحالي");
  await customer.waitForURL(/lat=/);
  await customer.waitForSelector("text=مغسلة النخبة");
  await shot(customer, "06-customer-nearby");
  await customer.click("text=مغسلة النخبة");
  await customer.waitForURL(`**/laundry/${laundryId}`);
  const addBtn = customer.locator("button:has-text('إضافة')");
  await addBtn.first().click();
  await customer.locator('button[aria-label="+"]').first().click();
  await customer.locator('button[aria-label="+"]').first().click();
  await shot(customer, "07-customer-menu");
  await customer.click("text=متابعة الطلب");
  await customer.waitForURL(`**/checkout/${laundryId}`);
  await customer.fill('input[autocomplete="name"]', "سارة العتيبي");
  await customer.fill('input[maxlength="500"][required]', "حي الثقبة، شارع 5، فيلا 3");
  await customer.waitForSelector("button:has-text('تأكيد الطلب'):not([disabled])", { timeout: 15000 });
  await shot(customer, "08-customer-checkout");
  await customer.click("button:has-text('تأكيد الطلب')");
  await customer.waitForURL(/\/orders\/[0-9a-f-]{36}/, { timeout: 15000 });
  const orderId = customer.url().split("/orders/")[1].split("?")[0];
  console.log("  order", sql(`select order_number || ' total=' || total || ' status=' || status from public.orders where id = '${orderId}'`));
  await shot(customer, "09-customer-order-placed");
  const pickupCode = (await customer.locator("p.tracking-\\[0\\.3em\\]").first().innerText()).trim();
  console.log("  pickup code visible to customer:", pickupCode);

  // ---------------------------------------------------------------- partner accepts
  step("Partner accepts the order");
  await partner.goto(`${BASE}/partner/orders/${orderId}`);
  await submitAndWait(partner, partner.locator("button:has-text('قبول')").first());
  console.log("  status:", sql(`select status from public.orders where id = '${orderId}'`));

  // ---------------------------------------------------------------- rider joins, approved, picks up
  step("Rider applies; admin approves");
  const riderCtx = await ctxFor();
  const rider = await riderCtx.newPage();
  await login(rider, PHONES.rider, "/rider");
  await rider.waitForURL("**/rider");
  await rider.fill('input[name="full_name"]', "خالد المندوب");
  await rider.fill('input[name="phone"]', "0500000003");
  await rider.selectOption('select[name="city_id"]', { label: "الخبر" });
  await submitAndWait(rider, rider.locator('button[type="submit"]'));
  await rider.reload();
  await shot(rider, "10-rider-pending");
  await admin.goto(`${BASE}/admin/riders?status=pending`);
  await submitAndWait(admin, admin.locator('form:has(select[name="status"]) button[type="submit"]').first());
  console.log("  rider:", sql(`select status from public.riders where phone = '966${PHONES.rider}'`));

  step("Rider goes online, claims the pickup job and verifies the customer's code");
  await rider.goto(`${BASE}/rider`);
  await rider.click("text=ابدأ العمل");
  await rider.waitForSelector("text=قبول المهمة", { timeout: 15000 });
  await shot(rider, "11-rider-open-jobs");
  await rider.click("text=قبول المهمة");
  await rider.waitForURL(/\/rider\/jobs\//, { timeout: 15000 });
  await rider.fill('input[name="code"]', "0000");
  await submitAndWait(rider, rider.locator("button:has-text('تأكيد الاستلام')"));
  console.log("  wrong code rejected:", (await rider.locator('[data-tone="red"]').innerText()).trim());
  await rider.fill('input[name="code"]', pickupCode);
  await submitAndWait(rider, rider.locator("button:has-text('تأكيد الاستلام')"));
  await shot(rider, "12-rider-picked-up");
  console.log("  status:", sql(`select status from public.orders where id = '${orderId}'`));

  // ---------------------------------------------------------------- laundry processes
  step("Laundry receives, cleans and marks ready");
  await partner.goto(`${BASE}/partner/orders/${orderId}`);
  for (const label of ["استلمنا الملابس", "بدء التنظيف", "الطلب جاهز"]) {
    await submitAndWait(partner, partner.locator(`button:has-text('${label}')`));
    await expectNoAlert(partner, label);
  }
  console.log("  status:", sql(`select status from public.orders where id = '${orderId}'`));

  step("Rider claims return leg; laundry hands over; rider delivers with delivery code");
  await rider.goto(`${BASE}/rider`);
  await rider.click("text=قبول المهمة");
  await rider.waitForURL(/\/rider\/jobs\//);
  await partner.reload();
  await submitAndWait(partner, partner.locator("button:has-text('تم التسليم للمندوب')"));
  await customer.goto(`${BASE}/orders/${orderId}`);
  const deliveryCode = (await customer.locator("p.tracking-\\[0\\.3em\\]").first().innerText()).trim();
  await shot(customer, "13-customer-out-for-delivery");
  await rider.reload();
  await rider.fill('input[name="code"]', deliveryCode);
  await submitAndWait(rider, rider.locator("button:has-text('تأكيد التسليم')"));
  console.log("  status:", sql(`select status from public.orders where id = '${orderId}'`));

  step("Partner records cash payment; customer confirms and rates");
  await partner.reload();
  await submitAndWait(partner, partner.locator("button:has-text('تسجيل الدفع')"));
  await customer.reload();
  await submitAndWait(customer, customer.locator("button:has-text('استلمت طلبي')"));
  await customer.locator('label:has(input[name="rating"][value="5"])').click();
  await customer.fill('textarea[name="comment"]', "خدمة ممتازة وسريعة");
  await submitAndWait(customer, customer.locator('form:has(input[name="rating"]) button[type="submit"]'));
  await shot(customer, "14-customer-completed");
  console.log("  final:", sql(`select status || ' / ' || payment_status from public.orders where id = '${orderId}'`),
    "rating:", sql(`select rating_avg || ' (' || rating_count || ')' from public.laundries where id = '${laundryId}'`));

  // ---------------------------------------------------------------- Urdu + admin views
  step("Urdu RTL screenshots and admin overview");
  await customerCtx.addCookies([{ name: "lang", value: "ur", url: BASE }]);
  await customer.goto(`${BASE}/orders/${orderId}`);
  await shot(customer, "15-customer-order-ur");
  await customer.goto(`${BASE}/?lat=${KHOBAR.latitude}&lng=${KHOBAR.longitude}`);
  await shot(customer, "16-home-ur");
  await admin.goto(`${BASE}/admin`);
  await shot(admin, "17-admin-overview");
  await admin.goto(`${BASE}/admin/reports`);
  await shot(admin, "18-admin-reports");
  await partner.goto(`${BASE}/partner`);
  await shot(partner, "19-partner-dashboard");

  step("Smoke test: every page renders without a server error");
  const routes = {
    admin: ["/admin", "/admin/laundries?status=all", `/admin/laundries/${laundryId}`, "/admin/riders?status=all", "/admin/orders",
      `/admin/orders/${orderId}`, "/admin/payments", "/admin/subscriptions", "/admin/reports", "/admin/reviews", "/admin/promos",
      "/admin/support", "/admin/locations", "/admin/settings", "/admin/audit"],
    partner: ["/partner", "/partner/orders?tab=done", `/partner/orders/${orderId}`, "/partner/services", "/partner/packages",
      "/partner/subscription", "/partner/reviews", "/partner/reports", "/partner/settings", "/partner/register"],
    rider: ["/rider", "/rider/history"],
    customer: ["/", "/?city=2", `/laundry/${laundryId}`, "/orders", "/orders?tab=previous", "/packages", "/account", "/account/addresses",
      "/account/favorites", "/account/packages", "/notifications", "/support", "/legal/terms", "/legal/privacy"],
  };
  const pages = { admin, partner, rider, customer };
  for (const [who, list] of Object.entries(routes)) {
    for (const r of list) {
      const res = await pages[who].goto(`${BASE}${r}`);
      const body = await pages[who].locator("body").innerText();
      if (!res || res.status() >= 400 || /Application error|Internal Server Error/.test(body)) throw new Error(`${who} ${r} -> ${res?.status()}`);
    }
    console.log(`  ${who}: ${list.length} pages OK`);
  }
  const exp = await admin.request.get(`${BASE}/api/export/admin-orders`);
  console.log("  admin CSV export:", exp.status(), (await exp.text()).split("\n").length - 1, "rows");
  const denied = await customer.request.get(`${BASE}/api/export/admin-orders`);
  if (denied.status() !== 403) throw new Error("customer could export admin orders");
  await customer.goto(`${BASE}/admin`);
  if (new URL(customer.url()).pathname.startsWith("/admin")) throw new Error("customer reached /admin");
  console.log("  access control: customer blocked from admin pages and exports");

  console.log("\n✅ FULL FLOW PASSED");
} catch (e) {
  console.error("\n❌ FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
