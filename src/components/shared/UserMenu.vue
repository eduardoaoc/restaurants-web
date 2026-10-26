<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { PhBuildings, PhCheck, PhGear, PhShieldCheck, PhSignOut } from '@phosphor-icons/vue'

import ASurface from '@/components/ui/ASurface.vue'
import { usePermissions } from '@/composables/usePermissions'
import { useAuthStore } from '@/stores/auth'

withDefaults(defineProps<{ inline?: boolean; hideSettings?: boolean }>(), { inline: false, hideSettings: false })
const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const { can, canOrganization, canPlatform } = usePermissions()

/**
 * Organization switch — only offered with 2+ active memberships (an account
 * invited into a second organization). The backend validates the choice
 * (PUT /auth/active-organization); the store then wipes restaurant context
 * and reloads it, so nothing from the previous organization lingers.
 */
const organizations = computed(() => auth.authContext?.organizations ?? [])
const activeOrganizationId = computed(() => auth.authContext?.active_organization_id ?? null)
const switchError = ref(false)
const canSeePlatform = computed(() => canPlatform('create_platform_restaurants'))

async function selectOrganization(id: number): Promise<void> {
  if (id === activeOrganizationId.value || auth.switchingOrganization) return
  switchError.value = false
  try {
    await auth.switchOrganization(id)
    open.value = false
    await router.push({ name: 'app-dashboard' })
  } catch {
    switchError.value = true
  }
}

/** Same reachability rule as the Settings route itself (Passo 2.10) — shown the moment either half is usable. */
const canSeeSettings = computed(() => can('manage_restaurants') || canOrganization('manage_organization'))

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
      v-if="!inline"
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
      v-if="open || inline"
      tone="high"
      radius="md"
      :role="inline ? undefined : 'menu'"
      :class="inline ? 'user-menu-inline' : 'absolute right-0 z-20 mt-2 min-w-56 py-2 shadow-elevated'"
    >
      <div class="px-4 py-2">
        <p class="text-label-lg font-medium text-on-surface">{{ auth.user?.name }}</p>
        <p class="text-label-md text-on-surface-variant">{{ auth.user?.email }}</p>
      </div>
      <hr class="my-1 border-outline-variant" />
      <template v-if="organizations.length > 1">
        <p class="px-4 pb-1 pt-2 text-label-md text-on-surface-variant">{{ t('orgSwitcher.label') }}</p>
        <button
          v-for="organization in organizations"
          :key="organization.id"
          type="button"
          :role="inline ? undefined : 'menuitemradio'"
          :aria-checked="inline ? undefined : organization.id === activeOrganizationId"
          :aria-pressed="inline ? organization.id === activeOrganizationId : undefined"
          :disabled="auth.switchingOrganization"
          class="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-body-md text-on-surface hover:bg-surface-container-highest disabled:opacity-[0.38]"
          @click="selectOrganization(organization.id)"
        >
          <PhCheck v-if="organization.id === activeOrganizationId" :size="18" class="text-primary" />
          <PhBuildings v-else :size="18" />
          <span class="min-w-0 flex-1 truncate">{{ organization.name }}</span>
          <span v-if="organization.id === activeOrganizationId" class="sr-only">{{ t('orgSwitcher.current') }}</span>
        </button>
        <p v-if="auth.switchingOrganization" class="px-4 py-1 text-label-md text-on-surface-variant" role="status">{{ t('orgSwitcher.switching') }}</p>
        <p v-if="switchError" class="px-4 py-1 text-label-md text-error" role="alert">{{ t('orgSwitcher.error') }}</p>
        <hr class="my-1 border-outline-variant" />
      </template>
      <RouterLink
        v-if="canSeePlatform"
        :to="{ name: 'platform-onboarding' }"
        :role="inline ? undefined : 'menuitem'"
        class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-body-md text-on-surface hover:bg-surface-container-highest"
        @click="open = false"
      >
        <PhShieldCheck :size="18" />
        {{ t('platform.goToPlatform') }}
      </RouterLink>
      <RouterLink
        v-if="canSeeSettings && !hideSettings"
        :to="{ name: 'app-settings' }"
        :role="inline ? undefined : 'menuitem'"
        class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-body-md text-on-surface hover:bg-surface-container-highest"
        @click="open = false"
      >
        <PhGear :size="18" />
        {{ t('common.settings') }}
      </RouterLink>
      <hr v-if="canSeeSettings && !hideSettings" class="my-1 border-outline-variant" />
      <button
        type="button"
        :role="inline ? undefined : 'menuitem'"
        class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-body-md text-on-surface hover:bg-surface-container-highest"
        @click="handleLogout"
      >
        <PhSignOut :size="18" />
        {{ t('common.logout') }}
      </button>
    </ASurface>
  </div>
</template>

<style scoped>
.user-menu-inline { background: transparent; border: 0; box-shadow: none; min-width: 0; }
.user-menu-inline :is(button, a) { min-width: calc(var(--spacing) * 12); min-height: calc(var(--spacing) * 12); border-radius: var(--radius-md); white-space: normal; overflow-wrap: anywhere; }
.user-menu-inline :deep(.truncate) { white-space: normal; overflow: visible; text-overflow: clip; }
.user-menu-inline p { overflow-wrap: anywhere; }
</style>
