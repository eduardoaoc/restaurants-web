// Structural validation, not a substitute for a browser layout engine.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
const { createApp, TestElement } = await import('./support/primitives-runtime.mjs')
const { h, nextTick } = await import('vue')
const { createI18n } = await import('vue-i18n')
const ADialog = (await import('../src/components/ui/ADialog.vue')).default
const ASheet = (await import('../src/components/ui/ASheet.vue')).default
const AButton = (await import('../src/components/ui/AButton.vue')).default
const APageHeader = (await import('../src/components/ui/APageHeader.vue')).default
const AStatusBadge = (await import('../src/components/ui/AStatusBadge.vue')).default
const ASnackbar = (await import('../src/components/ui/ASnackbar.vue')).default
const { useSnackbar } = await import('../src/composables/useSnackbar.ts')
const { readViewportGeometry } = await import('../src/composables/useVisualViewport.ts')
const { findSnackbarTop } = await import('../src/components/ui/snackbar-placement.ts')
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const styles = path => postcss.parse(path.endsWith('.vue') ? read(path).split('<style scoped>')[1].split('</style>')[0] : read(path))
const controlCSS = styles('src/components/ui/button.css')
const overlayCSS = styles('src/components/ui/AOverlay.vue')
const headerCSS = styles('src/components/ui/APageHeader.vue')
const badgeCSS = styles('src/components/ui/AStatusBadge.vue')
const snackCSS = styles('src/components/ui/ASnackbar.vue')

function mediaMatches(query, env) {
  return query.split(',').some(part => [...part.matchAll(/\(([^:]+):\s*([^)]+)\)/g)].every(([, feature, value]) => {
    if (feature.includes('width') || feature.includes('height')) {
      const size = parseFloat(value) * (value.endsWith('rem') ? 16 : 1)
      const actual = feature.includes('width') ? env.width : env.height
      return feature.startsWith('min-') ? actual >= size : actual <= size
    }
    return ({ pointer: env.pointer, 'any-pointer': env.anyPointer, hover: env.hover, 'prefers-color-scheme': 'light', 'prefers-reduced-motion': 'no-preference' })[feature] === value
  }))
}
function selectorMatches(el, selector) {
  if (/:(?:deep|global|is|focus|active|hover)|::|a-overlay-(?:enter|leave)/.test(selector)) return false
  const pieces = selector.trim().replace(/\s*>\s*/g, ' ').split(/\s+/)
  if (!el.matches(pieces.pop())) return false
  let parent = el.parentNode
  while (pieces.length) {
    const piece = pieces.pop()
    while (parent && !(parent instanceof TestElement && parent.matches(piece))) parent = parent.parentNode
    if (!parent) return false
    parent = parent.parentNode
  }
  return true
}
function cascade(css, el, env) {
  const result = {}, ranks = {}
  let order = 0
  css.walkRules(rule => {
    order++
    for (let parent = rule.parent; parent; parent = parent.parent) if (parent.type === 'atrule' && parent.name === 'media' && !mediaMatches(parent.params, env)) return
    for (const selector of rule.selectors) {
      if (!selectorMatches(el, selector)) continue
      const specificity = (selector.match(/\.[\w-]+|\[[^\]]+\]/g) ?? []).length
      const rank = specificity * 10000 + order
      rule.each(decl => {
        if (decl.type !== 'decl') return
        if (rank >= (ranks[decl.prop] ?? -1)) { result[decl.prop] = decl.value; ranks[decl.prop] = rank }
      })
    }
  })
  return result
}
function length(value, env, parent) {
  if (value === undefined || value === 'auto') return null
  let text = value.replace(/var\(--spacing\)/g, `${env.font / 4}px`)
    .replace(/var\(--pane-detail\)/g, '420px').replace(/var\(--dialog-md\)/g, '560px').replace(/var\(--dialog-sm\)/g, '400px')
  if (text.startsWith('min(')) return Math.min(...text.slice(4, -1).split(',').map(part => length(part.trim(), env, parent)))
  const calc = text.match(/^calc\(([\d.]+)px \* ([\d.]+)\)$/)
  if (calc) return Number(calc[1]) * Number(calc[2])
  if (text.endsWith('%')) return parseFloat(text) * parent / 100
  if (/^[\d.]+px$/.test(text)) return parseFloat(text)
  if (/^[\d.]+rem$/.test(text)) return parseFloat(text) * env.font
  throw new Error(`Unsupported structural length: ${value}`)
}
function element(className, attrs = {}, parent) {
  const el = document.createElement('div'); el.className = className
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value))
  parent?.appendChild(el)
  return el
}
let scenarios = 0
for (const [width, height] of [[375, 812], [768, 1024], [1024, 768], [1440, 900], [812, 375], [900, 1440]]) {
  for (const pointer of ['fine', 'coarse', 'hybrid']) {
    for (const mode of ['normal', 'zoom-200', 'text-200']) {
      const zoom = mode === 'zoom-200' ? 2 : 1
      const env = { width: width / zoom, height: height / zoom, font: mode === 'text-200' ? 32 : 16, pointer: pointer === 'coarse' ? 'coarse' : 'fine', anyPointer: pointer === 'fine' ? 'fine' : 'coarse', hover: pointer === 'coarse' ? 'none' : 'hover' }
      const available = env.width - env.font * 2
      for (const size of ['sm', 'md', 'lg']) {
        const control = element('a-control', { 'data-size': size, 'data-icon-only': 'true' })
        const css = cascade(controlCSS, control, env)
        const min = pointer === 'fine' && size === 'sm' ? env.font * 2 : env.font * (pointer === 'fine' ? 2.75 : 3)
        assert.ok(length(css['min-height'], env) >= min, `${width}/${pointer}/${mode}/${size}: target height`)
        assert.ok(length(css['min-width'], env) >= min, `${width}/${pointer}/${mode}/${size}: target width`)
        assert.equal(length(css['max-width'], env, available), available)
        const visualWidth = Math.max(length(css.width, env), length(css['min-width'], env))
        assert.ok(visualWidth <= available, 'icon target fits available width at 200%')
        if (size === 'lg') assert.ok(length(css['min-height'], env) >= env.font * 3.25, 'lg density is not reduced')
      }
      for (const kind of ['dialog', 'bottom', 'side']) {
        const root = element('a-overlay-root', { 'data-kind': kind, 'data-full-height': env.height <= env.font * 32 ? 'true' : 'false' })
        const panel = element('a-overlay-panel', { 'data-size': 'sm' }, root)
        const css = cascade(overlayCSS, panel, env)
        assert.ok(length(css.width, env, available) <= available, 'panel is contained by the viewport')
        assert.ok(length(css['max-height'], env, env.height) <= env.height, 'panel height is constrained')
        assert.equal(css['overflow-wrap'], 'anywhere', 'long headings/content can reflow')
      }
      scenarios++
    }
  }
}
// Check the enabling conditions, rather than pretending to measure text layout.
const base = { width: 375, height: 812, font: 16, pointer: 'coarse', anyPointer: 'coarse', hover: 'none' }
assert.equal(cascade(controlCSS, element('a-control-label'), base)['overflow-wrap'], 'anywhere')
assert.equal(cascade(controlCSS, element('a-control-label'), base)['white-space'], 'normal')
const badge = element('a-status-badge'), label = document.createElement('span'); badge.appendChild(label)
assert.equal(cascade(badgeCSS, label, base)['overflow-wrap'], 'anywhere')
assert.equal(cascade(badgeCSS, label, base)['white-space'], 'normal')
assert.equal(cascade(headerCSS, element('a-page-actions'), base).width, '100%')
assert.equal(cascade(headerCSS, element('a-page-header-row'), base)['flex-wrap'], 'wrap')
assert.equal(cascade(snackCSS, element('a-snackbar-panel'), base)['grid-template-columns'], 'auto minmax(0, 1fr) auto')
assert.equal(cascade(snackCSS, element('a-snackbar-action'), base)['overflow-wrap'], 'anywhere')
for (const file of [overlayCSS, snackCSS]) {
  const css = file.toString()
  assert.ok(css.includes('env(safe-area-inset-top)') && css.includes('env(safe-area-inset-bottom)'), 'top and bottom safe areas are accounted for')
}
assert.ok(![controlCSS, overlayCSS, headerCSS, badgeCSS, snackCSS].some(css => /text-overflow:\s*ellipsis|line-clamp:/.test(css)), 'essential labels are never truncated')
console.log(`PASS: CSS cascade contracts for ${scenarios} viewport/pointer/zoom scenarios (no layout engine)`)

// Geometry tests run the production algorithm against CTA/focus rectangles.
for (const [width, height] of [[375, 812], [768, 1024], [1024, 768], [1440, 900]]) {
  const bounds = { top: 60, bottom: height - 50, left: 16, right: width - 16 }
  const cta = { top: height - 120, bottom: height - 56, left: 16, right: width - 16 }
  const top = findSnackbarTop(bounds, 100, [cta], 8)
  assert.ok(top >= bounds.top && top + 100 <= cta.top - 8, 'snackbar sits clear of bottom CTA')
  assert.equal(findSnackbarTop(bounds, height, [cta], 8), null, 'insufficient space is explicit, not an obscured CTA')
  assert.equal(findSnackbarTop(bounds, 100, [bounds], 8), null, 'a dense control region defers feedback instead of covering controls')
  const split = findSnackbarTop(bounds, 100, [{ ...bounds, top: 200, bottom: 400 }], 8)
  assert.ok(split + 100 <= 192 || split >= 408, 'both top and bottom obstacles are respected')
}

const copy = {
  pt: 'Confirmar e guardar todas as alterações do estabelecimento',
  es: 'Confirmar y guardar todos los cambios del establecimiento',
  en: 'Confirm and save all changes to the restaurant configuration',
}
const tick = async () => { await nextTick(); await new Promise(resolve => setTimeout(resolve, 10)); await nextTick() }
const i18n = () => createI18n({ legacy: false, locale: 'en', messages: { en: { common: { close: 'Close', back: 'Back', dismiss: 'Dismiss' } } } })
for (const text of Object.values(copy)) {
  const host = document.createElement('main'); document.body.appendChild(host)
  const app = createApp({ render: () => h('div', [h(AButton, {}, () => text), h(APageHeader, { title: text, description: text }, { actions: () => h(AButton, {}, () => text) }), h(AStatusBadge, { state: 'attention', label: text })]) }).use(i18n())
  app.mount(host); await tick()
  assert.equal(host.querySelector('h1').textContent, text)
  assert.equal(host.querySelector('.a-control-label').textContent, text)
  assert.ok(host.querySelector('.a-status-badge').textContent.includes(text), 'long translated meaning is retained')
  app.unmount(); host.remove()
}

class Viewport extends EventTarget {
  width = 375; height = 812; offsetTop = 0; offsetLeft = 0; scale = 1
  listeners = new Set()
  addEventListener(name, listener, options) { this.listeners.add(listener); super.addEventListener(name, listener, options) }
  removeEventListener(name, listener, options) { super.removeEventListener(name, listener, options); this.listeners.delete(listener) }
}
for (const component of [ADialog, ASheet]) {
  const viewport = new Viewport()
  window.visualViewport = viewport
  window.innerWidth = 375; window.innerHeight = 812
  const host = document.createElement('main'); document.body.appendChild(host)
  const app = createApp({ render: () => h(component, { title: copy.pt }, { default: () => h('input', { id: 'keyboard-field' }), footer: () => h(AButton, {}, () => copy.es) }) }).use(i18n())
  app.mount(host); await tick()
  const root = document.querySelector('.a-overlay-root'), field = document.getElementById('keyboard-field')
  field.value = 'preserved'
  for (const [width, height] of [[375, 812], [768, 1024], [1024, 768], [1440, 900], [812, 375]]) {
    viewport.width = window.innerWidth = width; viewport.height = window.innerHeight = height
    viewport.dispatchEvent(new Event('resize')); await tick()
    assert.equal(root.style.width, `${width}px`); assert.equal(root.style.height, `${height}px`)
    assert.equal(field.value, 'preserved'); assert.equal(document.activeElement, field, 'rotation keeps state and focus')
  }
  viewport.height = 360; viewport.offsetTop = 44
  const body = document.querySelector('.a-overlay-body'); body.scrollTop = 0
  body.getBoundingClientRect = () => ({ top: 100, bottom: 240 })
  field.getBoundingClientRect = () => ({ top: 300, bottom: 348 })
  viewport.dispatchEvent(new Event('resize')); await tick()
  assert.equal(root.style.height, '360px'); assert.equal(root.style.top, '44px')
  assert.equal(root.dataset.fullHeight, 'true', 'keyboard enables full-height panel')
  assert.equal(body.scrollTop, 108, 'focused field is revealed inside the body scroller')
  viewport.scale = 2; viewport.width = 187.5
  assert.equal(readViewportGeometry().keyboard, false, 'pinch zoom does not masquerade as keyboard')
  viewport.dispatchEvent(new Event('scroll')); await tick()
  assert.equal(root.style.width, '187.5px', '200% visual viewport is reflected')
  app.unmount(); host.remove(); await tick()
  assert.equal(viewport.listeners.size, 0, 'viewport subscriptions are released')
}
delete window.visualViewport
window.innerHeight = 768; window.innerWidth = 1024
assert.equal(readViewportGeometry().height, 768, 'innerHeight fallback without VisualViewport')
// Exercise placement + queue integration using explicit geometry (not layout).
const viewport = new Viewport(); window.visualViewport = viewport
window.innerWidth = 375; window.innerHeight = 812
const previousComputedStyle = globalThis.getComputedStyle
globalThis.getComputedStyle = el => el.classList.contains('a-snackbar-host') ? { paddingTop: '16px', paddingBottom: '72px', rowGap: '8px' } : previousComputedStyle(el)
const cta = document.createElement('button'); document.body.appendChild(cta)
cta.getBoundingClientRect = () => ({ top: 680, bottom: 740, left: 16, right: 359 })
const host = document.createElement('main'); document.body.appendChild(host)
const app = createApp(ASnackbar).use(i18n()); app.mount(host); await tick()
const snackbar = useSnackbar()
snackbar.showSnackbar({ message: copy.pt, duration: 100 })
await tick()
const toastHost = document.querySelector('.a-snackbar-host'), toast = document.querySelector('.a-snackbar-panel')
toastHost.getBoundingClientRect = () => ({ top: 0, bottom: 812, left: 0, right: 375 })
toast.getBoundingClientRect = () => ({ top: 640, bottom: 740, left: 16, right: 359, width: 343, height: 100 })
viewport.dispatchEvent(new Event('resize')); await tick()
assert.equal(toast.style.marginTop, '556px', 'mounted snackbar moves above unfocused CTA')
cta.getBoundingClientRect = () => ({ top: 0, bottom: 812, left: 0, right: 375 })
viewport.dispatchEvent(new Event('resize')); await tick()
assert.equal(toastHost.dataset.deferred, 'true', 'no-space fallback does not obscure controls')
await new Promise(resolve => setTimeout(resolve, 130))
assert.ok(snackbar.current.value, 'deferred message does not expire invisibly')
cta.getBoundingClientRect = () => ({ top: -100, bottom: -50, left: 0, right: 375 })
viewport.dispatchEvent(new Event('resize')); await tick()
assert.ok(!toastHost.hasAttribute('data-deferred'), 'feedback resumes when space returns')
await new Promise(resolve => setTimeout(resolve, 130))
assert.equal(snackbar.current.value, null, 'visible message resumes its remaining timeout')
// A touch interrupted by host unmount must not freeze a replacement host.
snackbar.showSnackbar({ message: copy.es, duration: 100 }); await tick()
const touch = new Event('pointerdown', { bubbles: true })
Object.defineProperty(touch, 'pointerType', { value: 'touch' })
document.querySelector('.a-snackbar-panel').dispatchEvent(touch)
const replacementHost = document.createElement('main'); document.body.appendChild(replacementHost)
const replacement = createApp(ASnackbar).use(i18n()); replacement.mount(replacementHost); await tick()
app.unmount(); host.remove(); await tick()
await new Promise(resolve => setTimeout(resolve, 130))
assert.equal(snackbar.current.value, null, 'host transfer releases a pending touch pause')
replacement.unmount(); replacementHost.remove(); cta.remove()
globalThis.getComputedStyle = previousComputedStyle
delete window.visualViewport
console.log('PASS: PT/ES/EN text retention, CTA placement/queue integration, keyboard/rotation/200% viewport geometry, internal focus reveal and cleanup')
