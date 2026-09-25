/**
 * Shapes confirmed against the live backend's real response (Carta 5.1A,
 * restaurants-api commit 97e8713):
 *
 *   GET /api/v1/public/visits/{feedbackToken} -> { data: PublicVisit }
 *
 * A completely separate contract from `PublicMenu`/`PublicTableResolution`
 * (types/public-menu.ts) — never reuse those admin-flavored or live-session
 * types here. This is a post-payment, keyed-by-feedback-token PROJECTION:
 * snapshot values recorded at order time (never the current catalog), no
 * internal ids (session/restaurant/table/order/item/user), no payment
 * method/record, no staff identity. See PublicVisitResource/
 * PublicVisitOrderResource/PublicVisitOrderItemResource on the backend for
 * the authoritative field list — nothing here was invented.
 */

export interface PublicVisitOrderItemModifier {
  group_name: string
  name: string
  /** Decimal string, same shape as every other money field in this app. */
  price_delta: string
}

/** Snapshot-only — `name`/`unit_price` are what the product was called/cost when the order was placed, never re-derived from the current menu. */
export interface PublicVisitOrderItem {
  name: string
  quantity: number
  unit_price: string
  modifiers: PublicVisitOrderItemModifier[]
  line_total: string
}

export interface PublicVisitOrder {
  /** Already formatted (e.g. "#582") — never re-derive from a raw id, there isn't one here. */
  order_number: string
  created_at: string
  total: string
  items: PublicVisitOrderItem[]
}

export interface PublicVisit {
  restaurant: { name: string }
  table: { name: string }
  visit: {
    /** True while the TableSession is still open — gates the "Quiero algo más" CTA (§13); never gates whether the visit itself is viewable (closing never revokes access to its own visit). */
    active: boolean
    paid_at: string | null
    closed_at: string | null
  }
  /** Billable orders only, oldest first — a snapshot, never reconstructed from the live menu. */
  orders: PublicVisitOrder[]
  summary: {
    /** The one authoritative total for the visit (SessionBillCalculator on the backend) — never re-summed client-side to establish the official total. */
    total: string
  }
}
