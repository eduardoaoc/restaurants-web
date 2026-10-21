import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { http } from './api/http'
import { installSessionInterceptor } from './api/session'
import { useAuthStore } from './stores/auth'
import router from './router'
import { i18n } from './i18n'
import { useThemeStore } from './stores/theme'

import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
installSessionInterceptor(http, () => {
  const auth = useAuthStore(pinia)
  const wasAuthenticated = auth.authenticated
  auth.expireSession()
  if (wasAuthenticated && !router.currentRoute.value.meta.public && router.currentRoute.value.name !== 'login') void router.replace({ name: 'login' })
}, () => { const auth = useAuthStore(pinia); return { version: auth.sessionGeneration, authenticated: auth.authenticated } })
app.use(router)
app.use(i18n)

// Applies the resolved theme and starts listening for OS scheme changes.
// The inline script in index.html already prevents a flash for an explicit
// persisted light/dark preference; this reconfirms it and wires the listener.
useThemeStore(pinia).init()

app.mount('#app')
