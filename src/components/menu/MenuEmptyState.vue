<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBookOpen } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
import type { CreateMenuPayload } from '@/types/menu'

defineProps<{
  canCreate: boolean
  creating: boolean
  createError: ApiError | null
}>()

const emit = defineEmits<{ create: [CreateMenuPayload] }>()

const { t } = useI18n()

const showForm = ref(false)
const name = ref('')

function openForm(): void {
  showForm.value = true
}

function cancel(): void {
  showForm.value = false
  name.value = ''
}

const nameError = ref<string | null>(null)

function submit(): void {
  const trimmed = name.value.trim()
  if (!trimmed) {
    nameError.value = t('menu.empty.errors.nameRequired')
    return
  }
  nameError.value = null
  emit('create', { name: trimmed })
}
</script>

<template>
  <ASurface tone="container" radius="lg" bordered elevated class="max-w-xl p-6">
    <div class="flex items-center gap-3">
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
        <PhBookOpen :size="22" aria-hidden="true" />
      </span>
      <div>
        <h3 class="text-title-lg font-semibold text-on-surface">{{ t('menu.empty.title') }}</h3>
        <p class="text-body-md text-on-surface-variant">{{ t('menu.empty.subtitle') }}</p>
      </div>
    </div>

    <p v-if="!canCreate" class="mt-5 text-body-md text-on-surface-variant">
      {{ t('menu.empty.noPermission') }}
    </p>

    <template v-else-if="!showForm">
      <AButton class="mt-5" @click="openForm">{{ t('menu.empty.cta') }}</AButton>
    </template>

    <form v-else class="mt-5 flex flex-col gap-4" @submit.prevent="submit">
      <ATextField
        v-model="name"
        :label="t('menu.empty.nameLabel')"
        :placeholder="t('menu.empty.namePlaceholder')"
        :error="nameError ?? undefined"
        :disabled="creating"
        required
        @blur="nameError = null"
      />
      <p v-if="createError" class="text-label-md text-error" role="alert">
        {{
          createError.kind === 'conflict'
            ? t('menu.errors.conflict')
            : createError.kind === 'forbidden'
              ? t('menu.errors.forbidden')
              : createError.kind === 'network'
                ? t('menu.errors.network')
                : t('menu.errors.generic')
        }}
      </p>
      <div class="flex items-center gap-2">
        <AButton type="submit" :loading="creating">{{ t('menu.empty.create') }}</AButton>
        <AButton variant="text" type="button" :disabled="creating" @click="cancel">{{ t('common.cancel') }}</AButton>
      </div>
    </form>
  </ASurface>
</template>
