import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import { useThemeStore } from './stores/theme'

import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(i18n)

// Applies the resolved theme and starts listening for OS scheme changes.
// The inline script in index.html already prevents a flash for an explicit
// persisted light/dark preference; this reconfirms it and wires the listener.
useThemeStore(pinia).init()

app.mount('#app')
