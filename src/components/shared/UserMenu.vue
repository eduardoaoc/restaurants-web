<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { PhSignOut } from '@phosphor-icons/vue'

import ASurface from '@/components/ui/ASurface.vue'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const initials = computed(() => {
  const name = auth.user?.name ?? ''
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
})

async function handleLogout(): Promise<void> {
  open.value = false
  await auth.logout()
  await router.push({ name: 'login' })
}

function onFocusOut(event: FocusEvent): void {
  if (!rootRef.value?.contains(event.relatedTarget as Node | null)) {
    open.value = false
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') open.value = false
}
</script>

<template>
  <div ref="rootRef" class="relative" @focusout="onFocusOut" @keydown="onKeydown">
    <button
      type="button"
      class="inline-flex h-11 items-center gap-2 rounded-full pl-1 pr-3 transition-colors duration-200 ease-out hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :aria-label="t('appShell.userMenu')"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span
        aria-hidden="true"
        class="flex h-9 w-9 items-center justify-center rounded-full bg-primary-container text-label-md font-semibold text-on-primary-container"
      >
        {{ initials }}
      </span>
      <span class="hidden text-label-lg font-medium text-on-surface sm:inline">{{ auth.user?.name }}</span>
    </button>
    <ASurface
      v-if="open"
      tone="high"
      radius="md"
      role="menu"
      class="absolute right-0 z-20 mt-2 min-w-56 py-2 shadow-elevated"
    >
      <div class="px-4 py-2">
        <p class="text-label-lg font-medium text-on-surface">{{ auth.user?.name }}</p>
        <p class="text-label-md text-on-surface-variant">{{ auth.user?.email }}</p>
      </div>
      <hr class="my-1 border-outline-variant" />
      <button
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-body-md text-on-surface hover:bg-surface-container-highest"
        @click="handleLogout"
      >
        <PhSignOut :size="18" />
        {{ t('common.logout') }}
      </button>
    </ASurface>
  </div>
</template>
