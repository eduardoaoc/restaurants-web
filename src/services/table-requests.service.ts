import { http } from '@/api/http'
import type { TableRequest, TableRequestsQuery } from '@/types/table-requests'

interface TableRequestListEnvelope {
  data: { table_requests: TableRequest[] }
}
interface TableRequestEnvelope {
  data: { table_request: TableRequest }
}

/**
 * Thin wrapper around the real restaurants-api Table Requests contract:
 *   GET  /api/v1/table-requests?restaurant_id=&status=&type=
 *   GET  /api/v1/table-requests/{tableRequest}
 *   POST /api/v1/table-requests/{tableRequest}/acknowledge
 *   POST /api/v1/table-requests/{tableRequest}/cancel
 *   POST /api/v1/table-requests/{tableRequest}/complete
 */
export const tableRequestsService = {
  async list(query: TableRequestsQuery = {}, signal?: AbortSignal): Promise<TableRequest[]> {
    const { data } = await http.get<TableRequestListEnvelope>('/api/v1/table-requests', { params: query, signal })
    return data.data.table_requests
  },

  async get(id: number): Promise<TableRequest> {
    const { data } = await http.get<TableRequestEnvelope>(`/api/v1/table-requests/${id}`)
    return data.data.table_request
  },

  async acknowledge(id: number): Promise<TableRequest> {
    const { data } = await http.post<TableRequestEnvelope>(`/api/v1/table-requests/${id}/acknowledge`)
    return data.data.table_request
  },

  async cancel(id: number): Promise<TableRequest> {
    const { data } = await http.post<TableRequestEnvelope>(`/api/v1/table-requests/${id}/cancel`)
    return data.data.table_request
  },

  async complete(id: number): Promise<TableRequest> {
    const { data } = await http.post<TableRequestEnvelope>(`/api/v1/table-requests/${id}/complete`)
    return data.data.table_request
  },
}
