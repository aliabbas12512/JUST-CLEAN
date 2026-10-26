// Hand-written row types for the tables the UI reads. Keep in sync with supabase/migrations.
export type LaundryStatus = "draft" | "submitted" | "under_review" | "approved" | "rejected" | "info_required";
export type Fulfillment = "pickup_delivery" | "pickup_only" | "delivery_only" | "dropoff";
export type OrderStatus =
  | "placed" | "accepted" | "rejected" | "pickup_assigned" | "picked_up" | "received" | "processing"
  | "ready" | "return_assigned" | "out_for_delivery" | "delivered" | "completed" | "cancelled";
export type PaymentStatus = "unpaid" | "pending" | "paid" | "refunded" | "partially_refunded";
export type PaymentMethod = "cash" | "bank_transfer" | "online";
export type PricingModel = "per_piece" | "per_kg" | "bundle" | "fixed" | "quote";
export type JobLeg = "pickup" | "return";
export type JobStatus = "open" | "assigned" | "picked_up" | "delivered" | "failed" | "cancelled";
export type RiderStatus = "pending" | "active" | "suspended" | "rejected";
export type SubscriptionStatus = "pending" | "active" | "past_due" | "expired" | "suspended" | "cancelled";
export type CustomerPackageStatus = "pending_payment" | "active" | "exhausted" | "expired" | "cancelled";

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  locale: "ar" | "ur";
  is_admin: boolean;
  notify_sms: boolean;
  notify_push: boolean;
  notify_marketing: boolean;
  deletion_requested_at: string | null;
}

export interface City { id: number; slug: string; name_ar: string; name_ur: string; lat: number; lng: number; is_active: boolean; sort_order: number }
export interface District { id: number; city_id: number; name_ar: string; name_ur: string; is_active: boolean }
export interface Category { id: number; slug: string; name_ar: string; name_ur: string; icon: string | null; sort_order: number }

export interface Laundry {
  id: string;
  owner_id: string;
  name: string;
  name_en: string | null;
  logo_path: string | null;
  description: string | null;
  representative_name: string;
  phone: string;
  email: string | null;
  city_id: number;
  district_id: number | null;
  district_text: string | null;
  address: string;
  lat: number;
  lng: number;
  cr_number: string | null;
  vat_number: string | null;
  vat_registered: boolean;
  opening_hours: Record<string, [string, string] | null>;
  service_radius_km: number;
  supports_pickup: boolean;
  supports_delivery: boolean;
  supports_dropoff: boolean;
  pickup_fee: number;
  delivery_fee: number;
  min_order: number;
  prep_hours: number;
  accepting_orders: boolean;
  status: LaundryStatus;
  is_active: boolean;
  review_notes: string | null;
  terms_accepted_at: string | null;
  settlement_bank_name: string | null;
  settlement_iban: string | null;
  rating_avg: number;
  rating_count: number;
  created_at: string;
}

export interface NearbyLaundry {
  id: string; name: string; logo_path: string | null; city_id: number; district_text: string | null; address: string;
  lat: number; lng: number; distance_km: number | null; rating_avg: number; rating_count: number; min_order: number;
  prep_hours: number; pickup_fee: number; delivery_fee: number; supports_pickup: boolean; supports_delivery: boolean;
  supports_dropoff: boolean; opening_hours: Record<string, [string, string] | null>; starting_price: number | null;
  category_ids: number[]; service_radius_km: number;
}

export interface Service {
  id: string; laundry_id: string; category_id: number; name_ar: string; name_ur: string | null; description: string | null;
  pricing_model: PricingModel; price: number | null; unit_label: string | null; turnaround_hours: number | null;
  restrictions: string | null; is_active: boolean; sort_order: number;
}

export interface Package {
  id: string; laundry_id: string; name_ar: string; name_ur: string | null; description: string | null; price: number;
  piece_credits: number; max_orders: number | null; interval_days: number; free_pickup_delivery: boolean;
  eligible_category_ids: number[]; overage_note: string | null; terms: string; is_active: boolean;
}

export interface CustomerPackage {
  id: string; customer_id: string; package_id: string; laundry_id: string; status: CustomerPackageStatus; price_paid: number;
  piece_credits: number; pieces_used: number; max_orders: number | null; orders_used: number; free_pickup_delivery: boolean;
  period_start: string | null; period_end: string | null; created_at: string;
}

export interface Order {
  id: string; order_number: string; customer_id: string; laundry_id: string; fulfillment: Fulfillment; status: OrderStatus;
  payment_status: PaymentStatus; payment_method: PaymentMethod; contact_name: string; contact_phone: string; city_id: number | null;
  district_text: string | null; address_line: string | null; address_lat: number | null; address_lng: number | null;
  address_notes: string | null; window_start: string | null; window_end: string | null; notes: string | null;
  subtotal: number; package_credit: number; pickup_fee: number; delivery_fee: number; discount: number; vat_included: number;
  total: number; is_estimate: boolean; final_total: number | null; adjustment_note: string | null;
  adjustment_status: "pending" | "approved" | "disputed" | null; commission_amount: number; package_pieces: number;
  accept_deadline: string | null; rejection_reason: string | null; cancellation_reason: string | null;
  delivered_at: string | null; completed_at: string | null; created_at: string;
}

export interface OrderItem {
  id: string; order_id: string; service_id: string | null; name_snapshot: string; pricing_model: PricingModel;
  unit_price: number | null; quantity: number; line_total: number; covered_by_package: number; instructions: string | null;
}

export interface OrderEvent { id: number; order_id: string; status: OrderStatus | null; event: string; note: string | null; actor_role: string | null; created_at: string }

export interface DeliveryJob {
  id: string; order_id: string; order_number: string; leg: JobLeg; status: JobStatus; rider_id: string | null; city_id: number | null;
  from_label: string; from_area: string | null; from_lat: number | null; from_lng: number | null;
  to_label: string; to_area: string | null; to_lat: number | null; to_lng: number | null;
  rider_fee: number; fail_reason: string | null; assigned_at: string | null; picked_up_at: string | null; delivered_at: string | null; created_at: string;
}

export interface Rider {
  id: string; full_name: string; phone: string; city_id: number; vehicle_type: "car" | "motorcycle" | "bicycle" | "van";
  vehicle_plate: string | null; national_id: string | null; id_document_path: string | null; license_document_path: string | null;
  status: RiderStatus; is_online: boolean; last_lat: number | null; last_lng: number | null; review_notes: string | null; created_at: string;
}

export interface PartnerSubscription {
  id: string; laundry_id: string; status: SubscriptionStatus; price: number; current_period_start: string | null;
  current_period_end: string | null; trial_used: boolean; notes: string | null;
}

export interface Payment {
  id: string; kind: "partner_subscription" | "order" | "customer_package"; payer_id: string | null; laundry_id: string | null;
  order_id: string | null; customer_package_id: string | null; subscription_id: string | null; amount: number; method: PaymentMethod;
  status: "pending" | "confirmed" | "failed" | "refunded"; reference: string | null; invoice_number: string | null;
  period_start: string | null; period_end: string | null; confirmed_at: string | null; notes: string | null; created_at: string;
}

export interface PlatformSettings {
  partner_subscription_price: number; billing_cycle_months: number; trial_days: number; grace_days: number;
  require_active_subscription: boolean; commission_enabled: boolean; commission_percent: number;
  order_accept_timeout_minutes: number; default_service_radius_km: number; max_search_radius_km: number;
  rider_fee_per_leg: number; max_active_jobs_per_rider: number; auto_complete_hours: number; vat_rate: number;
  order_prefix: string; support_phone: string | null; support_whatsapp: string | null; bank_transfer_instructions: string | null;
}

export interface Review {
  id: string; order_id: string; laundry_id: string; customer_id: string; rating: number; comment: string | null;
  partner_reply: string | null; is_hidden: boolean; created_at: string;
}

export interface Notification { id: number; user_id: string; kind: string; data: Record<string, unknown>; link: string | null; read_at: string | null; created_at: string }

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
