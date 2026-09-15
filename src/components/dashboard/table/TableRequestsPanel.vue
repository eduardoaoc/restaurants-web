<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhBellRinging, PhCheck, PhCheckCircle } from '@phosphor-icons/vue'

import AButton from '@/components/ui/AButton.vue'
import { normalizeApiError, type ApiError } from '@/api/errors'
import { tableRequestsService } from '@/services/table-requests.service'
import type { TableRequest } from '@/types/table-requests'
import { describeApiError } from '@/utils/error-message'

/**
 * Customer-initiated table requests still open for THIS table (Passo 3.4
 * §5/§17) — "Cuenta solicitada" (request_bill) and "Camarero solicitado"
 * (call_waiter), created from the public QR surface. Distinct from
 * WaiterCall (tableDrawer's own "Llamar al responsable" button, staff-
 * initiated). Gated on handle_table_requests — a permission slug that
 * exists specifically for this pending -> acknowledged -> completed
 * lifecycle (TableRequestPolicy), never a role check.
 */
const props = defineProps<{ tableId: number; restaurantId: number | null; refreshKey?: object }>()
const emit = defineEmits<{ changed: [] }>()

const { t } = useI18n()

const requests = ref<TableRequest[]>([])
const loading = ref(false)
const error = ref<ApiError | null>(null)
const actingOn = ref<number | null>(null)
const actionError = ref<ApiError | null>(null)

const TYPE_LABEL_KEYS: Record<string, string> = {
  request_bill: 'tableDrawer.requests.type.requestBill',
  call_waiter: 'tableDrawer.requests.type.callWaiter',
}
function typeLabel(type: string): string {
  const key = TYPE_LABEL_KEYS[type]
  return key ? t(key) : type
}

let controller: AbortController | null = null
async function fetchRequests(): Promise<void> {
  if (props.restaurantId === null) return
  controller?.abort()
  const request = new AbortController()
  controller = request
  loading.value = true
  error.value = null
  try {
    const all = await tableRequestsService.list({ restaurant_id: props.restaurantId }, request.signal)
    if (request.signal.aborted) return
    requests.value = all
      .filter((r) => r.table.id === props.tableId && (r.status === 'pending' || r.status === 'acknowledged'))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  } catch (err) {
    if (request.signal.aborted) return
    error.value = normalizeApiError(err)
  } finally {
    if (!request.signal.aborted) loading.value = false
  }
}
watch(() => [props.tableId, props.restaurantId, props.refreshKey], fetchRequests, { immediate: true })
onBeforeUnmount(() => controller?.abort())

const hasOpenRequests = computed(() => requests.value.length > 0)

async function acknowledge(request: TableRequest): Promise<void> {
  actingOn.value = request.id
  actionError.value = null
  try {
    await tableRequestsService.acknowledge(request.id)
    emit('changed')
  } catch (err) {
    actionError.value = normalizeApiError(err)
  } finally {
    actingOn.value = null
    await fetchRequests()
  }
}

async function complete(request: TableRequest): Promise<void> {
  actingOn.value = request.id
  actionError.value = null
  try {
    await tableRequestsService.complete(request.id)
    emit('changed')
  } catch (err) {
    actionError.value = normalizeApiError(err)
  } finally {
    actingOn.value = null
    await fetchRequests()
  }
}
</script>

<template>
  <div v-if="loading || error || hasOpenRequests" class="flex flex-col gap-2 rounded-lg bg-warning-container p-3 text-on-warning-container">
    <p v-if="error" class="text-label-md" role="alert">{{ describeApiError(error, t) }}</p>
    <template v-else>
      <div v-for="request in requests" :key="request.id" class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2">
          <PhBellRinging :size="16" class="shrink-0" aria-hidden="true" />
          <div class="min-w-0">
            <p class="truncate text-body-md font-medium">{{ typeLabel(request.type) }}</p>
            <p class="text-label-md opacity-80">
              {{ request.status === 'pending' ? t('tableDrawer.requests.pending') : t('tableDrawer.requests.acknowledged') }}
            </p>
          </div>
        </div>
        <AButton
          v-if="request.status === 'pending'"
          variant="text"
          class="shrink-0"
          :loading="actingOn === request.id"
          @click="acknowledge(request)"
        >
          <template #leading><PhCheck :size="16" /></template>
          {{ t('tableDrawer.requests.acknowledge') }}
        </AButton>
        <AButton v-else variant="text" class="shrink-0" :loading="actingOn === request.id" @click="complete(request)">
          <template #leading><PhCheckCircle :size="16" /></template>
          {{ t('tableDrawer.requests.complete') }}
        </AButton>
      </div>
      <p v-if="actionError" class="text-label-md" role="alert">{{ describeApiError(actionError, t) }}</p>
    </template>
  </div>
</template>
