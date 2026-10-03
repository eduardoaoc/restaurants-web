/** Run in the local Vite browser: import('/tests/day-close-whatsapp.browser.ts').then(m => m.runWhatsAppChecks()).
 * Service doubles exercise races and uncertain POSTs without Meta credentials or database edits.
 */
import { createApp, nextTick, ref } from 'vue'
import { getActivePinia } from 'pinia'
import axios, { AxiosError } from 'axios'
import { http } from '../src/api/http'
import { useRestaurantStore } from '../src/stores/restaurant'
import { dayCloseWhatsAppService as service } from '../src/services/day-close-whatsapp.service'
import { useDayCloseWhatsAppSettings } from '../src/composables/useDayCloseWhatsAppSettings'
import { useDayCloseDeliveries } from '../src/composables/useDayCloseDeliveries'
import { useDayCloseWhatsAppResend } from '../src/composables/useDayCloseWhatsAppResend'
import { isDeliveryInFlight, WHATSAPP_POLL_INTERVAL, whatsappErrorKey, whatsappFailureKey } from '../src/utils/day-close-whatsapp'
import type { DayCloseDelivery, DayCloseDeliveryStatus, DayCloseWhatsAppSettings } from '../src/types/day-close-whatsapp'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const fixtureSettings = (name: string): DayCloseWhatsAppSettings => ({ enabled: false, available: false, status: 'disabled', consent_text: 'Consent', consent_text_version: 'v1', recipient: { id: 1, name, phone_masked: '+12 ••• •• 01 23', linked_user_id: null, active: true, consent_given_at: '2026-10-03T10:00:00Z', consent_method: 'declared_by_admin', consent_text_version: 'v1' } })
export const fixtureDelivery = (status: DayCloseDeliveryStatus, id = 1): DayCloseDelivery => ({ id, kind: 'automatic', channel: 'whatsapp', status, recipient: { name: 'Historic recipient', phone_masked: '+12 ••• •• 01 23' }, template: { name: null, language: null }, attempts: 1, requested_by: null, failure: status === 'failed' ? { code: 'job_failed', reason: null } : status === 'skipped' ? { code: 'recipient_missing', reason: null } : null, queued_at: '2026-10-03T10:00:00Z', accepted_at: status === 'accepted' ? '2026-10-03T10:01:00Z' : null, sent_at: status === 'sent' ? '2026-10-03T10:02:00Z' : null, delivered_at: status === 'delivered' ? '2026-10-03T10:03:00Z' : null, read_at: status === 'read' ? '2026-10-03T10:04:00Z' : null, failed_at: status === 'failed' ? '2026-10-03T10:05:00Z' : null, created_at: '2026-10-03T10:00:00Z' })

/** Actual mounted UI, including Axios Idempotency-Key handling; all deliveries here are fixtures. */
export function installWhatsAppUiFixtures() {
  const original = { ...service }
  const originalAdapter = http.defaults.adapter
  const realAdapter = axios.getAdapter(originalAdapter)
  const calls: { key: string; url: string | undefined }[] = []
  const statuses: DayCloseDeliveryStatus[] = ['pending', 'accepted', 'sent', 'delivered', 'read', 'failed', 'skipped']
  const deliveries = statuses.map((status, index) => fixtureDelivery(status, 100 + index))
  service.getSettings = async () => ({ ...fixtureSettings('Current recipient'), available: true, enabled: true, status: 'ready', recipient: { ...fixtureSettings('Current recipient').recipient!, phone_masked: '+12 ••• •• 04 56' } })
  service.getDeliveries = async () => deliveries.slice()
  let errorCode: string | null = null
  http.defaults.adapter = async config => {
    if (config.method !== 'post' || !config.url?.endsWith('/deliveries')) return realAdapter(config)
    calls.push({ key: String(config.headers.get('Idempotency-Key')), url: config.url })
    await sleep(500)
    if (errorCode) {
      const response = { data: { error: { code: errorCode, message: 'Internal provider text must never be displayed' } }, status: errorCode === 'DELIVERY_ALREADY_PENDING' || errorCode === 'IDEMPOTENCY_KEY_REUSED' ? 409 : 422, statusText: 'Refused', headers: {}, config }
      throw new AxiosError('Refused', 'ERR_BAD_REQUEST', config, undefined, response)
    }
    const delivery = { ...fixtureDelivery('pending', 200 + calls.length), kind: 'manual_resend' as const, recipient: { name: 'Current recipient', phone_masked: '+12 ••• •• 04 56' } }
    deliveries.push(delivery)
    return { data: { data: delivery }, status: 201, statusText: 'Created', headers: {}, config }
  }
  return {
    calls,
    setError(code: string | null) { errorCode = code },
    cleanup() { Object.assign(service, original); http.defaults.adapter = originalAdapter },
  }
}

export async function runWhatsAppChecks(): Promise<string[]> {
  const passed: string[] = []
  const check = (condition: unknown, label: string) => { if (!condition) throw new Error(label); passed.push(label) }
  const original = { ...service }
  const restaurant = useRestaurantStore()
  const originalRestaurant = restaurant.currentRestaurantId
  const pinia = getActivePinia()!
  const closeId = ref<number | null>(2)
  const permitted = ref(true)
  let settings!: ReturnType<typeof useDayCloseWhatsAppSettings>
  let history!: ReturnType<typeof useDayCloseDeliveries>
  let resend!: ReturnType<typeof useDayCloseWhatsAppResend>
  let deliveryCalls = 0
  let postCalls = 0
  let responseStatus: DayCloseDeliveryStatus = 'pending'
  let failPost = false
  const keys: string[] = []
  service.getSettings = async id => { await sleep(id === 1 ? 60 : 5); return fixtureSettings('Restaurant ' + id) }
  service.updateSettings = async id => { await sleep(60); return fixtureSettings('Saved ' + id) }
  service.getDeliveries = async id => { ++deliveryCalls; await sleep(id === 2 ? 60 : 5); return [fixtureDelivery(responseStatus, id)] }
  service.resend = async (_id, key) => { ++postCalls; keys.push(key); await sleep(60); if (failPost) throw new AxiosError('Network'); return fixtureDelivery('pending') }
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ setup() {
    settings = useDayCloseWhatsAppSettings(() => permitted.value)
    history = useDayCloseDeliveries(() => closeId.value, () => permitted.value)
    resend = useDayCloseWhatsAppResend(() => closeId.value, () => permitted.value)
    return () => null
  } }).use(pinia)
  let unmounted = false
  try {
    restaurant.currentRestaurantId = 1
    app.mount(host)
    restaurant.currentRestaurantId = 2
    closeId.value = 3
    await sleep(90)
    check(settings.settings.value?.recipient?.name === 'Restaurant 2', 'Settings ignores a late response from A')
    check(history.deliveries.value[0]?.id === 3, 'Deliveries ignores a late response from the previous close')
    restaurant.currentRestaurantId = 1
    await sleep(90)
    const mutation = settings.update({ enabled: false, recipient: null })
    restaurant.currentRestaurantId = 2
    await sleep(90)
    check(!(await mutation) && settings.settings.value?.recipient?.name === 'Restaurant 2', 'Save does not paint A onto B')
    check(!settings.saving.value && !settings.saveError.value, 'Switch clears previous loading and errors')
    permitted.value = false
    await nextTick()
    check(settings.settings.value === null && history.deliveries.value.length === 0, 'Permission loss clears protected state')
    permitted.value = true
    await sleep(90)
    resend.begin()
    const first = resend.confirm()
    const second = resend.confirm()
    check(await first && !(await second) && postCalls === 1, 'Double confirm performs one POST')
    resend.begin()
    await resend.confirm()
    check(keys[0] !== keys[1], 'A new successful action uses a new idempotency key')
    failPost = true
    resend.begin()
    await resend.confirm()
    resend.cancel()
    resend.begin()
    failPost = false
    await resend.confirm()
    check(keys[2] === keys[3], 'Uncertain retry retains its key across cancel and reopen')
    resend.begin()
    const pendingPost = resend.confirm()
    resend.cancel()
    check(resend.open.value, 'Confirmation stays open while the POST is pending')
    closeId.value = 4
    await pendingPost
    check(!resend.open.value && !resend.error.value, 'A previous close POST cannot update the new close')
    const statuses: DayCloseDeliveryStatus[] = ['pending', 'accepted', 'sent', 'delivered', 'read', 'failed', 'skipped']
    for (const status of statuses) check(isDeliveryInFlight(status) === ['pending', 'accepted', 'sent'].includes(status), status + ' polling classification')
    check(whatsappErrorKey({kind:'conflict',code:'DELIVERY_ALREADY_PENDING'}) === 'dayClose.whatsapp.errors.pending', 'Pending conflict has a safe specific message')
    check(whatsappErrorKey({kind:'conflict',code:'IDEMPOTENCY_KEY_REUSED'}) === 'dayClose.whatsapp.errors.idempotency', 'Idempotency conflict has a safe specific message')
    check(whatsappFailureKey('failed', 'raw_provider_code') === 'dayClose.whatsapp.failure.failed', 'Provider errors cannot reach the display')
    responseStatus = 'sent'
    await history.refresh()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    const hiddenCalls = deliveryCalls
    await sleep(WHATSAPP_POLL_INTERVAL + 150)
    check(deliveryCalls === hiddenCalls, 'Hidden tab pauses polling')
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await sleep(90)
    check(deliveryCalls === hiddenCalls + 1, 'Visible tab refetches immediately')
    Reflect.deleteProperty(document, 'visibilityState')
    const beforePoll = deliveryCalls
    await sleep(WHATSAPP_POLL_INTERVAL + 150)
    check(deliveryCalls === beforePoll + 1, 'Sent polls once after 12 seconds')
    responseStatus = 'delivered'
    await history.refresh()
    const terminalCalls = deliveryCalls
    await sleep(WHATSAPP_POLL_INTERVAL + 150)
    check(deliveryCalls === terminalCalls, 'Delivered stops polling')
    responseStatus = 'pending'
    await history.refresh()
    const beforeUnmount = deliveryCalls
    app.unmount(); unmounted = true
    await sleep(WHATSAPP_POLL_INTERVAL + 150)
    check(deliveryCalls === beforeUnmount, 'Unmount cancels the pending timer')
    return passed
  } finally {
    Reflect.deleteProperty(document, 'visibilityState')
    if (!unmounted) app.unmount()
    host.remove()
    Object.assign(service, original)
    restaurant.currentRestaurantId = originalRestaurant
  }
}
