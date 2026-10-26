/** Same behavioral checks run on the test host and in the browser fixture.
 * Layout and native keyboard order additionally require agent-browser.
 */
import { h, nextTick, reactive, ref, type Component, type createApp as CreateApp } from 'vue'
import { createRouter, createMemoryHistory, RouterLink } from 'vue-router'
import { createI18n } from 'vue-i18n'
import AButton from '../src/components/ui/AButton.vue'
import AIconButton from '../src/components/ui/AIconButton.vue'
import ADialog from '../src/components/ui/ADialog.vue'
import ASheet from '../src/components/ui/ASheet.vue'
import ABottomSheet from '../src/components/ui/ABottomSheet.vue'
import AConfirmDialog from '../src/components/ui/AConfirmDialog.vue'
import APageHeader from '../src/components/ui/APageHeader.vue'
import AStatusBadge from '../src/components/ui/AStatusBadge.vue'
import ASnackbar from '../src/components/ui/ASnackbar.vue'
import { useSnackbar } from '../src/composables/useSnackbar'

const pause = async (ms = 25) => { await nextTick(); await new Promise(resolve => setTimeout(resolve, ms)); await nextTick() }

export async function runPrimitiveChecks(createApp: typeof CreateApp) {
  let checks = 0
  const check = (value: unknown, message: string) => { if (!value) throw new Error(message); checks++ }
  async function mount(component: Component, initial: Record<string, unknown> = {}, slots: Record<string, () => unknown> = {}) {
    const props = reactive(initial)
    const instance = ref()
    const host = document.createElement('main')
    document.body.appendChild(host)
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }, { path: '/next', component: { render: () => null } }] })
    await router.push('/')
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: { common: { close: 'Close', back: 'Back', dismiss: 'Dismiss', cancel: 'Cancel' } } } })
    const app = createApp({ setup: () => () => h(component, { ...props, ref: instance }, slots) }).use(router).use(i18n)
    app.mount(host)
    await pause()
    return { host, props, router, instance, async cleanup() { app.unmount(); host.remove(); await pause() } }
  }
  const byText = (root: ParentNode, text: string) => [...root.querySelectorAll<HTMLElement>('button, a')].find(el => el.textContent?.trim() === text)!
  const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))

  for (const [variant, expected] of Object.entries({ primary: 'primary', secondary: 'secondary', ghost: 'ghost', danger: 'danger', filled: 'primary', tonal: 'secondary', outlined: 'secondary', text: 'ghost' })) {
    const f = await mount(AButton, { variant }, { default: () => 'Save' })
    check(f.host.querySelector('button')?.dataset.variant === expected, `button variant ${variant}`)
    check(f.instance.value.$el === f.host.querySelector('button'), 'public $el remains the focusable control')
    await f.cleanup()
  }
  let clicks = 0
  let f = await mount(AButton, { loading: false, onClick: () => clicks++, class: 'original' }, { default: () => 'Save', trailing: () => h('svg') })
  const button = f.host.querySelector('button')!
  const cells = button.children.length
  const width = button.getBoundingClientRect?.().width
  button.click(); check(clicks === 1, 'enabled button emits click')
  f.props.loading = true; f.props.class = 'updated'; await pause()
  check(button.disabled && button.getAttribute('aria-busy') === 'true', 'loading blocks activation and exposes aria-busy')
  check(button.textContent?.includes('Save') && button.children.length === cells, 'loading keeps visible label and cell geometry')
  if (width) check(Math.abs(button.getBoundingClientRect().width - width) < 1, 'loading width preserved in browser')
  check(button.classList.contains('updated') && !button.classList.contains('original'), 'dynamic attrs stay current')
  const blocked = new MouseEvent('click', { bubbles: true, cancelable: true }); button.dispatchEvent(blocked)
  check(clicks === 1 && blocked.defaultPrevented, 'synthetic activation while loading is also guarded')
  f.props.loading = false; f.props.disabled = true; await pause()
  check(button.disabled && button.dataset.disabled === 'true' && !button.hasAttribute('aria-busy'), 'explicit disabled state differs from loading')
  await f.cleanup()

  for (const as of ['RouterLink', RouterLink, 'a']) {
    f = await mount(AButton, { as, to: '/next', href: '/next', disabled: true }, { default: () => 'Continue' })
    const link = f.host.querySelector('a')!
    check(!link.hasAttribute('href') && link.tabIndex === -1 && link.getAttribute('aria-disabled') === 'true', 'disabled link has no navigation target')
    link.click(); await pause(); check(f.router.currentRoute.value.path === '/', 'disabled link cannot navigate')
    f.props.disabled = false; await pause(); check(link.getAttribute('href') === '/next', 'enabled link exposes destination')
    if (as !== 'a') { link.click(); await pause(); check(f.router.currentRoute.value.path === '/next', 'RouterLink uses the existing router') }
    await f.cleanup()
  }
  f = await mount(AIconButton, { label: 'Close', pressed: false, loading: false, variant: 'onMedia', size: 'lg' }, { default: () => h('svg') })
  check(f.host.querySelector('button')?.getAttribute('aria-label') === 'Close', 'icon button has accessible label')
  check(f.host.querySelector('button')?.dataset.iconOnly === 'true' && f.host.querySelector('button')?.dataset.variant === 'secondary', 'icon-only/media compatibility uses shared control')
  f.props.pressed = true; f.props.loading = true; await pause()
  check(f.host.querySelector('button')?.getAttribute('aria-pressed') === 'true' && f.host.querySelector('button')?.disabled, 'icon pressed/loading semantics')
  await f.cleanup()

  const trigger = document.createElement('button'); trigger.textContent = 'Trigger'; document.body.appendChild(trigger)
  document.body.style.overflow = 'scroll'
  for (const [component, extra] of [[ADialog, {}], [ASheet, { variant: 'bottom' }], [ASheet, { variant: 'side' }]] as const) {
    trigger.focus()
    let closed = 0
    f = await mount(component, { title: 'Edit item', ...extra, onClose: () => closed++ }, {
      default: () => [h('input', { disabled: true }), h('input', { id: 'first-field' }), h('input', { type: 'radio', name: 'rating', value: '1' }), h('input', { type: 'radio', name: 'rating', value: '2' })],
      footer: () => h(AButton, { disabled: true }, () => 'Save'),
    })
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    check(dialog.getAttribute('aria-modal') === 'true' && document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent === 'Edit item', 'modal ARIA points to visible title')
    check(document.activeElement?.id === 'first-field', `initial focus skips disabled field and close button (active: ${document.activeElement?.tagName}#${document.activeElement?.id}, fields: ${[...dialog.querySelectorAll('input')].map(el => `${el.id}:${el.disabled}:${el.inert}`)})`)
    check(document.body.style.overflow === 'hidden' && trigger.inert, 'modal locks scroll and makes background inert')
    trigger.focus(); check(dialog.contains(document.activeElement), 'focus cannot reach inert background')
    escape(); await pause(380)
    check(closed === 1 && !document.querySelector('[role="dialog"]'), 'Escape closes after leave')
    check(document.activeElement === trigger && !trigger.inert && document.body.style.overflow === 'scroll', 'return focus and restore prior scroll/inert state')
    await f.cleanup()
  }
  let permit = false, closeRequests = 0
  f = await mount(ADialog, { title: 'Unsaved', beforeClose: async () => { closeRequests++; return permit } })
  escape(); await pause(60)
  check(closeRequests === 1 && !!document.querySelector('[role="dialog"]'), 'beforeClose can preserve unsaved form')
  permit = true; escape(); await pause(380)
  check(!document.querySelector('[role="dialog"]'), 'beforeClose can allow dismissal')
  await f.cleanup()
  let guardErrors = 0
  f = await mount(ADialog, { title: 'Failed guard', beforeClose: async () => { throw new Error('fixture') }, onCloseError: () => guardErrors++ })
  escape(); await pause(60)
  check(guardErrors === 1 && !!document.querySelector('[role="dialog"]'), 'rejected guard emits close-error and leaves the modal open')
  await f.cleanup()
  f = await mount(ADialog, { title: 'Focus fallback', initialFocus: '[' }, { default: () => [h('input', { hidden: true }), h('input', { id: 'visible-field' })] })
  check(document.activeElement?.id === 'visible-field', 'invalid initial selector and hidden field fall back to first visible field')
  await f.cleanup()
  trigger.focus()
  f = await mount(ADialog, { title: 'Controlled', open: false })
  check(!document.querySelector('[role="dialog"]') && document.activeElement === trigger, 'closed controlled dialog does not capture focus')
  f.props.open = true; await pause()
  check(!!document.querySelector('[role="dialog"]') && document.body.style.overflow === 'hidden', 'controlled open activates focus and scroll lock')
  f.props.open = false; await pause(380)
  check(!document.querySelector('[role="dialog"]') && document.activeElement === trigger, 'external close also returns focus')
  await f.cleanup()
  f = await mount(ADialog, { title: 'Protected', dismissible: false })
  escape(); document.querySelector<HTMLElement>('.a-overlay-scrim')!.click(); await pause(380)
  check(!!document.querySelector('[role="dialog"]') && document.querySelector<HTMLButtonElement>('[aria-label="Close"]')?.disabled, 'dismissible=false blocks Escape, scrim and close button')
  await f.cleanup()
  check(document.body.style.overflow === 'scroll', 'external unmount releases modal lock')

  const parent = await mount(ASheet, { title: 'Parent', variant: 'side' }, { default: () => h('button', { id: 'nested-trigger' }, 'Next') })
  const nestedTrigger = document.getElementById('nested-trigger')!
  nestedTrigger.focus()
  let childCloses = 0
  const child = await mount(ADialog, { title: 'Child', onClose: () => childCloses++ })
  escape(); await pause(380)
  check(childCloses === 1 && document.querySelectorAll('[role="dialog"]').length === 1, 'only topmost overlay receives Escape')
  check(document.activeElement === nestedTrigger && document.body.style.overflow === 'hidden', 'nested close restores parent focus without unlocking body')
  await child.cleanup(); await parent.cleanup()
  check(document.body.style.overflow === 'scroll', 'final nested unmount restores body')
  f = await mount(ASheet, { title: 'Nonmodal', variant: 'side', modal: false })
  trigger.focus()
  check(document.activeElement === trigger && document.body.style.overflow === 'scroll' && !document.querySelector('[aria-modal="true"]'), 'nonmodal side sheet leaves background operable')
  await f.cleanup()

  trigger.focus(); let legacyClose = 0
  f = await mount(ABottomSheet, { label: 'Legacy', onClose: () => legacyClose++ }, { default: () => 'Legacy content' })
  check(document.querySelector('[role="dialog"]')?.getAttribute('aria-label') === 'Legacy', 'legacy label contract preserved')
  escape(); await pause(380)
  check(legacyClose === 1 && document.activeElement === trigger, 'legacy delayed close/return focus preserved')
  await f.cleanup()
  let confirm = 0, cancel = 0
  f = await mount(AConfirmDialog, { label: 'Confirm', message: 'Consequence', confirmLabel: 'Record', onConfirm: () => confirm++, onCancel: () => cancel++ })
  byText(document, 'Record').click(); check(confirm === 1 && cancel === 0, 'confirmation preserves explicit action event')
  byText(document, 'Cancel').click(); check(cancel === 1, 'confirmation cancel event preserved')
  await f.cleanup(); trigger.remove()
  document.body.style.overflow = ''

  for (const state of ['normal', 'attention', 'warning', 'critical', 'success', 'disabled']) {
    f = await mount(AStatusBadge, { state, label: `State ${state}` })
    check(f.host.textContent?.includes(`State ${state}`) && !!f.host.querySelector('svg[aria-hidden="true"]'), `${state}: visible text plus decorative icon`)
    check(f.host.querySelector('span')?.dataset.state === state, `${state}: semantic state is not backend-coupled`)
    await f.cleanup()
  }
  let backs = 0, actions = 0
  f = await mount(APageHeader, { title: 'People', description: 'Description', context: 'Live', back: true, onBack: () => backs++, breadcrumbs: [{ label: 'Home', to: '/' }, { label: 'People' }] }, { actions: () => h(AButton, { onClick: () => actions++ }, () => 'Create') })
  check(f.host.querySelectorAll('h1').length === 1 && f.host.querySelector('h1')?.textContent === 'People', 'header renders one h1')
  check(f.host.querySelector('[aria-current="page"]')?.textContent === 'People' && f.host.textContent?.includes('Live'), 'breadcrumbs/context rendered')
  byText(f.host, 'Back').click(); byText(f.host, 'Create').click()
  check(backs === 1 && actions === 1, 'header back/actions stay keyboard-capable native controls')
  await f.cleanup()
  f = await mount(APageHeader, { title: 'Slots' }, { description: () => 'Slotted description', context: () => 'Slotted context', breadcrumbs: () => h('span', 'Slotted breadcrumb') })
  check(f.host.textContent?.includes('Slotted description') && f.host.textContent?.includes('Slotted context') && f.host.textContent?.includes('Slotted breadcrumb'), 'header optional slots')
  await f.cleanup()
  f = await mount(APageHeader, { title: 'Detail', breadcrumbs: [{ label: 'Parent', to: '/' }, { label: 'Detail', to: '/next' }] })
  check(byText(f.host, 'Back').getAttribute('href') === '/', 'compact back derives the parent breadcrumb, never the current page')
  await f.cleanup()

  const snackbar = useSnackbar()
  while (snackbar.current.value) snackbar.dismiss()
  f = await mount(ASnackbar)
  const duplicate = await mount(ASnackbar)
  snackbar.showSnackbar({ message: 'Saved', duration: 0 })
  snackbar.showSnackbar({ message: 'Sent', duration: 0 })
  await pause()
  check(document.querySelectorAll('[role="status"]').length === 1 && document.querySelector('[role="status"]')?.textContent?.includes('Saved'), 'single global snackbar host shows first message')
  check(!document.querySelector('[role="status"]')?.textContent?.includes('Sent'), 'queued message not rendered concurrently')
  document.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')!.click(); await pause(380)
  check(document.querySelector('[role="status"]')?.textContent?.includes('Sent'), 'dismiss advances queue')
  snackbar.dismiss(); await pause(380)
  let actionRuns = 0
  snackbar.showSnackbar({ message: 'Changed', duration: 0, action: { label: 'Undo', onClick: () => { actionRuns++ } } }); await pause(380)
  byText(document, 'Undo').click(); await pause(380)
  check(actionRuns === 1 && !snackbar.current.value, 'snackbar action runs then dismisses')
  await f.cleanup()
  check(document.querySelectorAll('[role="status"]').length === 1, 'remaining host takes ownership')
  await duplicate.cleanup()
  return { checks }
}
