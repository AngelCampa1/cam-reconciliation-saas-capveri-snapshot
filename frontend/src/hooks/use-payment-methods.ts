import { useQuery } from '@tanstack/react-query'
import {
  ApiError,
  apiClient,
  listPaymentMethodsApiV1BillingPaymentMethodsGet,
} from '@/api/client'

interface PaymentMethod {
  id: string
  brand: string
  last4: string
  exp_month: number
  exp_year: number
  is_default: boolean
}

export function usePaymentMethods() {
  return useQuery<PaymentMethod[]>({
    queryKey: ['payment-methods'],
    queryFn: async () => {
      const response = await listPaymentMethodsApiV1BillingPaymentMethodsGet({
        client: apiClient,
      })
      if (response.error) {
        throw ApiError.fromUnknown(response.error)
      }
      const rows = (response.data ?? []) as Array<Record<string, unknown>>
      return rows.map((row) => ({
        id: String(row.id ?? ''),
        brand: String(row.brand ?? ''),
        last4: String(row.last4 ?? ''),
        exp_month: Number(row.exp_month ?? 0),
        exp_year: Number(row.exp_year ?? 0),
        is_default: Boolean(row.is_default),
      }))
    },
  })
}
