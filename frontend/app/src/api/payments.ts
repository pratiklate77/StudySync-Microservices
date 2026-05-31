import { apiFetch } from './client';

interface PaymentIntentResponse {
  payment_id: string;
  status: string;
  amount: string;
  platform_fee: string;
  payment_method: string;
  created_at: string;
}

interface PaymentConfirmResponse {
  payment_id: string;
  status: string;
  amount: string;
  platform_fee: string;
  session_id: string;
  tutor_id: string;
  user_id: string;
}

export const paymentsApi = {
  createIntent: (payload: {
    user_id: string;
    tutor_id: string;
    session_id: string;
    amount: number;
    payment_method: string;
  }) =>
    apiFetch<PaymentIntentResponse>('/api/v1/payments/create-intent', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  confirm: (payment_id: string, provider_id?: string) =>
    apiFetch<PaymentConfirmResponse>('/api/v1/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({
        payment_id,
        ...(provider_id ? { provider_id } : {}),
      }),
    }),

  getWalletBalance: (user_id: string) =>
    apiFetch<{ user_id: string; balance: string }>('/api/v1/wallet/balance', {
      method: 'GET',
      params: { user_id },
    }),

  getWalletTransactions: (user_id: string, page = 1, per_page = 20) =>
    apiFetch<{
      user_id: string;
      balance: string;
      transactions: Array<{
        transaction_id: string;
        wallet_id: string;
        payment_id: string | null;
        type: string;
        amount: string;
        description: string;
        created_at: string;
      }>;
    }>('/api/v1/wallet/transactions', {
      method: 'GET',
      params: { user_id, page, per_page },
    }),

  getAdminEarnings: () =>
    apiFetch<{
      total_commission: number;
      total_payments: number;
      commission_rate: number;
      transactions: Array<{
        payment_id: string;
        session_id: string;
        amount: number;
        commission: number;
        created_at: string;
      }>;
    }>('/api/v1/payments/admin/earnings', { method: 'GET' }),

  getTutorEarnings: (tutor_id: string) =>
    apiFetch<{
      total_earnings: number;
      total_payments: number;
      transactions: Array<{
        payment_id: string;
        session_id: string;
        gross: number;
        net: number;
        platform_fee: number;
        created_at: string;
      }>;
    }>(`/api/v1/payments/tutor/${tutor_id}/earnings`, { method: 'GET' }),
};
