<script setup lang="ts">
import { safeHttpUrl } from '@/utils/safe-url'
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise, PhImageSquare, PhTrashSimple, PhUploadSimple, PhVideoCamera, PhWarningCircle } from '@phosphor-icons/vue'

import AProgress from '@/components/ui/AProgress.vue'
import type { ProductMedia, ProductMediaType } from '@/types/product-media'
import {
  acceptFor,
  emptyMediaSlotDraft,
  formatMediaSize,
  mediaFormatLabel,
  validateProductMediaFile,
  type ProductMediaSlotDraft,
} from '@/utils/product-media'

/**
 * One image OR video slot (Carta 4.3 §9) — used twice by
 * `ProductMediaFields.vue` (video first, image second). Owns only the
 * IMMEDIATE, purely-local UX for picking/previewing/marking-for-removal a
 * file; it never calls the upload/delete API itself (Carta 4.3 §13: a
 * brand-new Product has no id to upload against yet, so the real network
 * call always happens later, in the parent that actually knows the
 * Product's id — see `ProductForm`'s `submit()` and the composable's
 * `applyProductMediaIntents`).
 */
const props = defineProps<{
  type: ProductMediaType
  label: string
  hint?: string
  existing: ProductMedia | null
  draft: ProductMediaSlotDraft
  disabled?: boolean
  /** True while THIS form's overall save is in flight — only shown as a busy overlay when this slot actually has pending work (a new file or a removal to apply). */
  saving?: boolean
  /** Resolved, already-localized message from the server's last attempt (e.g. 422 on `file`, 413, network) — separate from the instant local format/size check below. */
  serverError?: string | null
}>()

const emit = defineEmits<{ 'update:draft': [ProductMediaSlotDraft] }>()

const { t, locale } = useI18n()

const inputId = useId()
const fileInputRef = ref<HTMLInputElement | null>(null)

const localError = ref<string | null>(null)
const objectUrl = ref<string | null>(null)

function revokeObjectUrl(): void {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = null
  }
}

// Kept in sync with `draft.pendingFile` rather than created inline in a
// computed — `URL.createObjectURL` must be paired 1:1 with a `revoke`, and
// a computed re-running on every render would leak a new URL each time.
watch(
  () => props.draft.pendingFile,
  (file) => {
    revokeObjectUrl()
    if (file) objectUrl.value = URL.createObjectURL(file)
  },
  { immediate: true },
)

onBeforeUnmount(revokeObjectUrl)

const isPendingRemoval = computed(() => !props.draft.pendingFile && props.draft.markedForRemoval && Boolean(props.existing))

// Kept visible (dimmed, via `isPendingRemoval`'s own styling below) even
// while marked for removal — "pending" means exactly that, nothing is
// actually gone yet, so hiding the preview here would be showing the
// post-save state before Guardar was ever pressed.
const previewUrl = computed(() => {
  if (props.draft.pendingFile) return objectUrl.value
  if (props.existing) return safeHttpUrl(props.existing.url) ?? null
  return null
})

const displayInfo = computed(() => {
  if (props.draft.pendingFile) return { mimeType: props.draft.pendingFile.type, sizeBytes: props.draft.pendingFile.size }
  if (props.existing) return { mimeType: props.existing.mime_type, sizeBytes: props.existing.size_bytes }
  return null
})

const fileInfoLine = computed(() => {
  const info = displayInfo.value
  if (!info) return null
  return `${mediaFormatLabel(info.mimeType)} · ${formatMediaSize(info.sizeBytes, locale.value)}`
})

const hasContent = computed(() => previewUrl.value !== null || isPendingRemoval.value)
const showBusyOverlay = computed(() => Boolean(props.saving && (props.draft.pendingFile || props.draft.markedForRemoval)))

const invalidTypeMessage = computed(() =>
  props.type === 'image' ? t('menu.products.media.errors.invalidTypeImage') : t('menu.products.media.errors.invalidTypeVideo'),
)
const tooLargeMessage = computed(() =>
  props.type === 'image' ? t('menu.products.media.errors.tooLargeImage') : t('menu.products.media.errors.tooLargeVideo'),
)

function openPicker(): void {
  if (props.disabled) return
  fileInputRef.value?.click()
}

function onFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  // Always reset so picking the exact same file again (e.g. after fixing
  // it outside the browser) still fires a fresh `change` event.
  input.value = ''
  if (!file) return

  const result = validateProductMediaFile(file, props.type)
  if (result === 'invalid_type') {
    localError.value = invalidTypeMessage.value
    return
  }
  if (result === 'too_large') {
    localError.value = tooLargeMessage.value
    return
  }

  localError.value = null
  emit('update:draft', { pendingFile: file, markedForRemoval: false })
}

function onRemoveOrUndo(): void {
  if (props.disabled) return
  localError.value = null
  if (props.draft.pendingFile) {
    emit('update:draft', emptyMediaSlotDraft())
    return
  }
  emit('update:draft', { ...props.draft, markedForRemoval: !props.draft.markedForRemoval })
}

const displayError = computed(() => localError.value ?? props.serverError ?? null)
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-baseline justify-between gap-2">
      <span class="text-label-lg font-medium text-on-surface-variant">{{ label }}</span>
      <span v-if="hint" class="text-label-md text-on-surface-variant">{{ hint }}</span>
    </div>

    <input
      :id="inputId"
      ref="fileInputRef"
      type="file"
      class="hidden"
      :accept="acceptFor(type)"
      :disabled="disabled"
      @change="onFileChange"
    />

    <!-- Empty slot -->
    <button
      v-if="!hasContent"
      type="button"
      class="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-5 text-center transition-colors duration-200 ease-out hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-[0.38]"
      :disabled="disabled"
      @click="openPicker"
    >
      <PhVideoCamera v-if="type === 'video'" :size="22" class="text-on-surface-variant" aria-hidden="true" />
      <PhImageSquare v-else :size="22" class="text-on-surface-variant" aria-hidden="true" />
      <span class="inline-flex items-center gap-1.5 text-label-lg font-medium text-primary">
        <PhUploadSimple :size="16" aria-hidden="true" />
        {{ type === 'video' ? t('menu.products.media.addVideo') : t('menu.products.media.addImage') }}
      </span>
      <span class="text-label-md text-on-surface-variant">
        {{ type === 'video' ? t('menu.products.media.videoRequirements') : t('menu.products.media.imageRequirements') }}
      </span>
    </button>

    <!-- Filled slot: preview + info + actions -->
    <div v-else class="flex flex-col gap-2 rounded-lg border border-outline-variant bg-surface-container-low p-3">
      <div class="relative overflow-hidden rounded-md bg-surface-container-highest" :class="isPendingRemoval ? 'opacity-40' : ''">
        <video
          v-if="type === 'video' && previewUrl"
          :src="previewUrl"
          referrerpolicy="no-referrer"
          class="aspect-video w-full object-cover"
          muted
          playsinline
          controls
        />
        <img
          v-else-if="previewUrl"
          :src="previewUrl"
          referrerpolicy="no-referrer"
          :alt="t('menu.products.media.imageAlt')"
          class="aspect-video w-full object-cover"
        />
        <div v-if="isPendingRemoval" class="absolute inset-0 flex items-center justify-center">
          <span class="rounded-full bg-surface px-3 py-1 text-label-md font-medium text-on-surface shadow-elevated">
            {{ t('menu.products.media.pendingRemoval') }}
          </span>
        </div>
        <div v-if="showBusyOverlay" class="absolute inset-0 flex items-center justify-center bg-surface/70">
          <AProgress />
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <span v-if="fileInfoLine" class="text-label-md text-on-surface-variant">{{ fileInfoLine }}</span>
        <div class="flex items-center gap-1">
          <button
            v-if="!isPendingRemoval"
            type="button"
            class="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-label-lg font-medium text-primary hover:bg-primary-container/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-[0.38]"
            :disabled="disabled"
            @click="openPicker"
          >
            <PhArrowClockwise :size="16" aria-hidden="true" />
            {{ t('menu.products.media.change') }}
          </button>
          <button
            v-if="isPendingRemoval"
            type="button"
            class="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-label-lg font-medium text-primary hover:bg-primary-container/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-[0.38]"
            :disabled="disabled"
            @click="onRemoveOrUndo"
          >
            {{ t('menu.products.media.undo') }}
          </button>
          <button
            v-else
            type="button"
            class="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-label-lg font-medium text-error hover:bg-error-container/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-[0.38]"
            :disabled="disabled"
            @click="onRemoveOrUndo"
          >
            <PhTrashSimple :size="16" aria-hidden="true" />
            {{ t('menu.products.media.remove') }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="displayError" class="flex items-center gap-1.5 text-label-md text-error" role="alert">
      <PhWarningCircle :size="14" aria-hidden="true" />
      {{ displayError }}
    </p>
  </div>
</template>
