import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { http } from '@/api/http'
import { mockOrdersByTableNumber } from '@/data/restaurant-3d/mock-table-orders'

/**
 * Scoped, lab-only interception for requests the reused TableDetailsDrawer
 * makes about a LAB table. Lab ids are negative (see table-detail-adapter.ts)
 * so they can never match real data; this wrapper makes sure those requests
 * never even reach the network:
 *   - the few read endpoints the drawer needs get a mock answer;
 *   - every other request about a lab id is refused locally as a 404.
 * Everything else (real restaurant ids, auth, …) passes through untouched.
 * Installed on mount and restored on unmount — no change to src/api/http.ts.
 */
const NEGATIVE_ID = /(^|[/=?&])-\d+($|[/?&])/

function mentionsLabId(config: InternalAxiosRequestConfig): boolean {
  if (NEGATIVE_ID.test(config.url ?? '')) return true
  return Object.values(config.params ?? {}).some((value) => typeof value === 'number' && value < 0)
}

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosResponse {
  return { config, status, statusText: String(status), headers: {}, data }
}

function mockResponse(config: InternalAxiosRequestConfig): AxiosResponse | null {
  if ((config.method ?? 'get').toLowerCase() !== 'get') return null
  const url = config.url ?? ''

  if (url.endsWith('/api/v1/orders')) {
    const sessionId = Number(config.params?.table_session_id)
    const tableNumber = -(sessionId + 1000)
    // The real list drops orders from any other restaurant, so stamp the one asked for.
    const restaurantId = Number(config.params?.restaurant_id)
    const orders = (mockOrdersByTableNumber[tableNumber] ?? []).map((order) => ({ ...order, restaurant: { ...order.restaurant, id: restaurantId } }))
    return respond(config, 200, { data: { orders }, meta: { next_before_id: null } })
  }

  const bill = /\/api\/v1\/table-sessions\/(-\d+)\/bill$/.exec(url)
  if (bill) {
    const sessionId = Number(bill[1])
    const tableNumber = -(sessionId + 1000)
    const orders = mockOrdersByTableNumber[tableNumber] ?? []
    const total = orders.reduce((sum, o) => sum + Number(o.total), 0).toFixed(2)
    return respond(config, 200, {
      data: {
        table_session_id: sessionId,
        status: 'open',
        payment_status: 'unpaid',
        table: { id: -tableNumber, name: `Mesa ${String(tableNumber).padStart(2, '0')}` },
        orders_total: total,
        paid_total: '0.00',
        balance: total,
        can_close: false,
        orders: orders.map((o) => ({ billable: true, items: o.items, id: o.id, status: o.status, total: o.total, created_at: o.created_at })),
        payments: [],
      },
    })
  }
  return null
}

export function installLabApiGuard(): () => void {
  const original = http.defaults.adapter
  http.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    if (mentionsLabId(config)) {
      const mocked = mockResponse(config)
      if (mocked) return mocked
      throw new AxiosError('Lab table: no such resource', 'ERR_BAD_REQUEST', config, null,
        respond(config, 404, { message: 'Lab table: this action is not available in the 3D lab.' }))
    }
    // `adapter` is usually a list of names, not a function: let axios resolve it.
    return axios.getAdapter(original ?? axios.defaults.adapter)(config)
  }
  return () => {
    http.defaults.adapter = original
  }
}
