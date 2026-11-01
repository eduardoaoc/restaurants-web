<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhMagnifyingGlass, PhPlus, PhUsersThree } from '@phosphor-icons/vue'

import InvitationItem from '@/components/invitations/InvitationItem.vue'
import StaffDetailPanel from '@/components/staff/StaffDetailPanel.vue'
import StaffForm from '@/components/staff/StaffForm.vue'
import AButton from '@/components/ui/AButton.vue'
import AConfirmDialog from '@/components/ui/AConfirmDialog.vue'
import ADialog from '@/components/ui/ADialog.vue'
import AProgress from '@/components/ui/AProgress.vue'
import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
import { useOrganizationStaff } from '@/composables/useOrganizationStaff'
import { useStaffInvitations } from '@/composables/useStaffInvitations'
import { usePermissions } from '@/composables/usePermissions'
import { useAuthStore } from '@/stores/auth'
import { useRestaurantStore } from '@/stores/restaurant'
import { describeApiError } from '@/utils/error-message'
import { isStaffActive, staffRoleLabelKey } from '@/utils/staff'
import type { CreateStaffInvitationPayload } from '@/types/invitation'
import type { StaffMember, StaffStatus, UpdateStaffPayload } from '@/types/staff'

/**
 * "Equipo" — the owner's view of the people who work here (CLAUDE.md Passo
 * 2.8). Deliberately reads as a team roster, never as a user/role/pivot
 * administration screen: no ids, no permission slugs, no "user_roles".
 *
 * The list is ORGANIZATION-wide because that is what GET /api/v1/staff
 * actually returns (scoped server-side to the restaurants the requester can
 * reach) — a person can work in several restaurants, and the UI shows each
 * of them rather than pretending one person belongs to one restaurant.
 */
const { t } = useI18n()
const restaurantStore = useRestaurantStore()
const authStore = useAuthStore()
const { can } = usePermissions()

const canManageUsers = computed(() => can('manage_users'))

const { staff, loading, error, saving, saveError, activeShiftByUserId, canReadShifts, shiftSaving, shiftError, startShift, endShift, updateStaff } =
  useOrganizationStaff(() => canManageUsers.value)

// Adding someone = inviting them (they set their own password on
// acceptance). Accepted invitations show up in the roster itself; this list
// keeps only what still needs attention.
const staffInvitations = useStaffInvitations(() => canManageUsers.value)
const openInvitations = computed(() =>
  staffInvitations.invitations.value.filter((invitation) => invitation.state === 'pending' || invitation.state === 'expired'),
)
const inviteNotice = ref<string | null>(null)
const formSaving = computed(() => (panelMode.value === 'create' ? staffInvitations.saving.value : saving.value))
const formError = computed(() => (panelMode.value === 'create' ? staffInvitations.saveError.value : saveError.value))

type PanelMode = 'none' | 'detail' | 'create' | 'edit'
type StatusFilter = 'all' | 'active' | 'inactive'

const panelMode = ref<PanelMode>('none')
const selectedId = ref<number | null>(null)
const staffForm = ref<InstanceType<typeof StaffForm> | null>(null)
const confirmDiscard = ref(false)
const query = ref('')
const roleFilter = ref<string>('all')

/**
 * Defaults to "all": a deactivated person stays in the roster by design —
 * their history, role, restaurants, employee codes and reviews are all still
 * there, and hiding them would look like they had been deleted.
 */
const statusFilter = ref<StatusFilter>('all')

const selectedMember = computed(() => staff.value.find((member) => member.id === selectedId.value) ?? null)

/**
 * A restaurant switch can also switch organization (the backend resolves the
 * active organization from the tenant context), so any open person/form must
 * close — otherwise the panel would keep showing someone who no longer
 * belongs to the visible roster (§38/§39).
 */
watch(
  () => restaurantStore.currentRestaurantId,
  () => {
    panelMode.value = 'none'
    selectedId.value = null
    inviteNotice.value = null
    query.value = ''
    roleFilter.value = 'all'
    statusFilter.value = 'all'
  },
)

const STATUS_FILTERS: StatusFilter[] = ['all', 'active', 'inactive']

/** Filters are built from the roles actually present, never a hardcoded list. */
const availableRoleFilters = computed(() => {
  const slugs = new Set<string>()
  for (const member of staff.value) {
    if (member.role) slugs.add(member.role.slug)
  }
  return [...slugs].sort()
})

const filteredStaff = computed(() => {
  const needle = query.value.trim().toLowerCase()

  return staff.value.filter((member) => {
    if (roleFilter.value !== 'all' && member.role?.slug !== roleFilter.value) return false
    if (statusFilter.value !== 'all' && isStaffActive(member.status) !== (statusFilter.value === 'active')) return false
    if (!needle) return true

    const roleLabel = member.role ? t(staffRoleLabelKey(member.role.slug)) : ''
    return (
      member.name.toLowerCase().includes(needle) ||
      member.email.toLowerCase().includes(needle) ||
      roleLabel.toLowerCase().includes(needle)
    )
  })
})

/**
 * Shifts are per restaurant: offered for the CURRENT restaurant only, to
 * holders of manage_staff_shifts, for an active person assigned there.
 * Automatic waiter assignment (QR) only considers waiters on shift.
 */
const canManageSelectedShift = computed(() => {
  const member = selectedMember.value
  const restaurantId = restaurantStore.currentRestaurantId
  return canReadShifts.value && member !== null && restaurantId !== null && isStaffActive(member.status)
    && member.restaurants.some((restaurant) => restaurant.id === restaurantId)
})

async function onStartShift(): Promise<void> {
  if (selectedId.value !== null) await startShift(selectedId.value)
}

async function onEndShift(): Promise<void> {
  const shift = selectedId.value !== null ? activeShiftByUserId.value[selectedId.value] : undefined
  if (shift) await endShift(shift.id)
}

/** The backend refuses self-deactivation; the UI simply doesn't offer it. */
const isSelfSelected = computed(() => selectedMember.value !== null && selectedMember.value.id === authStore.user?.id)

/** `saveError` is shared by the form and the status action — a stale message must never surface in the other one. */
function clearSaveError(): void {
  saveError.value = null
  staffInvitations.saveError.value = null
}

function select(member: StaffMember): void {
  clearSaveError()
  selectedId.value = member.id
  panelMode.value = 'detail'
}

function startCreate(): void {
  clearSaveError()
  inviteNotice.value = null
  selectedId.value = null
  panelMode.value = 'create'
}

function startEdit(): void {
  clearSaveError()
  panelMode.value = 'edit'
}

function beforeStaffClose(): boolean {
  if ((panelMode.value === 'create' || panelMode.value === 'edit') && staffForm.value?.isDirty) {
    confirmDiscard.value = true
    return false
  }
  return true
}

function closeStaffModal(): void {
  panelMode.value = 'none'
  selectedId.value = null
  confirmDiscard.value = false
}

function discardStaffChanges(): void {
  confirmDiscard.value = false
  closeStaffModal()
}

function cancelStaffForm(): void {
  if (staffForm.value?.isDirty) {
    confirmDiscard.value = true
    return
  }
  panelMode.value = selectedMember.value ? 'detail' : 'none'
}

/**
 * Status travels ALONE in the payload — `{ status: 'active' }` or
 * `{ status: 'inactive' }`, never anything else and never `suspended`, which
 * is a platform-level value this screen has no authority over. Reuses the
 * same PATCH the profile edit uses (`updateStaff`), so the authoritative
 * response is what updates the roster.
 */
async function changeStatus(status: StaffStatus): Promise<void> {
  if (selectedId.value === null) return
  await updateStaff(selectedId.value, { status })
}

async function onSave(payload: CreateStaffInvitationPayload | UpdateStaffPayload): Promise<void> {
  if (panelMode.value === 'create') {
    const created = await staffInvitations.invite(payload as CreateStaffInvitationPayload)
    if (created) {
      panelMode.value = 'none'
      inviteNotice.value = t('staffInvitations.sent', { email: created.email })
    }
    return
  }

  if (panelMode.value === 'edit' && selectedId.value !== null) {
    const err = await updateStaff(selectedId.value, payload as UpdateStaffPayload)
    if (!err) panelMode.value = 'detail'
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-headline font-bold text-on-surface">{{ t('staff.pageTitle') }}</h2>
        <p class="mt-1.5 text-body-md text-on-surface-variant">{{ t('staff.pageSubtitle') }}</p>
      </div>
      <AButton v-if="canManageUsers && staff.length > 0" @click="startCreate">
        <template #leading><PhPlus :size="16" /></template>
        {{ t('staffInvitations.invitePerson') }}
      </AButton>
    </div>

    <ASurface v-if="!canManageUsers" tone="container" radius="lg" class="max-w-xl p-6">
      <p class="text-title-md font-medium text-on-surface">{{ t('staff.errors.forbidden') }}</p>
    </ASurface>

    <template v-else>
      <p v-if="inviteNotice" class="text-body-md text-on-surface" role="status">{{ inviteNotice }}</p>

      <ASurface v-if="openInvitations.length > 0 || staffInvitations.error.value" tone="container" radius="lg" bordered class="p-4">
        <h3 class="text-title-md font-medium text-on-surface">{{ t('staffInvitations.title') }}</h3>
        <p class="text-body-md text-on-surface-variant">{{ t('staffInvitations.subtitle') }}</p>
        <p v-if="staffInvitations.error.value" class="mt-2 text-body-md text-error" role="alert">{{ t('staffInvitations.loadError') }}</p>
        <ul class="mt-1 divide-y divide-outline-variant" :aria-label="t('staffInvitations.title')">
          <li v-for="invitation in openInvitations" :key="invitation.id">
            <InvitationItem
              :invitation="invitation"
              :context="invitation.restaurants.map((r) => r.name).filter(Boolean).join(', ')"
              :busy="staffInvitations.busyId.value === invitation.id"
              :error="staffInvitations.itemErrors.value[invitation.id] ?? null"
              @resend="staffInvitations.act(invitation, 'resend')"
              @revoke="staffInvitations.act(invitation, 'revoke')"
            />
          </li>
        </ul>
      </ASurface>

      <div v-if="loading" class="flex items-center justify-center py-16">
        <AProgress />
      </div>

      <ASurface
        v-else-if="error"
        tone="container"
        radius="lg"
        role="alert"
        class="max-w-xl border border-error/40 bg-error-container p-6 text-on-error-container"
      >
        <p class="text-title-md font-medium">{{ describeApiError(error, t) }}</p>
      </ASurface>

      <!-- Nobody yet: invite the first action rather than showing an empty list. -->
      <ASurface v-else-if="staff.length === 0 && panelMode !== 'create'" tone="container" radius="lg" bordered elevated class="max-w-xl p-6">
        <div class="flex items-start gap-3">
          <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
            <PhUsersThree :size="22" aria-hidden="true" />
          </span>
          <div>
            <h3 class="text-title-lg font-semibold text-on-surface">{{ t('staff.empty.title') }}</h3>
            <p class="mt-0.5 text-body-md text-on-surface-variant">{{ t('staff.empty.subtitle') }}</p>
          </div>
        </div>
        <AButton class="mt-5" @click="startCreate">
          <template #leading><PhPlus :size="16" /></template>
          {{ t('staffInvitations.invitePerson') }}
        </AButton>
      </ASurface>

      <div v-else class="flex min-w-0 flex-col gap-4">
        <div class="flex flex-col gap-3">
          <ATextField v-model="query" :label="t('staff.searchLabel')" :placeholder="t('staff.searchPlaceholder')">
            <template #leading><PhMagnifyingGlass :size="18" /></template>
          </ATextField>

          <!-- Two independent axes, two groups: mixing "función" and "estado"
               into one chip row would make the pressed states read as one
               exclusive choice. -->
          <div class="flex flex-wrap items-center gap-2" role="group" :aria-label="t('staff.statusFilterLabel')">
            <button
              v-for="value in STATUS_FILTERS"
              :key="value"
              type="button"
              class="inline-flex min-h-11 items-center rounded-full px-4 text-label-lg font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :class="statusFilter === value ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high text-on-surface-variant'"
              :aria-pressed="statusFilter === value"
              @click="statusFilter = value"
            >
              {{ t(`staff.statusFilters.${value}`) }}
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-2" role="group" :aria-label="t('staff.filterLabel')">
            <button
              type="button"
              class="inline-flex min-h-11 items-center rounded-full px-4 text-label-lg font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :class="roleFilter === 'all' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high text-on-surface-variant'"
              :aria-pressed="roleFilter === 'all'"
              @click="roleFilter = 'all'"
            >
              {{ t('staff.filters.all') }}
            </button>
            <button
              v-for="slug in availableRoleFilters"
              :key="slug"
              type="button"
              class="inline-flex min-h-11 items-center rounded-full px-4 text-label-lg font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :class="roleFilter === slug ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-high text-on-surface-variant'"
              :aria-pressed="roleFilter === slug"
              @click="roleFilter = slug"
            >
              {{ t(staffRoleLabelKey(slug)) }}
            </button>
          </div>

          <!-- Announced on change so a screen-reader user hears the result
               count after typing a search or picking a filter, and it doubles
               as the plain answer to "how many people work here?". -->
          <p class="text-label-md text-on-surface-variant" role="status" aria-live="polite">
            {{ t('staff.count', filteredStaff.length) }}
          </p>

          <div>
            <p v-if="filteredStaff.length === 0" class="rounded-lg border border-outline-variant bg-surface-container px-4 py-5 text-body-md text-on-surface-variant">
              {{ t('staff.noResults') }}
            </p>

            <ul v-else class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" :aria-label="t('staff.listLabel')">
              <li v-for="member in filteredStaff" :key="member.id" class="min-w-0">
                <button
                  type="button"
                  class="group flex aspect-square w-full min-w-0 flex-col rounded-xl border border-outline-variant bg-gradient-to-br from-surface-container-high to-surface px-4 py-4 text-left shadow-[var(--ritma-tactile-shadow)] transition duration-base ease-out hover:border-outline hover:shadow-floating focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:translate-y-px active:shadow-flat motion-reduce:transition-none sm:px-5 sm:py-5"
                  :aria-label="`${t('staff.listLabel')}: ${member.name}`"
                  @click="select(member)"
                >
                  <span class="flex w-full min-w-0 items-start justify-between gap-2">
                    <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-surface-elevated text-title-md font-semibold text-accent shadow-raised" aria-hidden="true">{{ member.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase() }}</span>
                    <span class="flex flex-wrap justify-end gap-1">
                      <span v-if="!isStaffActive(member.status)" class="rounded-full border border-outline-variant bg-surface-subtle px-2 py-1 text-label-md text-fg-muted">{{ t('staff.status.badgeInactive') }}</span>
                      <span v-if="!member.role" class="rounded-full border border-warning/40 bg-warning-container px-2 py-1 text-label-md text-on-warning-container">{{ t('staff.roles.unassigned') }}</span>
                    </span>
                  </span>
                  <span class="mt-auto block min-w-0 pt-6">
                    <span class="block break-words text-component-title font-semibold text-fg">{{ member.name }}</span>
                    <span class="mt-1 block text-body-sm text-fg-muted">{{ member.role ? t(staffRoleLabelKey(member.role.slug)) : t('staff.roles.unassigned') }}</span>
                    <span class="mt-2 block break-all text-caption text-fg-muted">{{ member.email }}</span>
                  </span>
                  <span class="mt-4 flex w-full min-w-0 flex-wrap items-end justify-between gap-2 border-t border-hairline pt-3">
                    <span class="min-w-0 flex-1 text-caption text-fg-muted">
                      <span v-for="restaurant in member.restaurants" :key="restaurant.id" class="block truncate">{{ restaurant.name }}<span v-if="member.restaurants.length > 1" class="text-fg-subtle"> · {{ restaurant.sub_id }}</span></span>
                    </span>
                    <span v-if="canReadShifts && activeShiftByUserId[member.id]" class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-success/30 bg-success-subtle px-2 py-1 text-caption font-medium text-success">
                      <span class="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />{{ t('staff.shift.onShift') }}
                    </span>
                  </span>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </template>

    <ADialog
      v-if="panelMode !== 'none'"
      :title="panelMode === 'create' ? t('staffInvitations.formTitle') : panelMode === 'edit' ? t('staff.form.editTitle') : (selectedMember?.name ?? '')"
      size="lg"
      :before-close="beforeStaffClose"
      @close="closeStaffModal"
    >
      <StaffForm
        v-if="panelMode === 'create' || panelMode === 'edit'"
        ref="staffForm"
        :key="panelMode === 'edit' ? `edit-${selectedId}` : 'create'"
        :mode="panelMode === 'create' ? 'create' : 'edit'"
        :member="panelMode === 'edit' ? (selectedMember ?? undefined) : undefined"
        :saving="formSaving"
        :error="formError"
        @save="onSave"
        @cancel="cancelStaffForm"
      />
      <StaffDetailPanel
        v-else-if="selectedMember"
        :key="selectedMember.id"
        :member="selectedMember"
        :active-shift="activeShiftByUserId[selectedMember.id] ?? null"
        :shifts-visible="canReadShifts"
        :can-edit="canManageUsers"
        :is-self="isSelfSelected"
        :status-saving="saving"
        :status-error="saveError"
        :can-manage-shift="canManageSelectedShift"
        :current-restaurant-name="restaurantStore.currentRestaurant?.name ?? null"
        :shift-saving="shiftSaving"
        :shift-error="shiftError"
        @start-shift="onStartShift"
        @end-shift="onEndShift"
        @edit="startEdit"
        @deactivate="changeStatus('inactive')"
        @reactivate="changeStatus('active')"
      />
    </ADialog>
    <AConfirmDialog
      v-if="confirmDiscard"
      :label="t('operations.editor.unsavedChanges')"
      :message="t('operations.editor.unsavedChanges')"
      :confirm-label="t('operations.editor.discard')"
      confirm-variant="danger"
      @confirm="discardStaffChanges"
      @cancel="confirmDiscard = false"
    />
  </div>
</template>
