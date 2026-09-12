<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhEye, PhEyeSlash, PhPlus, PhTrash } from '@phosphor-icons/vue'

import type { ApiError } from '@/api/errors'
import AButton from '@/components/ui/AButton.vue'
import AIconButton from '@/components/ui/AIconButton.vue'
import ASurface from '@/components/ui/ASurface.vue'
import ATextField from '@/components/ui/ATextField.vue'
import { useRestaurantStore } from '@/stores/restaurant'
import { describeApiError } from '@/utils/error-message'
import { staffRoleLabelKey } from '@/utils/staff'
import {
  ASSIGNABLE_STAFF_ROLES,
  type CreateStaffPayload,
  type StaffMember,
  type StaffRoleSlug,
  type UpdateStaffPayload,
} from '@/types/staff'

const props = defineProps<{
  mode: 'create' | 'edit'
  member?: StaffMember
  saving: boolean
  error: ApiError | null
}>()

const emit = defineEmits<{
  save: [CreateStaffPayload | UpdateStaffPayload]
  cancel: []
}>()

const { t } = useI18n()
const restaurantStore = useRestaurantStore()

const roleSelectId = useId()

interface AssignmentDraft {
  restaurantId: number | null
  employeeCode: string
}

const name = ref('')
const email = ref('')
const password = ref('')
const passwordVisible = ref(false)
const role = ref<StaffRoleSlug>('waiter')
const assignments = ref<AssignmentDraft[]>([])

const localErrors = ref<Record<string, string>>({})

/** Only restaurants the signed-in user may actually reach — never a free-typed id (§22). */
const availableRestaurants = computed(() => restaurantStore.availableRestaurants)

function seed(): void {
  const member = props.member
  name.value = member?.name ?? ''
  email.value = member?.email ?? ''
  password.value = ''
  passwordVisible.value = false
  role.value = (member?.role?.slug as StaffRoleSlug) ?? 'waiter'
  assignments.value = member
    ? member.restaurants.map((restaurant) => ({ restaurantId: restaurant.id, employeeCode: restaurant.sub_id }))
    : [{ restaurantId: restaurantStore.currentRestaurantId, employeeCode: '' }]
  localErrors.value = {}
}

seed()
watch(() => props.member, seed)

function addAssignment(): void {
  assignments.value = [...assignments.value, { restaurantId: null, employeeCode: '' }]
}

function removeAssignment(index: number): void {
  assignments.value = assignments.value.filter((_, i) => i !== index)
}

/**
 * Laravel returns nested validation keys verbatim
 * (`restaurant_assignments.0.sub_id`), so field errors are read by exact key
 * and shown on the field that caused them — never as one opaque banner.
 */
function fieldError(key: string): string | undefined {
  if (localErrors.value[key]) return localErrors.value[key]
  if (props.error?.kind !== 'validation') return undefined

  const messages = props.error.fieldErrors?.[key]
  return messages?.[0]
}

const emailError = computed(() => {
  const raw = fieldError('email')
  if (!raw) return undefined
  // The backend's unique rule is the one 422 an owner will actually hit.
  return /taken|already/i.test(raw) ? t('staff.errors.emailTaken') : raw
})

/** A banner only for failures that belong to no single field. */
const bannerMessage = computed(() => {
  if (!props.error) return null
  if (props.error.kind === 'validation') {
    const handled = new Set(['name', 'email', 'password', 'role'])
    const keys = Object.keys(props.error.fieldErrors ?? {})
    const unhandled = keys.filter((key) => !handled.has(key) && !key.startsWith('restaurant_assignments'))
    return unhandled.length > 0 ? describeApiError(props.error, t) : null
  }
  return describeApiError(props.error, t)
})

function validate(): boolean {
  const errors: Record<string, string> = {}

  if (!name.value.trim()) errors.name = t('staff.errors.nameRequired')
  if (!email.value.trim()) errors.email = t('staff.errors.emailRequired')
  if (props.mode === 'create' && password.value.length < 8) errors.password = t('staff.errors.passwordMin')
  if (assignments.value.length === 0) errors['restaurant_assignments'] = t('staff.errors.assignmentRequired')

  assignments.value.forEach((assignment, index) => {
    if (assignment.restaurantId === null) {
      errors[`restaurant_assignments.${index}.restaurant_id`] = t('staff.errors.restaurantRequired')
    }
    if (!assignment.employeeCode.trim()) {
      errors[`restaurant_assignments.${index}.sub_id`] = t('staff.errors.employeeCodeRequired')
    }
  })

  localErrors.value = errors
  return Object.keys(errors).length === 0
}

function submit(): void {
  if (!validate()) return

  const restaurantAssignments = assignments.value
    .filter((assignment) => assignment.restaurantId !== null)
    .map((assignment) => ({
      restaurant_id: assignment.restaurantId as number,
      sub_id: assignment.employeeCode.trim(),
    }))

  if (props.mode === 'create') {
    emit('save', {
      name: name.value.trim(),
      email: email.value.trim(),
      password: password.value,
      role: role.value,
      restaurant_assignments: restaurantAssignments,
    } satisfies CreateStaffPayload)
    return
  }

  // Only what actually changed — every field is `sometimes` on PATCH.
  const payload: UpdateStaffPayload = {}
  if (name.value.trim() !== props.member?.name) payload.name = name.value.trim()
  if (email.value.trim() !== props.member?.email) payload.email = email.value.trim()
  if (role.value !== props.member?.role?.slug) payload.role = role.value

  const originalAssignments = (props.member?.restaurants ?? [])
    .map((restaurant) => `${restaurant.id}:${restaurant.sub_id}`)
    .sort()
    .join('|')
  const nextAssignments = restaurantAssignments
    .map((assignment) => `${assignment.restaurant_id}:${assignment.sub_id}`)
    .sort()
    .join('|')
  if (originalAssignments !== nextAssignments) payload.restaurant_assignments = restaurantAssignments

  emit('save', payload)
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="submit">
    <ATextField
      v-model="name"
      :label="t('staff.form.nameLabel')"
      :error="fieldError('name')"
      :disabled="saving"
      autocomplete="name"
      required
    />

    <ATextField
      v-model="email"
      :label="t('staff.form.emailLabel')"
      :help-text="t('staff.form.emailHelp')"
      :error="emailError"
      :disabled="saving"
      type="email"
      autocomplete="email"
      required
    />

    <!-- Create only: the API has no way to set or change a password later. -->
    <div v-if="mode === 'create'" class="flex items-end gap-2">
      <ATextField
        v-model="password"
        class="flex-1"
        :label="t('staff.form.passwordLabel')"
        :help-text="t('staff.form.passwordHelp')"
        :error="fieldError('password')"
        :disabled="saving"
        :type="passwordVisible ? 'text' : 'password'"
        autocomplete="new-password"
        required
      />
      <AIconButton
        :label="passwordVisible ? t('staff.form.hidePassword') : t('staff.form.showPassword')"
        :disabled="saving"
        @click="passwordVisible = !passwordVisible"
      >
        <PhEyeSlash v-if="passwordVisible" :size="18" />
        <PhEye v-else :size="18" />
      </AIconButton>
    </div>

    <div>
      <label :for="roleSelectId" class="text-label-lg font-medium text-on-surface-variant">
        {{ t('staff.form.roleLabel') }}
      </label>
      <select
        :id="roleSelectId"
        v-model="role"
        :disabled="saving"
        class="mt-1.5 min-h-11 w-full rounded-lg border border-outline bg-surface-container-lowest px-3 text-body-lg text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-[0.38]"
      >
        <option v-for="slug in ASSIGNABLE_STAFF_ROLES" :key="slug" :value="slug">
          {{ t(staffRoleLabelKey(slug)) }}
        </option>
      </select>
      <p class="mt-1.5 text-label-md text-on-surface-variant">{{ t(`staff.roleHints.${role}`) }}</p>
      <p v-if="fieldError('role')" class="mt-1 text-label-md text-error" role="alert">{{ fieldError('role') }}</p>
    </div>

    <!-- Where this person works. Grouped apart from their identity, since a
         person can be in several restaurants and each needs its own code. -->
    <ASurface tone="low" radius="md" class="flex flex-col gap-3 p-3">
      <div>
        <p class="text-label-lg font-medium text-on-surface">{{ t('staff.form.assignmentsTitle') }}</p>
        <p class="mt-0.5 text-label-md text-on-surface-variant">{{ t('staff.form.assignmentsHelp') }}</p>
      </div>

      <div v-for="(assignment, index) in assignments" :key="index" class="flex flex-col gap-2">
        <div class="flex flex-wrap items-end gap-2">
          <div class="min-w-40 flex-1">
            <label :for="`${roleSelectId}-restaurant-${index}`" class="text-label-lg font-medium text-on-surface-variant">
              {{ t('staff.form.restaurantLabel') }}
            </label>
            <select
              :id="`${roleSelectId}-restaurant-${index}`"
              v-model="assignment.restaurantId"
              :disabled="saving"
              class="mt-1.5 min-h-11 w-full rounded-lg border border-outline bg-surface-container-lowest px-3 text-body-lg text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-[0.38]"
            >
              <option :value="null" disabled>{{ t('staff.form.restaurantPlaceholder') }}</option>
              <option v-for="restaurant in availableRestaurants" :key="restaurant.id" :value="restaurant.id">
                {{ restaurant.name }}
              </option>
            </select>
          </div>

          <ATextField
            v-model="assignment.employeeCode"
            class="min-w-32 flex-1"
            :label="t('staff.form.employeeCodeLabel')"
            :disabled="saving"
          />

          <AIconButton
            v-if="assignments.length > 1"
            :label="t('staff.form.removeAssignment')"
            :disabled="saving"
            @click="removeAssignment(index)"
          >
            <PhTrash :size="16" />
          </AIconButton>
        </div>

        <p
          v-if="fieldError(`restaurant_assignments.${index}.restaurant_id`)"
          class="text-label-md text-error"
          role="alert"
        >
          {{ fieldError(`restaurant_assignments.${index}.restaurant_id`) }}
        </p>
        <p v-if="fieldError(`restaurant_assignments.${index}.sub_id`)" class="text-label-md text-error" role="alert">
          {{
            /unique|taken/i.test(fieldError(`restaurant_assignments.${index}.sub_id`) ?? '')
              ? t('staff.errors.employeeCodeTaken')
              : fieldError(`restaurant_assignments.${index}.sub_id`)
          }}
        </p>
      </div>

      <p v-if="fieldError('restaurant_assignments')" class="text-label-md text-error" role="alert">
        {{ fieldError('restaurant_assignments') }}
      </p>

      <AButton variant="text" type="button" class="self-start" :disabled="saving" @click="addAssignment">
        <template #leading><PhPlus :size="16" /></template>
        {{ t('staff.form.addAssignment') }}
      </AButton>
    </ASurface>

    <p v-if="bannerMessage" class="text-label-md text-error" role="alert">{{ bannerMessage }}</p>

    <div class="flex flex-wrap items-center gap-2">
      <AButton type="submit" :loading="saving">
        {{ mode === 'create' ? t('staff.form.create') : t('common.save') }}
      </AButton>
      <AButton variant="text" type="button" :disabled="saving" @click="emit('cancel')">{{ t('common.cancel') }}</AButton>
    </div>
  </form>
</template>
