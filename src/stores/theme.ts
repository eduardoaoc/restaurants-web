import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'aforo-theme'

function readPersistedPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch {
    // localStorage unavailable (private mode, disabled) — fall back silently.
  }

  return 'system'
}

export const useThemeStore = defineStore('theme', () => {
  const preference = ref<ThemePreference>(readPersistedPreference())
  const systemPrefersDark = ref(
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  const resolvedTheme = computed<ResolvedTheme>(() =>
    preference.value === 'system' ? (systemPrefersDark.value ? 'dark' : 'light') : preference.value,
  )

  function applyToDom(): void {
    if (preference.value === 'system') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', preference.value)
    }
  }

  function setTheme(next: ThemePreference): void {
    preference.value = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Preference just won't survive a reload — not fatal.
    }
    applyToDom()
  }

  /** Call once at startup: applies the resolved theme and starts listening for OS changes. */
  function init(): void {
    applyToDom()
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', (event) => {
        systemPrefersDark.value = event.matches
      })
  }

  return { preference, resolvedTheme, setTheme, init }
})
