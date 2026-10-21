/** Local-only: import('/tests/frontend-security.browser.ts').then(m => m.runSecurityBrowserChecks()). */
import { createApp, h, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { i18n } from '../src/i18n'
import Product from '../src/components/public/PublicProductReelCard.vue'
import Categories from '../src/components/public/PublicCategoryNav.vue'
import Staff from '../src/components/staff/StaffRow.vue'
import Restaurant from '../src/components/shared/RestaurantSwitcher.vue'
import Feedback from '../src/components/feedback/FeedbackDetailSheet.vue'
import Annotation from '../src/components/day-close/DayCloseAnnotationDialog.vue'
import GoogleReview from '../src/components/public/PublicGoogleReviewCta.vue'
import DayCloseDetail from '../src/views/day-close/DayCloseDetailView.vue'
import Payment from '../src/components/dashboard/table/TableBillPanel.vue'
import { tableSessionsService } from '../src/services/table-sessions.service'
import { customerFeedbackService } from '../src/services/customer-feedback.service'
import { useRestaurantStore } from '../src/stores/restaurant'
import App from '../src/App.vue'
import { useAuthStore } from '../src/stores/auth'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useRestaurantAnalytics } from '../src/composables/useRestaurantAnalytics'
import { useOrganizationStaff } from '../src/composables/useOrganizationStaff'
import { useOrderApprovals } from '../src/composables/useOrderApprovals'
import { useDayCloseHistory } from '../src/composables/useDayCloseHistory'
import { useDayClosePreview } from '../src/composables/useDayClosePreview'
import { analyticsService } from '../src/services/analytics.service'
import { staffService } from '../src/services/staff.service'
import { ordersService } from '../src/services/orders.service'
import { dayCloseService } from '../src/services/day-close.service'

export async function runSecurityBrowserChecks() {
  let checks = 0
  const check = (condition: boolean, label: string) => { if (!condition) throw new Error(label); ++checks }
  const payloads = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '"><svg onload=alert(1)>', '😀 مرحبا \u202eRTL "quotes"\nnewline', 'x'.repeat(10000)]
  const originalGet = customerFeedbackService.get
  const originalCloseGet = dayCloseService.get
  const originalAlert = window.alert
  let alerts = 0
  window.alert = () => { ++alerts }
  const pinia = createPinia()
  const store = useRestaurantStore(pinia)
  let fixtureRouter: ReturnType<typeof createRouter> | undefined
  async function mount(component: any, props: any, payload: string, input = false) {
    const host = document.createElement('div')
    host.style.width = '360px'
    document.body.append(host)
    const app = createApp({ render: () => h(component, props) }).use(pinia).use(i18n)
    if (fixtureRouter) app.use(fixtureRouter)
    try {
      app.mount(host)
      await new Promise(resolve => setTimeout(resolve, 50))
      await nextTick()
      if (input) {
        const textarea = document.querySelector<HTMLTextAreaElement>('#annotation-body')!
        textarea.value = payload
        textarea.dispatchEvent(new Event('input', { bubbles: true }))
        await nextTick()
        check(textarea.value === payload, 'annotation input retains literal text')
      } else check(document.body.textContent?.includes(payload) === true, component.__name + ': escaped text present')
      check(!document.querySelector('script:not([src]):not([type="module"])[data-injected], img[onerror], svg[onload]'), 'no injected handler nodes')
      check(alerts === 0, 'no payload handler execution')
      return { overflow: Math.max(0, host.scrollWidth - host.clientWidth) }
    } finally { app.unmount(); host.remove(); await nextTick() }
  }
  const overflow: Record<string, number> = {}
  try {
    const doubles = [
      [analyticsService, 'get', (marker: string) => ({ marker })],
      [staffService, 'list', (marker: string) => [{ id: 1, name: marker }]],
      [ordersService, 'list', (marker: string) => [{ id: 1, marker, restaurant: { id: Number(marker.split(':')[0]) }, origin: 'customer_qr', status: 'waiting_approval' }]],
      [dayCloseService, 'preview', (marker: string) => ({ marker })],
      [dayCloseService, 'list', (marker: string) => ({ dayCloses: [{ id: 1, marker }], nextCursor: null })],
    ] as const
    const originals = doubles.map(([service, key]) => (service as any)[key])
    let analytics: any, staff: any, orders: any, history: any, preview: any
    const raceHost = document.createElement('div'); document.body.append(raceHost)
    let raceApp: ReturnType<typeof createApp> | undefined
    try {
      store.currentRestaurantId = 1
      doubles.forEach(([service, key, result]) => {
        let calls = 0
        ;(service as any)[key] = async () => {
          const call = ++calls
          const marker = `${store.currentRestaurantId}:${call}`
          await new Promise(resolve => setTimeout(resolve, call === 1 ? 100 : call === 2 ? 60 : 5))
          return result(marker)
        }
      })
      raceApp = createApp({ setup() {
        analytics = useRestaurantAnalytics(() => true); void analytics.load()
        staff = useOrganizationStaff(() => true)
        orders = useOrderApprovals(() => true)
        history = useDayCloseHistory(() => store.currentRestaurantId, () => true)
        preview = useDayClosePreview(() => store.currentRestaurantId, () => true)
        return () => null
      } }).use(pinia)
      raceApp.mount(raceHost)
      store.currentRestaurantId = 2; await nextTick()
      check(analytics.data.value === null && staff.staff.value.length === 0 && orders.orders.value.length === 0 && history.items.value.length === 0 && preview.preview.value === null, 'B has no A cached data during loading')
      store.currentRestaurantId = 1; await nextTick()
      await new Promise(resolve => setTimeout(resolve, 130))
      for (const marker of [analytics.data.value.marker, staff.staff.value[0].name, orders.orders.value[0].marker, history.items.value[0].marker, preview.preview.value.marker]) check(marker === '1:3', 'A-B-A discards original A and delayed B')
    } finally {
      raceApp?.unmount(); raceHost.remove()
      doubles.forEach(([service, key], index) => { (service as any)[key] = originals[index] })
    }
    const auth = useAuthStore(pinia)
    auth.initializing = false
    auth.unavailable = false
    auth.bootstrap = async () => {}
    const memoryRouter = createRouter({ history: createMemoryHistory(), routes: [{ path: '/protected', meta: { requiresAuth: true }, component: { render: () => h('div', ['protected-content-sentinel', h(Annotation, { submitting: false, error: null })]) } }] })
    await memoryRouter.push('/protected')
    const gateHost = document.createElement('div'); document.body.append(gateHost)
    const gate = createApp(App).use(pinia).use(i18n).use(memoryRouter)
    try {
      gate.mount(gateHost); await nextTick()
      check(!document.body.textContent?.includes('protected-content-sentinel'), 'no protected content before authentication')
      auth.user = { id: 1, name: 'Fixture' } as any
      await nextTick()
      check(document.body.textContent?.includes('protected-content-sentinel') === true, 'authenticated content mounted')
      check(document.querySelector('#annotation-body') !== null, 'protected modal mounted')
      auth.expireSession(); await nextTick()
      check(!document.body.textContent?.includes('protected-content-sentinel'), 'session expiration removes protected content')
      check(document.querySelector('#annotation-body') === null, 'session expiration removes protected modal')
    } finally { gate.unmount(); gateHost.remove() }
    const oldBill = tableSessionsService.bill, oldPayment = tableSessionsService.recordPayment
    const paymentHost = document.createElement('div'); document.body.append(paymentHost)
    let payments = 0
    tableSessionsService.bill = async () => ({ orders_total: '1', paid_total: '0', balance: '1', payments: [] } as any)
    tableSessionsService.recordPayment = async () => { ++payments; await new Promise(resolve => setTimeout(resolve, 30)) }
    const paymentApp = createApp({ render: () => h(Payment, { tableSessionId: 1, currency: 'EUR', canRecordPayments: true }) }).use(pinia).use(i18n)
    try {
      paymentApp.mount(paymentHost); await new Promise(resolve => setTimeout(resolve, 50))
      paymentHost.querySelector<HTMLButtonElement>('button')!.click(); await nextTick()
      const confirm = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === i18n.global.t('tableDrawer.bill.confirmAction'))!
      check(Boolean(confirm), 'actual payment confirmation mounted')
      confirm.click(); confirm.click()
      await new Promise(resolve => setTimeout(resolve, 50))
      check(payments === 1, 'double-click payment makes one POST')
    } finally { paymentApp.unmount(); paymentHost.remove(); tableSessionsService.bill = oldBill; tableSessionsService.recordPayment = oldPayment }
    memoryRouter.addRoute({ path: '/fixture/:id', component: { render: () => null } })
    await memoryRouter.push('/fixture/1')
    fixtureRouter = memoryRouter
    for (const payload of payloads) {
      store.restaurants = [{ id: 1, name: payload } as any]
      store.currentRestaurantId = 1
      overflow.product = (await mount(Product, { product: { restaurant_product_id: 1, name: payload, price: '1.00', description: payload, allergens: [], media: { image: { url: 'javascript:alert(1)' }, video: { url: 'data:text/html,<script>alert(1)</script>' } } }, locale: 'es-ES', active: false, nearActive: true, suspended: true, orderingEnabled: false }, payload)).overflow
      await mount(Categories, { categories: [{ id: 1, name: payload }], activeCategoryId: 1 }, payload)
      overflow.staff = (await mount(Staff, { member: { name: payload, email: payload, status: 'active', role: null, restaurants: [] }, activeShift: null, shiftsVisible: false, selected: false }, payload)).overflow
      check(overflow.staff === 0, 'staff long name does not widen layout')
      await mount(Restaurant, {}, payload)
      customerFeedbackService.get = async () => ({ first_name: payload, last_name: '', submitted_at: '2026-10-04T10:00:00Z', waiter: null, table_session: { table: { name: payload } }, experience_comment: payload, improvement_comment: payload, contact: payload, overall_rating: 5, food_rating: 5, service_rating: 5, wait_time_rating: 5 } as any)
      await mount(Feedback, { feedbackId: 1 }, payload)
      await mount(Annotation, { submitting: false, error: null }, payload, true)
      const zeroCash = { opening_float: '0', cash_received: '0', cash_pay_ins: '0', cash_pay_outs: '0', expected_cash: '0', counted_cash: '0', cash_difference: '0', cash_left_for_next_day: null, cash_difference_note: null, movements: [] }
      dayCloseService.get = async () => ({ id: 1, restaurant_id: 1, currency: 'EUR', timezone: 'Europe/Madrid', business_date: '2026-10-04', closed_at: '2026-10-04T10:00:00Z', closed_by: { name: 'Fixture' }, notes: null,
        report: { financial: { total_received: '0', by_method: { cash: '0', card: '0', other: '0' }, average_ticket: '0' }, operations: { orders: { valid: 0 }, sessions: { closed: 0 }, guests: 0, peak_hour: null }, products: { top: [] }, product_availability: { count: 0, items: [] }, feedback: { count: 0, avg_overall: null, critical_count: 0 }, delays: { total_count: 0, items: [] }, cash: zeroCash },
        annotations: [{ id: 1, body: payload, created_by: { name: 'Fixture' }, created_at: '2026-10-04T10:00:00Z' }] } as any)
      await mount(DayCloseDetail, {}, payload)
    }
    const host = document.createElement('div'); document.body.append(host)
    const app = createApp({ render: () => h(GoogleReview, { url: 'javascript:alert(1)' }) }).use(i18n)
    try {
      app.mount(host); await nextTick()
      check(!host.querySelector('a')?.hasAttribute('href'), 'malicious review URL has no navigable href')
      host.querySelector('a')?.click(); check(alerts === 0, 'click cannot execute review payload')
    } finally { app.unmount(); host.remove() }
    return { checks, alerts, overflow, note: 'Actual components and stored annotation view; local service doubles.' }
  } finally { customerFeedbackService.get = originalGet; dayCloseService.get = originalCloseGet; window.alert = originalAlert }
}
