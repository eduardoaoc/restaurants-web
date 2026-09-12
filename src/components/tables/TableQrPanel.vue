<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhCheck, PhCopy, PhPrinter, PhQrCode } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import { buildTablePublicUrl, isPublicUrlConfigured, shortenPublicUrl } from '@/utils/table-public-url'
import type { FloorPlanTable } from '@/types/floor-plan'
import TableQrCode from './TableQrCode.vue'

/**
 * The owner-facing QR surface for one table (Passo 2.7 §15/§22). Talks about
 * "el QR del cliente", never about `public_token` — the raw 48-character
 * token is deliberately never rendered anywhere in this panel.
 *
 * When no public base URL is configured the panel refuses to invent one and
 * says so plainly instead of showing a QR that would 404 for a real diner
 * (see src/utils/table-public-url.ts).
 */
const props = defineProps<{ table: FloorPlanTable }>()

const { t } = useI18n()

const publicUrl = computed(() => buildTablePublicUrl(props.table.public_token))
const shortUrl = computed(() => (publicUrl.value ? shortenPublicUrl(publicUrl.value) : null))

const copied = ref(false)
let copyResetTimer: ReturnType<typeof setTimeout> | undefined

async function copyLink(): Promise<void> {
  if (!publicUrl.value) return
  try {
    await navigator.clipboard.writeText(publicUrl.value)
    copied.value = true
    clearTimeout(copyResetTimer)
    // Inline confirmation on the button itself rather than a toast — this is
    // a micro-action, and CLAUDE.md §17 reserves snackbars for real events.
    copyResetTimer = setTimeout(() => (copied.value = false), 2000)
  } catch {
    // Clipboard can be denied (insecure context / permissions). The link
    // stays visible and selectable on screen, so there is still a way out.
    copied.value = false
  }
}

function print(): void {
  window.print()
}
</script>

<template>
  <ASurface tone="container" radius="lg" bordered class="p-4">
    <div class="flex items-center gap-2">
      <PhQrCode :size="18" class="text-on-surface-variant" aria-hidden="true" />
      <h4 class="text-title-md font-medium text-on-surface">{{ t('tables.qr.title') }}</h4>
    </div>

    <!-- No customer route published yet: say it, don't fake it. -->
    <p v-if="!isPublicUrlConfigured()" class="mt-2 text-body-md text-on-surface-variant">
      {{ t('tables.qr.notPublished') }}
    </p>

    <template v-else-if="publicUrl">
      <div class="mt-3 flex flex-wrap items-center gap-4">
        <TableQrCode :value="publicUrl" :size="148" />

        <div class="min-w-0 flex-1">
          <p class="text-body-md text-on-surface-variant">{{ t('tables.qr.description') }}</p>
          <p class="mt-1 break-all text-label-md text-on-surface-variant" :title="publicUrl">{{ shortUrl }}</p>

          <div class="mt-3 flex flex-wrap items-center gap-2">
            <AButton variant="outlined" @click="copyLink">
              <template #leading>
                <PhCheck v-if="copied" :size="16" />
                <PhCopy v-else :size="16" />
              </template>
              {{ copied ? t('tables.qr.copied') : t('tables.qr.copyLink') }}
            </AButton>
            <AButton variant="tonal" @click="print">
              <template #leading><PhPrinter :size="16" /></template>
              {{ t('tables.qr.print') }}
            </AButton>
          </div>
        </div>
      </div>

      <!--
        Print sheet: hidden on screen, and the only thing laid out on paper.
        Teleported out of #app on purpose — leaving it inside meant the
        (merely invisible) app content still generated page boxes and the
        card printed three times. With #app removed from the print layout
        entirely, this is the only flow content, so it is exactly one page.
        Deliberately minimal: a table card the owner can cut out and stand
        on the table, not a template system.
      -->
      <Teleport to="body">
        <div class="qr-print-sheet" aria-hidden="true">
          <p class="qr-print-table">{{ table.name }}</p>
          <TableQrCode :value="publicUrl" :size="260" />
          <p class="qr-print-hint">{{ t('tables.qr.printHint') }}</p>
        </div>
      </Teleport>
    </template>
  </ASurface>
</template>

<style>
/*
 * Intentionally global (not scoped): the sheet is teleported to <body>, so
 * a scoped rule would never reach it. Removing #app from the print layout
 * (rather than merely hiding it) is what keeps the card to a single page.
 */
.qr-print-sheet {
  display: none;
}

@media print {
  #app {
    display: none !important;
  }

  .qr-print-sheet {
    display: flex;
    min-height: 100vh;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    background: #ffffff;
    color: #000000;
  }

  .qr-print-table {
    font-size: 28px;
    font-weight: 700;
  }

  .qr-print-hint {
    max-width: 320px;
    text-align: center;
    font-size: 14px;
  }
}
</style>
