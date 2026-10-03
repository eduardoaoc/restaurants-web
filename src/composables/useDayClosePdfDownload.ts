import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { normalizeApiError } from '@/api/errors'
import { dayCloseService } from '@/services/day-close.service'
import { triggerBlobDownload } from '@/utils/download-blob'

/**
 * CARTA 9.1D — shared by DayCloseHistoryTab (several rows, each
 * independently downloadable) and DayCloseDetailView (a single close).
 * In-flight ids are kept as a reactive Set so downloading one row's PDF
 * never disables another row's button (§8 — no reason to block the rest
 * of the list for a single in-flight download).
 *
 * 404 reuses the same "no longer available" text every other screen in
 * this app already shows for a 404 (`common.errors.notFound`) — every
 * other failure (401/403/5xx/network/unexpected content-type) gets the
 * one generic `dayClose.errors.downloadPdfError` message, never the raw
 * backend exception.
 */
export function useDayClosePdfDownload() {
  const { t } = useI18n()
  const downloadingIds = ref<Set<number>>(new Set())
  const error = ref<{ id: number; message: string } | null>(null)

  function isDownloading(id: number): boolean {
    return downloadingIds.value.has(id)
  }

  async function download(dayCloseId: number, fallbackFilename: string): Promise<void> {
    error.value = null
    downloadingIds.value.add(dayCloseId)
    try {
      const { blob, filename } = await dayCloseService.downloadPdf(dayCloseId, fallbackFilename)
      triggerBlobDownload(blob, filename)
    } catch (err) {
      const normalized = normalizeApiError(err)
      error.value = {
        id: dayCloseId,
        message: normalized.kind === 'not_found' ? t('common.errors.notFound') : t('dayClose.errors.downloadPdfError'),
      }
    } finally {
      downloadingIds.value.delete(dayCloseId)
    }
  }

  function reset(): void {
    downloadingIds.value.clear()
    error.value = null
  }

  return { isDownloading, download, error, reset }
}
