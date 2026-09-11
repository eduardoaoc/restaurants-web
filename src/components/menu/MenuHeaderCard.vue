<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheckCircle, PhPauseCircle, PhPencilSimple } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
import type { Menu, MenuStatus, UpdateMenuPayload } from '@/types/menu'

const props = defineProps<{
  menu: Menu
  canEdit: boolean
  onSave: (payload: UpdateMenuPayload) => Promise<ApiError | null>
}>()

const { t } = useI18n()

const editing = ref(false)
const submitting = ref(false)
const name = ref('')
const status = ref<MenuStatus>('active')
const nameError = ref<string | null>(null)
const banner = ref<string | null>(null)

function startEditing(): void {
  name.value = props.menu.name
  status.value = props.menu.status
  nameError.value = null
  banner.value = null
  editing.value = true
}

function cancel(): void {
  editing.value = false
}

async function save(): Promise<void> {
  const trimmed = name.value.trim()
  if (!trimmed) {
    nameError.value = t('menu.header.errors.nameRequired')
    return
  }
  nameError.value = null
  submitting.value = true

  const error = await props.onSave({ name: trimmed, status: status.value })

  submitting.value = false

  if (!error) {
    editing.value = false
    return
  }

  if (error.kind === 'validation' && error.fieldErrors?.name) {
    nameError.value = error.fieldErrors.name[0] ?? null
    return
  }

  banner.value =
    error.kind === 'forbidden'
      ? t('menu.errors.forbidden')
      : error.kind === 'network'
        ? t('menu.errors.network')
        : t('menu.errors.generic')
}
</script>

<template>
  <ASurface tone="container" radius="lg" bordered elevated class="p-6">
    <template v-if="!editing">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-title-lg font-semibold text-on-surface">{{ menu.name }}</h1>
            <span
              class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-label-md font-medium"
              :class="menu.status === 'active' ? 'bg-success-container text-on-success-container' : 'bg-surface-container-high text-on-surface-variant'"
            >
              <PhCheckCircle v-if="menu.status === 'active'" :size="14" aria-hidden="true" />
              <PhPauseCircle v-else :size="14" aria-hidden="true" />
              {{ menu.status === 'active' ? t('menu.status.active') : menu.status === 'inactive' ? t('menu.status.inactive') : menu.status }}
            </span>
          </div>
          <p class="mt-1 text-body-md text-on-surface-variant">{{ t('menu.header.subtitle') }}</p>
        </div>

        <AButton v-if="canEdit" variant="tonal" @click="startEditing">
          <template #leading><PhPencilSimple :size="16" /></template>
          {{ t('menu.header.edit') }}
        </AButton>
      </div>
    </template>

    <form v-else class="flex flex-col gap-4" @submit.prevent="save">
      <ATextField
        v-model="name"
        :label="t('menu.header.nameLabel')"
        :error="nameError ?? undefined"
        :disabled="submitting"
        required
        @blur="nameError = null"
      />

      <div>
        <span class="text-label-lg font-medium text-on-surface-variant">{{ t('menu.header.statusLabel') }}</span>
        <div class="mt-1.5 inline-flex gap-1 rounded-lg border border-outline-variant bg-surface-container-low p-1" role="radiogroup" :aria-label="t('menu.header.statusLabel')">
          <button
            type="button"
            role="radio"
            :aria-checked="status === 'active'"
            class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :class="status === 'active' ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
            :disabled="submitting"
            @click="status = 'active'"
          >
            {{ t('menu.status.active') }}
          </button>
          <button
            type="button"
            role="radio"
            :aria-checked="status === 'inactive'"
            class="rounded-md px-3 py-1.5 text-label-lg font-medium transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :class="status === 'inactive' ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
            :disabled="submitting"
            @click="status = 'inactive'"
          >
            {{ t('menu.status.inactive') }}
          </button>
        </div>
      </div>

      <p v-if="banner" class="text-label-md text-error" role="alert">{{ banner }}</p>

      <div class="flex items-center gap-2">
        <AButton type="submit" :loading="submitting">{{ t('menu.header.save') }}</AButton>
        <AButton variant="text" type="button" :disabled="submitting" @click="cancel">{{ t('common.cancel') }}</AButton>
      </div>
    </form>
  </ASurface>
</template>
