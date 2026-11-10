import { createApp, h, nextTick, ref } from 'vue'
import { createPinia } from 'pinia'
import { AxiosError } from 'axios'
import { http } from '../src/api/http'
import { i18n } from '../src/i18n'
import { useAuthStore } from '../src/stores/auth'
import { useRestaurantStore } from '../src/stores/restaurant'
import TableDetailsDrawer from '../src/components/dashboard/table/TableDetailsDrawer.vue'
import type { OperationsTable } from '../src/types/operations'

const settle = async () => { await new Promise(resolve => setTimeout(resolve, 30)); await nextTick() }
const baseTable = (): OperationsTable => ({
  id: 17, name: 'Mesa 17', number: 17, capacity: 4, zone_id: null,
  layout: { x: null, y: null, rotation: null, shape: null, width: null, height: null },
  primary_status: 'occupied', flags: [],
  session: { id: 510, started_at: '2026-11-10T11:00:00Z', elapsed_seconds: 600, guest_count: 2, guest_count_version: 1, assigned_waiter: null },
  orders: { open_count: 0, waiting_approval: 0, preparing: 0, ready: 0 }, billing: null,
})

export async function runGuestCountChecks() {
  const originalAdapter = http.defaults.adapter
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  const restaurant = useRestaurantStore(pinia)
  restaurant.currentRestaurantId = 1
  auth.authContext = {
    user: { id: 5, name: 'Waiter', email: 'waiter@example.test', status: 'active' },
    platform: { is_platform_admin: false, roles: [], permissions: [] },
    organizations: [{ id: 1, name: 'Test', slug: 'test', status: 'active', roles: [], permissions: [], restaurants: [{
      id: 1, name: 'Test restaurant', slug: 'test', status: 'active', roles: ['waiter'], permissions: ['manage_tables'], can_manage_table_structure: false,
    }] }],
  }

  const table = ref(baseTable())
  const calls: { url?: string; method?: string; body?: unknown }[] = []
  let responseMode: 'success' | 'unprocessable' | 'conflict' = 'success'
  let holdNextResponse: (() => void) | null = null
  let holdPromise: Promise<void> | null = null
  let refreshLatest = false
  http.defaults.adapter = async config => {
    calls.push({ url: config.url, method: config.method, body: config.data })
    if (holdPromise) await holdPromise
    if (responseMode === 'unprocessable') {
      throw new AxiosError('Validation failed', AxiosError.ERR_BAD_REQUEST, config, null, {
        status: 422, statusText: 'Unprocessable Entity', headers: {}, config,
        data: { message: 'The guest count may not be greater than the table capacity.', errors: { guest_count: ['Invalid count.'] } },
      })
    }
    if (responseMode === 'conflict') {
      responseMode = 'success'
      refreshLatest = true
      throw new AxiosError('Conflict', AxiosError.ERR_BAD_REQUEST, config, null, {
        status: 409, statusText: 'Conflict', headers: {}, config,
        data: { error: { code: 'GUEST_COUNT_VERSION_CONFLICT', message: 'The table guest count changed.' } },
      })
    }
    const request = typeof config.data === 'string' ? JSON.parse(config.data) : config.data as { guest_count: number }
    const current = table.value.session!
    return {
      status: 200, statusText: 'OK', headers: {}, config,
      data: { message: 'Guest count updated successfully.', data: { session: {
        id: current.id, table_id: table.value.id, restaurant_id: 1, guest_count: request.guest_count,
        guest_count_version: current.guest_count_version + (request.guest_count === current.guest_count ? 0 : 1),
        status: 'occupied', payment_status: 'unpaid', opened_at: current.started_at, closed_at: null, paid_at: null,
        opened_by_user_id: 5, closed_by_user_id: null, assigned_waiter: null,
        created_at: current.started_at, updated_at: current.started_at,
      } } },
    }
  }

  const host = document.createElement('main')
  document.body.append(host)
  const app = createApp({ setup() {
    return () => h(TableDetailsDrawer, {
      table: table.value, staff: [], freeTables: [], currency: 'EUR', serviceMode: true,
      onRefresh: () => {
        if (refreshLatest) {
          refreshLatest = false
          table.value = { ...table.value, session: { ...table.value.session!, guest_count: 4, guest_count_version: 3 } }
        }
      },
    })
  } })
  app.use(pinia); app.use(i18n); app.mount(host)

  const button = (label: string) => [...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === label || el.textContent?.trim() === label) as HTMLButtonElement | undefined
  const dialogButton = (label: string) => {
    const dialog = [...document.querySelectorAll('[role="dialog"]')].at(-1)
    return dialog ? [...dialog.querySelectorAll('button')].find(el => el.textContent?.trim() === label) as HTMLButtonElement | undefined : undefined
  }
  const click = async (label: string) => { const target = button(label); if (!target) throw new Error(`Missing button: ${label}`); target.click(); await settle() }
  const count = () => {
    const label = [...document.querySelectorAll('span')].find(el => el.textContent?.trim() === 'Clientes')
    return label?.parentElement?.querySelector('.text-title-md')?.textContent?.trim()
  }
  try {
    await settle()
    await click('Editar personas')
    await click('Añadir una persona')
    if (calls.length !== 0) throw new Error('+/− must not send a request')
    await click('Guardar cambios')
    if (!document.body.textContent?.includes('¿Cambiar el número de personas de 2 a 3?')) throw new Error('Confirmation must show previous and next counts')
    const cancel = dialogButton('Cancelar')
    cancel?.click(); await settle()
    if (calls.length !== 0) throw new Error('Cancel must not mutate')
    await click('Guardar cambios')
    responseMode = 'success'
    holdPromise = new Promise<void>(resolve => { holdNextResponse = resolve })
    const confirm = dialogButton('Guardar cambios')
    if (!confirm) throw new Error('Missing confirmation button')
    confirm.click(); await settle()
    confirm.click(); await settle()
    if (calls.length !== 1) throw new Error(`Duplicate confirmation sent ${calls.length} requests`)
    holdNextResponse?.(); holdNextResponse = null; holdPromise = null; await settle()
    if (count() !== '3') throw new Error(`Success did not update the table details: ${count()}`)

    await click('Editar personas')
    await click('Añadir una persona')
    await click('Guardar cambios')
    responseMode = 'unprocessable'
    const confirm422 = dialogButton('Guardar cambios')
    confirm422?.click(); await settle()
    if (count() !== '3' || !document.body.textContent?.includes('capacity')) throw new Error('422 must preserve authoritative count and show feedback')

    const cancel422 = dialogButton('Cancelar')
    cancel422?.click(); await settle()
    await click('Quitar una persona')
    await click('Quitar una persona')
    await click('Guardar cambios')
    responseMode = 'conflict'
    const firstConflict = dialogButton('Guardar cambios')
    firstConflict?.click(); await settle(); await settle()
    if (count() !== '4' || !document.body.textContent?.includes('¿Cambiar el número de personas de 4 a 2?')) throw new Error('409 must refresh state and require a fresh confirmation')
    const retry = dialogButton('Guardar cambios')
    retry?.click(); await settle()
    if (calls.length !== 4) throw new Error(`Expected four confirmed mutation attempts, received ${calls.length}`)
    const retriedBody = calls.at(-1)?.body as string | undefined
    const retryPayload = typeof retriedBody === 'string' ? JSON.parse(retriedBody) : retriedBody
    if (retryPayload.expected_version !== 3) throw new Error('Conflict retry must use the refreshed version')
    if (count() !== '2') throw new Error(`Conflict retry success did not update details: ${count()}`)
    return { requestCount: calls.length, authoritativeCount: count(), result: 'passed' }
  } finally {
    app.unmount(); host.remove(); http.defaults.adapter = originalAdapter; await nextTick()
  }
}
