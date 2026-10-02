<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { normalizeApiError, type ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import AProgress from '@/components/ui/AProgress.vue'
import TableQrPanel from '@/components/tables/TableQrPanel.vue'
import { tablesService } from '@/services/tables.service'
import type { FloorPlanTable } from '@/types/floor-plan'
import { describeApiError } from '@/utils/error-message'

/**
 * Carta 8.1B §6/§10 — the operational drawer's "Acceso a la mesa" section.
 * Lazily fetches the ONE endpoint that actually carries `public_token`
 * (`GET /tables/{table}`, manage_tables only — see tablesService's own
 * docblock) independently of the Operations Live snapshot (`OperationsTable`
 * has no `public_token`, never invented here). Only rendered by the parent
 * while this section is actually expanded (§6 "discreta") — no request
 * fires for a collapsed section nobody asked to see.
 *
 * Reuses TableQrPanel as-is (same QR/link/copy/print/open-menu the Mesas
 * config screen already has, Carta 8.1B §7 "reutilizar") — this panel's own
 * job is only to fetch the `FloorPlanTable` that component needs.
 */
const props = defineProps<{ tableId: number }>()

const { t } = useI18n()

const table = ref<FloorPlanTable | null>(null)
const loading = ref(false)
const error = ref<ApiError | null>(null)
let controller: AbortController | null = null

async function load(): Promise<void> {
  controller?.abort()
  const request = new AbortController()
  controller = request
  loading.value = true
  error.value = null
  try {
    const result = await tablesService.get(props.tableId, request.signal)
    if (request.signal.aborted) return
    table.value = result
  } catch (err) {
    if (request.signal.aborted) return
    table.value = null
    error.value = normalizeApiError(err)
  } finally {
    if (!request.signal.aborted) loading.value = false
  }
}

// §5/§17 — a table switch while this section is open must never show the
// previous table's QR/link, even for an instant: reset before the new
// request starts, same abort-on-change pattern as every sibling panel.
watch(() => props.tableId, () => {
  table.value = null
  void load()
}, { immediate: true })

onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <div class="flex justify-center py-4" v-if="loading && !table"><AProgress size="sm" /></div>
  <div v-else-if="error" class="flex flex-col items-start gap-2">
    <p class="text-label-md text-error" role="alert">{{ describeApiError(error, t) }}</p>
    <AButton variant="text" @click="load">{{ t('tableDrawer.access.retry') }}</AButton>
  </div>
  <TableQrPanel v-else-if="table" :table="table" />
</template>
