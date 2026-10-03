import { http } from '@/api/http'
import type { DayCloseDelivery, DayCloseWhatsAppSettings, UpdateDayCloseWhatsAppSettingsPayload } from '@/types/day-close-whatsapp'

export const dayCloseWhatsAppService = {
  async getSettings(restaurantId: number, signal?: AbortSignal): Promise<DayCloseWhatsAppSettings> {
    const { data } = await http.get<{ data: DayCloseWhatsAppSettings }>(`/api/v1/restaurants/${restaurantId}/day-close-whatsapp-settings`, { signal })
    return data.data
  },
  async updateSettings(restaurantId: number, payload: UpdateDayCloseWhatsAppSettingsPayload): Promise<DayCloseWhatsAppSettings> {
    const { data } = await http.put<{ data: DayCloseWhatsAppSettings }>(`/api/v1/restaurants/${restaurantId}/day-close-whatsapp-settings`, payload)
    return data.data
  },
  async getDeliveries(dayCloseId: number, signal?: AbortSignal): Promise<DayCloseDelivery[]> {
    const { data } = await http.get<{ data: { deliveries: DayCloseDelivery[] } }>(`/api/v1/day-closes/${dayCloseId}/deliveries`, { signal })
    return data.data.deliveries
  },
  async resend(dayCloseId: number, idempotencyKey: string): Promise<DayCloseDelivery> {
    const { data } = await http.post<{ data: DayCloseDelivery }>(`/api/v1/day-closes/${dayCloseId}/deliveries`, undefined, { headers: { 'Idempotency-Key': idempotencyKey } })
    return data.data
  },
}
