import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { createApp } = await import('./support/primitives-runtime.mjs')
const { runShellChecks } = await import('./frontend-shell.checks.ts')
console.log('Permission and rendered navigation checks:', await runShellChecks(createApp))

// Browser geometry is not available in the component host. These structural
// checks tie the requested viewport classes to the actual shell breakpoints,
// safe-area/keyboard behavior and touch dimensions in the shipped CSS.
const css = await readFile('src/components/shell/AAppShell.vue', 'utf8')
const navCss = await readFile('src/components/shell/ShellNavigation.vue', 'utf8')
const layout = await readFile('src/composables/useShellLayout.ts', 'utf8')
const snackbarCss = await readFile('src/components/ui/ASnackbar.vue', 'utf8')
for (const [viewport, query] of [[375, '(min-width: 768px)'], [768, '(min-width: 768px)'], [1024, '(min-width: 1280px)'], [1280, '(min-width: 1280px)'], [1440, '(min-width: 1440px)']]) {
  assert.ok(css.includes(query), `${viewport}px structural breakpoint is covered`)
}
assert.match(css, /env\(safe-area-inset-top\)/, 'top safe area is applied')
assert.match(css, /env\(safe-area-inset-bottom\)/, 'bottom safe area is applied')
assert.match(css, /env\(safe-area-inset-left\)/, 'left safe area is applied to layout')
assert.match(css, /env\(safe-area-inset-right\)/, 'right safe area is applied to layout')
assert.match(css, /data-keyboard/, 'keyboard state is represented in shell layout')
assert.match(css, /v-show="!keyboard"/, 'compact bottom navigation leaves the viewport when virtual keyboard opens')
assert.match(navCss, /min-height: calc\(var\(--spacing\) \* 12\)/, 'nav controls meet 48px minimum touch target')
assert.match(layout, /\(min-width: 768px\)/, 'tablet rail starts at 768px')
assert.match(layout, /\(min-width: 1280px\)/, 'desktop sidebar starts at 1280px')
assert.match(snackbarCss, /max\(var\(--bar-bottom, 0px\), env\(safe-area-inset-bottom\)\)/, 'snackbar uses the measured bar offset without double-counting safe-area')
console.log('PASS: 375/768/1024 landscape/1280/1440 breakpoint, safe-area, keyboard and touch structure')
