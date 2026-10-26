// Test-only Vue host. Executes real client SFCs/events/lifecycles without an
// installed browser/DOM package. Does not model CSS, layout, or native Tab.
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { parse, compileScript } from '@vue/compiler-sfc'
import ts from 'typescript'

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) specifier = pathToFileURL(resolve('src', specifier.slice(2))).href
    if (specifier.startsWith('.') || specifier.startsWith('file:')) {
      const url = new URL(specifier, context.parentURL ?? pathToFileURL(`${process.cwd()}/`).href)
      if (!existsSync(fileURLToPath(url)) && existsSync(`${fileURLToPath(url)}.ts`)) return next(`${url.href}.ts`, context)
    }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', source: 'export {}', shortCircuit: true }
    if (url.endsWith('.vue') || url.endsWith('.ts')) {
      let source = readFileSync(new URL(url), 'utf8')
      if (url.endsWith('.vue')) {
        const { descriptor } = parse(source, { filename: fileURLToPath(url) })
        source = compileScript(descriptor, { id: url, inlineTemplate: true, fs: { fileExists: existsSync, readFile: file => readFileSync(file, 'utf8') }, templateOptions: { compilerOptions: { hoistStatic: false } } }).content
      }
      return { format: 'module', source: ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: true } }).outputText, shortCircuit: true }
    }
    return next(url, context)
  },
})

const observers = new Set()
let doc
class TestNode {
  constructor(type, text = '') { Object.defineProperty(this, '__v_skip', { value: true }); this.nodeType = type; this.text = text; this.parentNode = null; this.childNodes = []; this.listeners = new Map() }
  get ownerDocument() { return doc }
  get nextSibling() { return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this) + 1] ?? null }
  get isConnected() { return !!doc?.documentElement?.contains(this) }
  get children() { return this.childNodes.filter(n => n.nodeType === 1) }
  get firstElementChild() { return this.children[0] ?? null }
  get textContent() { return this.nodeType === 1 ? this.childNodes.filter(n => n.nodeType !== 8).map(n => n.textContent).join('') : this.text }
  set textContent(value) { this.childNodes.forEach(n => { n.parentNode = null }); this.childNodes = []; if (value) this.appendChild(new TestNode(3, String(value))) }
  contains(node) { return node === this || this.childNodes.some(child => child.contains(node)) }
  appendChild(node) { return this.insertBefore(node, null) }
  insertBefore(node, anchor) {
    node.parentNode?.removeChild(node)
    const index = anchor ? this.childNodes.indexOf(anchor) : -1
    this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, node)
    node.parentNode = this
    if (this === doc?.body) queueMicrotask(() => observers.forEach(o => o.callback([{ target: this }])))
    return node
  }
  removeChild(node) { const index = this.childNodes.indexOf(node); if (index >= 0) this.childNodes.splice(index, 1); node.parentNode = null; return node }
  remove() { this.parentNode?.removeChild(this) }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener) }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener) }
  dispatchEvent(event) {
    Object.defineProperty(event, 'target', { configurable: true, value: this })
    let node = this
    do {
      Object.defineProperty(event, 'currentTarget', { configurable: true, value: node })
      for (const handler of node.listeners.get(event.type) ?? []) handler(event)
      node = event.bubbles && !event.cancelBubble ? node.parentNode : null
    } while (node)
    return !event.defaultPrevented
  }
}
export class TestElement extends TestNode {
  constructor(tag) {
    super(1); this.tagName = tag.toUpperCase(); this.attrs = new Map(); this.style = { overflow: '', paddingRight: '', display: '', setProperty(name, value) { this[name] = value }, removeProperty(name) { delete this[name] } }; this.disabled = false; this.value = ''
    this.classList = { add: (...names) => { const set = new Set(this.className.split(/\s+/).filter(Boolean)); names.forEach(n => set.add(n)); this.className = [...set].join(' ') }, remove: (...names) => { this.className = this.className.split(/\s+/).filter(n => !names.includes(n)).join(' ') }, contains: name => this.className.split(/\s+/).includes(name) }
    this.dataset = new Proxy({}, { get: (_, key) => this.getAttribute(`data-${String(key).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`), set: (_, key, value) => { this.setAttribute(`data-${String(key).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`, value); return true } })
  }
  get className() { return this.getAttribute('class') ?? '' }
  set className(value) { this.setAttribute('class', value) }
  get id() { return this.getAttribute('id') ?? '' }
  get inert() { return this.hasAttribute('inert') }
  set inert(value) { value ? this.setAttribute('inert', '') : this.removeAttribute('inert') }
  get tabIndex() { const attr = this.getAttribute('tabindex'); return attr === null ? (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(this.tagName) || this.tagName === 'A' && this.hasAttribute('href') ? 0 : -1) : Number(attr) }
  set tabIndex(value) { this.setAttribute('tabindex', value) }
  setAttribute(name, value) { this.attrs.set(name, String(value)); if (name === 'disabled') this.disabled = true }
  getAttribute(name) { return this.attrs.get(name) ?? null }
  hasAttribute(name) { return this.attrs.has(name) }
  removeAttribute(name) { this.attrs.delete(name); if (name === 'disabled') this.disabled = false }
  matches(selector) {
    return selector.split(',').some(part => {
      let s = part.trim()
      for (const match of [...s.matchAll(/:not\(([^)]+)\)/g)]) { if (this.matches(match[1])) return false; s = s.replace(match[0], '') }
      if (s.includes(':disabled')) { if (!this.disabled) return false; s = s.replace(':disabled', '') }
      for (const match of s.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']+)["']?)?\]/g)) if (!this.hasAttribute(match[1]) || match[2] !== undefined && this.getAttribute(match[1]) !== match[2]) return false
      s = s.replace(/\[[^\]]+\]/g, '')
      for (const match of s.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(match[1])) return false
      s = s.replace(/\.[\w-]+/g, '')
      if (s.startsWith('#')) return this.id === s.slice(1)
      return !s || s === '*' || this.tagName === s.toUpperCase()
    })
  }
  closest(selector) { for (let el = this; el instanceof TestElement; el = el.parentNode) if (el.matches(selector)) return el; return null }
  querySelectorAll(selector) { const out = []; const visit = node => { for (const child of node.children) { if (child.matches(selector)) out.push(child); visit(child) } }; visit(this); return out }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null }
  getClientRects() { return this.closest('[hidden], [inert]') || this.style.display === 'none' ? [] : [{}] }
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } }
  focus() {
    if (this.disabled || this.closest('[inert]') || !this.isConnected) return
    const previous = doc.activeElement
    doc.activeElement = this
    if (previous !== this) {
      const out = new Event('focusout', { bubbles: true }); Object.defineProperty(out, 'relatedTarget', { value: this }); previous?.dispatchEvent(out)
      const event = new Event('focusin', { bubbles: true }); Object.defineProperty(event, 'relatedTarget', { value: previous }); this.dispatchEvent(event)
    }
  }
  click() { if (!this.disabled) this.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) }
}
doc = new TestNode(9)
doc.documentElement = new TestElement('html')
doc.body = new TestElement('body')
doc.appendChild(doc.documentElement); doc.documentElement.appendChild(doc.body)
doc.activeElement = doc.body
doc.documentElement.clientWidth = 1024
doc.createElement = tag => new TestElement(tag)
doc.createElementNS = (_, tag) => new TestElement(tag)
doc.createTextNode = text => new TestNode(3, text)
doc.createComment = text => new TestNode(8, text)
doc.querySelectorAll = selector => doc.documentElement.querySelectorAll(selector)
doc.querySelector = selector => selector === 'body' ? doc.body : doc.documentElement.querySelector(selector)
doc.getElementById = id => doc.querySelector(`#${id}`)
globalThis.document = doc
globalThis.HTMLElement = TestElement
globalThis.Element = TestElement
globalThis.SVGElement = TestElement
globalThis.Node = TestNode
globalThis.MouseEvent = class extends Event { constructor(type, options = {}) { super(type, options); for (const name of ['button', 'ctrlKey', 'metaKey', 'shiftKey', 'altKey']) this[name] = options[name] ?? (name === 'button' ? 0 : false) } }
globalThis.KeyboardEvent = class extends Event { constructor(type, options = {}) { super(type, options); this.key = options.key; this.shiftKey = !!options.shiftKey } }
globalThis.MutationObserver = class { constructor(callback) { this.callback = callback } observe() { observers.add(this) } disconnect() { observers.delete(this) } }
globalThis.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 0)
globalThis.cancelAnimationFrame = clearTimeout
globalThis.getComputedStyle = el => ({ paddingRight: el.style.paddingRight || '0px', transitionDelay: '0s', transitionDuration: '0s', animationDelay: '0s', animationDuration: '0s', transitionProperty: 'none' })
globalThis.history = { state: {}, replaceState() {}, pushState() {} }
globalThis.location = { protocol: 'http:', host: 'localhost', pathname: '/', search: '', hash: '' }
globalThis.window = { innerWidth: 1024, getComputedStyle, requestAnimationFrame, setTimeout, clearTimeout, document: doc, location, history, navigator: globalThis.navigator, addEventListener() {}, removeEventListener() {} }

const { createRenderer } = await import('vue')
export const { createApp } = createRenderer({
  createElement: tag => doc.createElement(tag),
  createText: text => doc.createTextNode(text), createComment: text => doc.createComment(text),
  setText: (node, text) => { node.text = text }, setElementText: (node, text) => { node.textContent = text },
  parentNode: node => node.parentNode, nextSibling: node => node.nextSibling,
  insert: (node, parent, anchor) => parent.insertBefore(node, anchor), remove: node => node.remove(),
  querySelector: selector => doc.querySelector(selector), setScopeId: (el, id) => el.setAttribute(id, ''),
  patchProp(el, key, previous, next) {
    if (key.startsWith('on')) {
      const name = key.slice(2).toLowerCase()
      if (previous) for (const listener of Array.isArray(previous) ? previous : [previous]) el.removeEventListener(name, listener)
      if (next) for (const listener of Array.isArray(next) ? next : [next]) el.addEventListener(name, listener)
    } else if (key === 'style') Object.assign(el.style, next)
    else if (next === null || next === undefined || next === false) el.removeAttribute(key)
    else el.setAttribute(key, next)
  },
})
