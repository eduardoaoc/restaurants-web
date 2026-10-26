import '../src/style.css'
import { createApp, h, nextTick, ref } from 'vue'
import { PhPlus, PhX } from '@phosphor-icons/vue'
import { i18n, type AppLocale } from '../src/i18n'
import AButton from '../src/components/ui/AButton.vue'
import AIconButton from '../src/components/ui/AIconButton.vue'
import APageHeader from '../src/components/ui/APageHeader.vue'
import AStatusBadge from '../src/components/ui/AStatusBadge.vue'
import ADialog from '../src/components/ui/ADialog.vue'
import ASheet from '../src/components/ui/ASheet.vue'
import ASnackbar from '../src/components/ui/ASnackbar.vue'
import { useSnackbar } from '../src/composables/useSnackbar'
import { runPrimitiveChecks } from './frontend-primitives.checks'

let cleanupPreview: (() => void) | undefined
async function preview(locale: AppLocale | 'pt' = 'es-ES') {
  cleanupPreview?.()
  i18n.global.locale.value = locale === 'pt' ? 'en-GB' : locale
  document.documentElement.lang = locale
  const longLabel = locale === 'pt' ? 'Confirmar e guardar todas as alterações do estabelecimento' : locale === 'es-ES' ? 'Confirmar y guardar todos los cambios del establecimiento' : 'Confirm and save all changes to the restaurant configuration'
  const host = document.createElement('main'); host.className = 'mx-auto max-w-5xl p-4 md:p-6'; host.style.paddingBottom = 'calc(var(--spacing) * 20)'; document.body.appendChild(host)
  const dialog = ref(false), bottom = ref(false), side = ref(false), loading = ref(false)
  const app = createApp({ setup: () => () => h('div', { class: 'space-y-6' }, [
    h(APageHeader, { title: longLabel, description: 'Phase 2 responsive fixture — no product routes or screens.' }, { actions: () => h(AButton, { onClick: () => { loading.value = !loading.value }, loading: loading.value }, () => 'Loading') }),
    h('div', { class: 'flex flex-wrap gap-4' }, ['primary', 'secondary', 'ghost', 'danger'].map(variant => h(AButton, { variant }, { default: () => `${variant}: ${longLabel}`, leading: () => h(PhPlus) }))),
    h('div', { class: 'flex flex-wrap gap-4' }, ['sm', 'md', 'lg'].flatMap(size => [h(AButton, { size, variant: 'secondary' }, () => size), h(AIconButton, { label: `Close ${size}`, size }, () => h(PhX))])),
    h('div', { class: 'flex flex-wrap gap-4' }, ['normal', 'attention', 'warning', 'critical', 'success', 'disabled'].map(state => h(AStatusBadge, { state, label: `${state}: ${longLabel}` }))),
    h('div', { class: 'flex flex-wrap gap-4' }, [
      h(AButton, { id: 'open-dialog', onClick: () => { dialog.value = true } }, () => 'Dialog'),
      h(AButton, { id: 'open-bottom', variant: 'secondary', onClick: () => { bottom.value = true } }, () => 'Bottom sheet'),
      h(AButton, { id: 'open-side', variant: 'secondary', onClick: () => { side.value = true } }, () => 'Side sheet'),
      h(AButton, { id: 'open-snackbar', variant: 'ghost', onClick: () => useSnackbar().showSnackbar({ message: longLabel, duration: 0, action: { label: longLabel, onClick() {} } }) }, () => 'Snackbar'),
    ]),
    h(ADialog, { open: dialog.value, 'onUpdate:open': value => { dialog.value = value }, title: longLabel }, {
      default: () => h('label', { class: 'flex flex-col gap-2' }, ['Name', h('input', { id: 'dialog-field', class: 'min-h-11 rounded-saloa-md border border-control bg-surface px-3 text-fg' })]),
      footer: () => h(AButton, { onClick: () => { dialog.value = false } }, () => 'Save'),
    }),
    ...([[bottom, 'bottom'], [side, 'side']] as const).map(([open, variant]) => h(ASheet, { open: open.value, 'onUpdate:open': value => { open.value = value }, variant, title: longLabel }, { default: () => Array.from({ length: 12 }, (_, i) => h('p', { class: 'mb-4' }, `${i + 1}. ${longLabel}`)), footer: () => h(AButton, { onClick: () => { open.value = false } }, () => longLabel) })),
    h('footer', { id: 'fixture-cta', class: 'fixed inset-x-0 bottom-0 flex justify-center bg-surface p-4' }, h(AButton, { onClick() {} }, () => longLabel)),
    h(ASnackbar),
  ]) }).use(i18n)
  app.mount(host)
  cleanupPreview = () => { app.unmount(); host.remove(); while (useSnackbar().current.value) useSnackbar().dismiss() }
  await nextTick()
  return { ready: true }
}
Object.assign(window, { primitiveTests: { runChecks: () => runPrimitiveChecks(createApp), preview } })
