const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

type Json = Record<string, any>;

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE}/api${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getCategories: () => request<{ categories: string[] }>('/categories'),

  listExpenses: (params: { category?: string; month?: string; q?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.category && params.category !== 'All') qs.append('category', params.category);
    if (params.month) qs.append('month', params.month);
    if (params.q) qs.append('q', params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ expenses: any[] }>(`/expenses${suffix}`);
  },

  createExpense: (body: Json) =>
    request('/expenses', { method: 'POST', body: JSON.stringify(body) }),

  updateExpense: (id: string, body: Json) =>
    request(`/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteExpense: (id: string) =>
    request(`/expenses/${id}`, { method: 'DELETE' }),

  getExpense: (id: string) => request(`/expenses/${id}`),

  dashboard: (month?: string) =>
    request<{
      total: number;
      count: number;
      by_category: any[];
      recent: any[];
      budgets: any[];
      month: string;
      total_budget: { amount: number; alert_threshold: number; month: string } | null;
      alerts: any[];
      alert_count: number;
    }>(`/dashboard${month ? `?month=${month}` : ''}`),

  listBudgets: (month?: string) =>
    request<{
      month: string;
      budgets: any[];
      total_budget: { amount: number; alert_threshold: number; month: string } | null;
    }>(`/budgets${month ? `?month=${month}` : ''}`),

  upsertBudget: (body: Json) =>
    request('/budgets', { method: 'POST', body: JSON.stringify(body) }),

  deleteBudget: (id: string) =>
    request(`/budgets/${id}`, { method: 'DELETE' }),

  getTotalBudget: (month?: string) =>
    request<{ month: string; total_budget: any | null }>(
      `/settings/total-budget${month ? `?month=${month}` : ''}`
    ),

  upsertTotalBudget: (amount: number, alert_threshold = 80, month?: string) =>
    request('/settings/total-budget', {
      method: 'POST',
      body: JSON.stringify({ amount, alert_threshold, month }),
    }),

  deleteTotalBudget: (month?: string) =>
    request(`/settings/total-budget${month ? `?month=${month}` : ''}`, {
      method: 'DELETE',
    }),

  listAlerts: (month?: string) =>
    request<{ month: string; alerts: any[]; count: number }>(
      `/alerts${month ? `?month=${month}` : ''}`
    ),

  scanScreenshot: (image_base64: string, mime_type = 'image/jpeg') =>
    request<{
      amount: number | null;
      merchant: string | null;
      date: string | null;
      category: string | null;
      success: boolean;
      error?: string;
    }>('/scan-screenshot', {
      method: 'POST',
      body: JSON.stringify({ image_base64, mime_type }),
    }),
};
