import assert from 'node:assert/strict'
import { h, nextTick, type Component, type createApp as CreateApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createI18n } from 'vue-i18n'
import { PhBellRinging, PhGauge, PhGear, PhUsersThree } from '@phosphor-icons/vue'
import ShellNavigation from '../src/components/shell/ShellNavigation.vue'
import es from '../src/i18n/locales/es-ES'
import ca from '../src/i18n/locales/ca-ES-valencia'
import en from '../src/i18n/locales/en-GB'
import { persistSidebarCollapsed, readSidebarCollapsed, SIDEBAR_STORAGE_KEY } from '../src/composables/useShellLayout'
import {
  groupShellNavigation, isDestinationActive, partitionShellNavigation,
  resolveShellNavigation, SHELL_DESTINATIONS, type NavigationAccess, type ShellNavItem,
} from '../src/components/shell/navigation'

const permissions = (...values: string[]): NavigationAccess => ({
  can: permission => values.includes(permission),
  canAny: list => list.some(permission => values.includes(permission)),
  canOrganization: permission => values.includes(permission),
})

export async function runShellChecks(createApp: typeof CreateApp) {
  let checks = 0
  const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks++ }
  const all = resolveShellNavigation(permissions(
    'view_operations', 'view_reports', 'update_kitchen_status', 'serve_orders',
    'manage_menu', 'open_daily_operation', 'manage_tables', 'manage_users',
    'view_customer_feedback', 'manage_restaurants', 'manage_organization',
  ), 'app-day-close-detail', ['app-day-close', 'app-day-close-detail'], 3)
  check(all.length === 9, 'permission source renders only the nine current real destinations')
  check(all.find(item => item.id === 'day-close')?.active, 'detail route keeps the existing parent destination active')
  check(all.find(item => item.id === 'service')?.badge?.count === 3, 'real ready-order count becomes a service badge')
  check(isDestinationActive({ routeName: 'app-menu' }, 'app-menu-product'), 'known child name matches its destination')
  check(!isDestinationActive({ routeName: 'app-menu' }, 'app-menus'), 'unrelated route prefix does not activate a destination')

  const compact = partitionShellNavigation(all, 'bottom')
  check(compact.primary.length === 4 && compact.primary[0].id === 'service', 'compact bottom nav shows four prioritized destinations')
  check(compact.overflow.length === 5 && !compact.moreActive, 'compact More contains all destinations outside the four-item primary nav')
  const overflowActive = partitionShellNavigation(resolveShellNavigation(permissions('view_operations', 'manage_menu', 'update_kitchen_status', 'open_daily_operation'), 'app-menu'), 'bottom')
  check(overflowActive.moreActive, 'More indicates that its overflow destination is active')
  const tablet = partitionShellNavigation(all, 'rail')
  check(tablet.primary.length === 6 && tablet.overflow.length === 3, 'tablet rail caps visible destinations and sends the rest to More')
  const desktop = partitionShellNavigation(all, 'sidebar')
  check(desktop.primary.length === 9 && desktop.overflow.length === 0, 'desktop sidebar uses the same shared destination array')
  const grouped = groupShellNavigation(desktop.primary, true)
  check(grouped.map(group => group.id).join(',') === 'operation,management,footer', 'sidebar groups reflect actual nonempty allowed items')
  check(groupShellNavigation(compact.overflow, false).length === 1, 'More sheet has one ordered ungrouped list')

  const serviceOnly = resolveShellNavigation(permissions('serve_orders'), 'app-service')
  check(serviceOnly.length === 1 && serviceOnly[0].id === 'service', 'service keeps its existing multi-permission gate')
  const settingsOrgOnly = resolveShellNavigation(permissions('manage_organization'), 'app-settings')
  check(settingsOrgOnly.length === 1 && settingsOrgOnly[0].id === 'settings', 'settings retains organization permission OR gate')
  check(resolveShellNavigation(permissions('serve_orders'), 'app-kitchen').every(item => item.id !== 'kitchen'), 'navigation preserves existing kitchen gate without broadening permissions')
  for (const [locale, messages] of [['es', es], ['ca', ca], ['en', en]] as const) {
    check(!!messages.appShell.more && !!messages.appShell.operation && !!messages.appShell.management, `${locale}: shell groups and More are translated`)
  }
  const priorStorage = globalThis.localStorage
  const values = new Map<string, string>()
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) } as Storage
  check(!readSidebarCollapsed(), 'missing collapse preference defaults to expanded')
  persistSidebarCollapsed(true)
  check(values.get(SIDEBAR_STORAGE_KEY) === 'true' && readSidebarCollapsed(), 'desktop collapse preference persists and restores')
  if (priorStorage === undefined) delete (globalThis as { localStorage?: Storage }).localStorage
  else globalThis.localStorage = priorStorage

  const messages = { en: { appShell: { mainNav: 'Main navigation', more: 'More', operation: 'Operation', management: 'Management', readyCount: '{count} orders ready' }, service: { title: 'Service' }, kitchen: { title: 'Kitchen' }, dayClose: { pageTitle: 'Closing' }, common: { dashboard: 'Dashboard', menu: 'Menu', tables: 'Tables', settings: 'Settings' }, staff: { pageTitle: 'Staff' }, feedback: { pageTitle: 'Feedback' } } }
  const router = createRouter({ history: createMemoryHistory(), routes: SHELL_DESTINATIONS.map(item => ({
    path: `/test/${item.id}`, name: item.routeName, component: { render: () => null },
  })) })
  await router.push({ name: 'app-service' })
  const i18n = createI18n({ legacy: false, locale: 'en', messages })
  const rendered = partitionShellNavigation(resolveShellNavigation(permissions('view_operations'), 'app-service', [], 3), 'bottom')
  const host = document.createElement('main')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(ShellNavigation as Component, {
    items: rendered.primary, mode: 'bottom', more: true, moreActive: rendered.moreActive,
    moreCount: rendered.moreCount,
  }) }).use(router).use(i18n)
  app.mount(host)
  await nextTick()
  const nav = host.querySelector('nav[aria-label="Main navigation"]')
  check(!!nav, 'bottom navigation renders a labelled semantic nav landmark')
  check(host.querySelector('[data-destination="service"]')?.getAttribute('aria-current') === 'page', 'active destination sets aria-current')
  check(host.querySelector('[data-destination="service"]')?.textContent?.includes('3 orders ready'), 'badge count has an accessible text equivalent')
  check(host.querySelector('[data-shell-more]')?.getAttribute('aria-haspopup') === 'dialog', 'More is an accessible dialog trigger')
  check([...host.querySelectorAll('button, a')].every(control => control.getAttribute('aria-current') || control.textContent?.trim()), 'all destination controls retain visible names')
  app.unmount(); host.remove()

  for (const [mode, items, showMore, expected] of [
    ['rail', tablet.primary, true, 6],
    ['sidebar', desktop.primary, false, 9],
  ] as const) {
    const modeHost = document.createElement('main')
    document.body.appendChild(modeHost)
    const modeApp = createApp({ render: () => h(ShellNavigation as Component, { items, mode, more: showMore }) }).use(router).use(i18n)
    modeApp.mount(modeHost)
    await nextTick()
    check(modeHost.querySelector(`nav[data-mode="${mode}"]`)?.querySelectorAll('[data-destination]').length === expected, `${mode}: renders the partitioned shared items`)
    check(!!modeHost.querySelector('[data-group="operation"]') === (mode === 'sidebar'), `${mode}: only expanded sidebar renders grouped headings`)
    modeApp.unmount(); modeHost.remove()
  }

  return { checks }
}
