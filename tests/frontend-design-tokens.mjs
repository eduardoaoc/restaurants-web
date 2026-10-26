import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compile } from '@tailwindcss/node'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const design = read('docs/design/DESIGN_SYSTEM.md')
const tokens = read('src/styles/tokens-v2.css')
const entry = read('src/style.css')
const declarations = css => Object.fromEntries([...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]))
const light = declarations(tokens.split(':root {')[0])
const systemDark = declarations(tokens.split(":root:not([data-theme='light']) {")[1].split('\n  }')[0])
const forcedDark = declarations(tokens.split(":root[data-theme='dark'] {")[1].split('\n}')[0])
assert.deepEqual(systemDark, forcedDark, 'System and explicit dark must have identical values')
const dark = { ...light, ...forcedDark }

// The document is the authority: check every published color, including pairs.
let colorCount = 0
for (const [section, theme] of [['3.3 Light', light], ['3.4 Dark', dark]]) {
  const table = design.split(`### ${section}`)[1].split('\n### ')[0]
  for (const row of table.split('\n').filter(line => line.startsWith('| `'))) {
    const cells = row.split('|')
    const roles = [...cells[1].matchAll(/`([\w-]+)`/g)].map(m => m[1])
    const hexes = [...cells[2].matchAll(/#[\da-f]{6}/gi)].map(m => m[0].toLowerCase())
    if (hexes.length) {
      roles.forEach((role, index) => {
        assert.equal(theme[`--color-${role}`], hexes[index], `${section}: ${role}`)
        colorCount++
      })
    } else if (roles[0] === 'scrim') {
      assert.equal(theme['--color-scrim'].replaceAll(' ', ''), cells[2].match(/rgba\([^)]+\)/)[0])
      colorCount++
    }
  }
}
assert.equal(colorCount, 50, 'All 25 colors must be checked in both themes')

const luminance = hex => {
  const channels = hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
}
const contrast = (a, b) => {
  const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y)
  return (hi + .05) / (lo + .05)
}
let contrastCount = 0
for (const [name, theme] of [['light', light], ['dark', dark]]) {
  const check = (fg, bg, min) => {
    const ratio = contrast(theme[`--color-${fg}`], theme[`--color-${bg}`])
    assert.ok(ratio >= min, `${name}: ${fg}/${bg} = ${ratio.toFixed(2)} < ${min}`)
    contrastCount++
  }
  for (const bg of ['background', 'surface', 'surface-subtle', 'surface-elevated']) {
    for (const fg of ['text-primary', 'text-secondary', 'text-tertiary', 'primary-text']) check(fg, bg, 4.5)
    check('border-strong', bg, 3)
    check('focus-ring', bg, 3)
  }
  check('primary-text', 'primary-subtle', 4.5)
  for (const fill of ['primary', 'primary-hover', 'primary-active']) check('on-primary', fill, 4.5)
  for (const status of ['success', 'warning', 'danger', 'info']) {
    check(status, 'surface', 4.5)
    check(status, `${status}-subtle`, 4.5)
  }
}

// Exercise the actual Tailwind compiler: declarations alone miss precedence,
// opacity modifiers, and cyclic/missing utility mappings.
const compiler = await compile(entry, { base: new URL('../src', import.meta.url).pathname, onDependency() {} })
const semantic = [
  'bg-background', 'bg-surface', 'bg-surface-subtle', 'bg-surface-elevated',
  'text-fg', 'text-fg-muted', 'text-fg-subtle', 'text-accent',
  'border-hairline', 'border-control', 'ring-focus', 'ring-accent',
  'bg-primary', 'bg-primary/40', 'bg-primary-subtle', 'hover:bg-primary-hover', 'active:bg-primary-active',
  'text-success', 'text-warning', 'text-danger', 'text-info',
  'bg-success-subtle', 'bg-warning-subtle', 'bg-danger-subtle', 'bg-info-subtle',
  'rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-saloa-sm', 'rounded-saloa-md', 'rounded-saloa-lg',
  'shadow-flat', 'shadow-raised', 'shadow-floating', 'shadow-modal', 'shadow-card', 'shadow-elevated',
  'duration-instant', 'duration-fast', 'duration-base', 'duration-slow', 'ease-out', 'ease-saloa-out',
  'w-pane-detail', 'w-sidebar', 'w-rail', 'max-w-form', 'max-w-dialog-sm', 'max-w-dialog-md',
  'z-(--z-menu)', 'gap-1', 'gap-4', 'gap-6',
  'text-body-md', 'text-display', 'bg-error-container', 'text-on-error-container',
]
const compatibility = ['text', 'border', 'ring', 'outline'].flatMap(prefix => [
  `${prefix}-primary`, `${prefix}-primary/30`, `${prefix}-primary/[35%]`,
  `focus-visible:${prefix}-primary`, `hover:${prefix}-primary`, `peer-focus-visible:${prefix}-primary`,
])
const css = compiler.build([...semantic, ...compatibility])
const escape = s => s.replace(/[^\w-]/g, c => `\\${c}`)
for (const candidate of [...semantic, ...compatibility]) assert.ok(css.includes(`.${escape(candidate)}`), `Missing utility: ${candidate}`)
assert.ok(!css.includes('--modifier(') && !css.includes('--value('), 'No unresolved compiler functions')

// Higher-specificity compatibility rules must win over core utilities,
// including variants/opacity, without overriding any background property.
for (const [prefix, property, token] of [
  ['text', 'color', 'primary-text'], ['border', 'border-color', 'primary-text'],
  ['ring', '--tw-ring-color', 'primary-text'], ['outline', 'outline-color', 'focus-ring'],
]) {
  const selector = `.${prefix}-primary.${prefix}-primary {`
  const block = css.split(selector)[1]?.split('}')[0]
  assert.ok(block?.includes(`${property}: var(--color-${token})`), selector)
  assert.ok(!block.includes('background') && !block.includes('--color-primary:'), 'Compatibility must not modify fills')
  assert.ok(css.includes(`.${prefix}-primary\\/30.${prefix}-primary\\/30`), `${prefix}: opacity specificity`)
  assert.ok(css.includes(`var(--color-${token}) calc(30 * 1%)`), `${prefix}: opacity role`)
}
assert.match(css, /\.bg-primary \{\s*background-color: var\(--color-primary\);/)
for (const level of ['flat', 'raised', 'floating', 'modal']) {
  assert.ok(css.includes(`.shadow-${level} {\n    --tw-shadow: var(--elevation-${level});`), 'Shadows must resolve at runtime for dark mode')
}
assert.equal(declarations(tokens.split('@media (prefers-color-scheme: dark)')[0])['--elevation-flat'], '0 0 transparent', 'No invalid none inside composed shadows')
assert.equal(forcedDark['--elevation-raised'], 'var(--elevation-flat)', 'Dark raised uses tonal surface + hairline')
assert.match(css, /:root, :root\[data-theme\], :root:not\(\[data-theme=['"]light['"]\]\) \{\s*--md-sys-color-primary: var\(--color-primary\);/, 'Legacy aliases must match OS-dark selector specificity as well as explicit themes')
for (const [size, shape] of [['sm', 'small'], ['md', 'medium'], ['lg', 'large']]) {
  assert.ok(css.includes(`.rounded-${size} {\n    border-radius: var(--shape-corner-${shape});`), 'Legacy radius preserved')
  assert.ok(css.includes(`.rounded-saloa-${size} {\n    border-radius: var(--radius-${size});`), 'V2 radius opt-in')
}
assert.match(css, /--spacing: 0\.25rem;/, 'Keep the existing spacing scale')
assert.match(css, /\.ease-out \{\s*--tw-ease: cubic-bezier\(0, 0, 0\.2, 1\);/, 'Legacy motion preserved')
assert.match(css, /\.ease-saloa-out \{\s*--tw-ease: var\(--ease-out\);/)
assert.match(css, /--font-sans-family:\s*ui-sans-serif, system-ui,/, 'Native font stack preserved')
console.log(`PASS: ${colorCount} documented colors, ${contrastCount} WCAG pairs, ${semantic.length + compatibility.length} compiled utilities; legacy fills/radius/type/motion preserved`)
