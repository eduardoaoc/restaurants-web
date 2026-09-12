import { http } from '@/api/http'
import type {
  CreateStaffPayload,
  StaffMember,
  StaffPerformance,
  StaffShift,
  UpdateStaffPayload,
} from '@/types/staff'

interface StaffListEnvelope {
  data: { staff: StaffMember[] }
}

interface StaffEnvelope {
  data: { staff: StaffMember }
}

interface StaffShiftListEnvelope {
  data: { staff_shifts: StaffShift[] }
}

/** Verified live: the payload is nested one level deeper — `{ data: { performance: {...} } }`. */
interface StaffPerformanceEnvelope {
  data: { performance: StaffPerformance }
}

/**
 * Thin wrapper around the real restaurants-api Staff contract:
 *   GET   /api/v1/staff                                              -> { data: { staff: [] } }
 *   POST  /api/v1/staff                                              -> { message, data: { staff } } | 422
 *   GET   /api/v1/staff/{user}                                       -> { data: { staff } }
 *   PATCH /api/v1/staff/{user}                                       -> { message, data: { staff } } | 422
 *   GET   /api/v1/restaurants/{restaurant}/staff-shifts              -> paginated staff_shifts
 *   GET   /api/v1/restaurants/{restaurant}/staff/{staff}/performance -> { data: {...} }
 *
 * GET /staff is ORGANIZATION-wide (scoped server-side to the restaurants the
 * requester can reach), not restaurant-scoped — see StaffController::staffQuery.
 * There is no DELETE and no status field anywhere in this contract.
 */
export const staffService = {
  async list(signal?: AbortSignal): Promise<StaffMember[]> {
    const { data } = await http.get<StaffListEnvelope>('/api/v1/staff', { signal })
    return data.data.staff
  },

  async get(userId: number, signal?: AbortSignal): Promise<StaffMember> {
    const { data } = await http.get<StaffEnvelope>(`/api/v1/staff/${userId}`, { signal })
    return data.data.staff
  },

  async create(payload: CreateStaffPayload): Promise<StaffMember> {
    const { data } = await http.post<StaffEnvelope>('/api/v1/staff', payload)
    return data.data.staff
  },

  async update(userId: number, payload: UpdateStaffPayload): Promise<StaffMember> {
    const { data } = await http.patch<StaffEnvelope>(`/api/v1/staff/${userId}`, payload)
    return data.data.staff
  },

  /**
   * Active shifts for one restaurant. Requires `manage_staff_shifts` — a
   * different permission from the `manage_users` that gates this whole
   * screen, so callers must gate the call themselves rather than let it 403.
   */
  async listActiveShifts(restaurantId: number, signal?: AbortSignal): Promise<StaffShift[]> {
    const { data } = await http.get<StaffShiftListEnvelope>(
      `/api/v1/restaurants/${restaurantId}/staff-shifts`,
      { params: { active: 'true' }, signal },
    )
    return data.data.staff_shifts
  },

  /** Requires `view_reports` and that the staff member is assigned to this exact restaurant. */
  async getPerformance(restaurantId: number, staffId: number, signal?: AbortSignal): Promise<StaffPerformance> {
    const { data } = await http.get<StaffPerformanceEnvelope>(
      `/api/v1/restaurants/${restaurantId}/staff/${staffId}/performance`,
      { signal },
    )
    return data.data.performance
  },
}
