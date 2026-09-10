/**
 * Shape confirmed against the live backend's OpenAPI contract (L5-swagger,
 * operationId `restaurantAnalyticsShow`) — GET
 * /api/v1/restaurants/{restaurant}/analytics returns exactly this shape.
 * A historical/descriptive read model for an explicit period, computed fresh
 * on every request — distinct from Operations Live (current state). Money
 * fields are decimal strings, never numbers. There is deliberately NO
 * period-over-period comparison/delta anywhere in this contract — never
 * fabricate a trend percentage on top of it (see CLAUDE.md's critical rule
 * addendum, §61).
 */
export type AnalyticsGranularity = 'day' | 'week' | 'month'

export interface AnalyticsQuery {
  /** YYYY-MM-DD, local calendar date in the restaurant's own timezone. */
  from?: string
  to?: string
  granularity?: AnalyticsGranularity
}

export interface AnalyticsRestaurant {
  id: number
  name: string
  timezone: string
  currency: string
}

export interface AnalyticsPeriod {
  from: string
  to: string
  granularity: AnalyticsGranularity
  timezone: string
}

export interface AnalyticsSummary {
  revenue: string
  average_ticket: string
  sessions_with_payments: number
  orders_count: number
  guests_served: number
  closed_sessions: number
}

export interface AnalyticsRevenuePoint {
  /** A day, or the Monday of a week, or the first of a month — always zero-filled, never sparse. */
  period_start: string
  revenue: string
}

export interface AnalyticsOccupancy {
  occupancy_rate: number
  occupied_seconds: number
  total_tables: number
  /** null (never 0) when no session actually closed in the period. */
  average_session_duration_seconds: number | null
}

export interface AnalyticsTableTurnover {
  closed_sessions: number
  turnover_per_table: number
}

export interface AnalyticsPeakHour {
  /** 0-23, all 24 always present, zero-filled. */
  hour: number
  sessions_started: number
}

export interface AnalyticsProduct {
  /** null when the live Product/RestaurantProduct row is gone — name is a sale-time snapshot regardless. */
  id: number | null
  name: string
  quantity: number
  revenue: string
}

export interface AnalyticsProducts {
  top_by_quantity: AnalyticsProduct[]
  top_by_revenue: AnalyticsProduct[]
}

export interface AnalyticsKitchen {
  orders_created: number
  orders_ready: number
  orders_cancelled: number
  /** null (never 0 or fabricated) when no order reached ready in the period. */
  average_preparation_time_seconds: number | null
}

export interface AnalyticsOrders {
  total: number
  by_origin: {
    customer_qr: number
    waiter: number
    manager: number
    cashier: number
  }
}

export interface AnalyticsStaffMember {
  user: { id: number; name: string | null }
  role: string | null
  shift_count: number
  active_seconds: number
  tables_served: number
  orders_created: number
  orders_served: number
  customer_orders_approved: number
  table_requests_handled: number
  sessions_closed: number
  average_rating: string | null
  reviews_count: number
}

export interface RestaurantAnalytics {
  restaurant: AnalyticsRestaurant
  period: AnalyticsPeriod
  summary: AnalyticsSummary
  revenue_series: AnalyticsRevenuePoint[]
  occupancy: AnalyticsOccupancy
  table_turnover: AnalyticsTableTurnover
  peak_hours: AnalyticsPeakHour[]
  products: AnalyticsProducts
  kitchen: AnalyticsKitchen
  orders: AnalyticsOrders
  /** Roster from StaffShift presence overlapping the period — never carries sales attribution, see backend note. */
  staff: AnalyticsStaffMember[]
}
