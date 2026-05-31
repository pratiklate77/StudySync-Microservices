export interface AnalyticsOverview {
  total_users: number;
  total_tutors: number;
  total_students: number;
  active_users_today?: number;
  total_sessions: number;
  total_groups: number;
  completed_sessions?: number;
  total_revenue: number;
  platform_revenue: number;
  pending_verifications: number;
  active_reports?: number;
}

export interface AdminUserRecord {
  id?: string;
  full_name?: string;
  name?: string;
  email: string;
  role: string;
  created_at?: string;
  is_active?: boolean;
  is_verified?: boolean;
}

export interface AuditTrailEntry {
  id: string;
  admin_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
}

export interface VerificationRequest {
  id: string;
  user_id: string;
  tutor_id: string;
  status:
    | "PENDING"
    | "APPROVED"
    | "REJECTED"
    | "pending"
    | "approved"
    | "rejected"
    | "under_review";
  submitted_at: string;
  documents: {
    document_type: string;
    file_name: string;
    file_url: string;
  }[];
  bio?: string;
  subjects?: string[];
  hourly_rate?: number;
  // Fields returned by verification service
  tutor_name?: string;
  tutor_email?: string;
  reason?: string;
}

// ── Admin Service Auth ───────────────────────────────────────────────────────
// The admin service has its own JWT system (port 8004).
// We get + cache an admin service token separately on admin login.

const ADMIN_SERVICE_TOKEN_KEY = "admin_service_token";

export function getAdminServiceToken(): string | null {
  const token =
    localStorage.getItem(ADMIN_SERVICE_TOKEN_KEY) ||
    localStorage.getItem("token");
  return token;
}

export function setAdminServiceToken(token: string) {
  localStorage.setItem(ADMIN_SERVICE_TOKEN_KEY, token);
}

export function clearAdminServiceToken() {
  localStorage.removeItem(ADMIN_SERVICE_TOKEN_KEY);
}

const ADMIN_API_BASE = "http://localhost:3000";

export interface AdminLoginResponse {
  access_token: string;
  token_type: string;
  admin_id: string;
  email: string;
  full_name: string;
  role: string;
  permissions: string[];
}

/** Login to the Admin Service (port 8004). Admin accounts are NOT stored in Identity. */
export async function loginAdminService(
  email: string,
  password: string,
): Promise<AdminLoginResponse> {
  const res = await fetch(`${ADMIN_API_BASE}/api/v1/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw {
      detail: data.detail || "Invalid admin email or password",
      status: res.status,
    };
  }
  if (!data.access_token) {
    throw { detail: "Admin service did not return a token", status: 500 };
  }
  setAdminServiceToken(data.access_token);
  return data as AdminLoginResponse;
}

export async function getAdminProfile(): Promise<{
  id: string;
  email: string;
  full_name: string;
  role: string;
}> {
  const token = getAdminServiceToken();
  const res = await fetch(`${ADMIN_API_BASE}/api/v1/admin/auth/profile`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return data;
}

/** Helper: fetch with Admin Service Bearer token */
async function adminFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getAdminServiceToken();
  const res = await fetch(`${ADMIN_API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw {
      status: res.status,
      detail: res.statusText,
      message: text.slice(0, 200),
    };
  }
  if (!res.ok) throw { status: res.status, ...data };
  return data as T;
}

export const adminApi = {
  // ── Verification Queue (Verification Service, port 8006) ──────────────────
  // The BFF proxies /api/v1/admin/verification → port 8006
  getVerificationRequests: () =>
    adminFetch<{ items: VerificationRequest[]; total: number }>(
      "/api/v1/admin/verification/",
    ),

  getVerificationRequestsPending: () =>
    adminFetch<{ items: VerificationRequest[]; total: number }>(
      "/api/v1/admin/verification/pending",
    ),

  getVerificationDetail: (requestId: string) =>
    adminFetch<any>(`/api/v1/admin/verification/${requestId}`),

  approveTutor: (verificationId: string) =>
    adminFetch<{ message: string }>(
      `/api/v1/admin/verification/${verificationId}/approve`,
      {
        method: "POST",
        body: JSON.stringify({ notes: "Approved by admin" }),
      },
    ),

  rejectTutor: (verificationId: string, reason: string) =>
    adminFetch<{ message: string }>(
      `/api/v1/admin/verification/${verificationId}/reject`,
      {
        method: "POST",
        body: JSON.stringify({ reason, notes: reason }),
      },
    ),

  // ── Admin Service Analytics (port 8004) ────────────────────────────────────
  getAnalyticsOverview: () =>
    adminFetch<AnalyticsOverview>("/api/v1/admin/analytics/overview"),

  getAuditTrail: (limit = 10) =>
    adminFetch<{ actions: AuditTrailEntry[]; total: number }>(
      `/api/v1/admin/system/audit-trail?limit=${limit}`,
    ),

  // User management
  getAllUsers: (page = 1, per_page = 50) =>
    adminFetch<{ users: AdminUserRecord[]; total: number }>(
      `/api/v1/admin/admin/users?page=${page}&per_page=${per_page}`,
    ),

  suspendUser: (userId: string) =>
    adminFetch<{ message: string }>(
      `/api/v1/admin/admin/users/${userId}/suspend`,
      {
        method: "POST",
        body: JSON.stringify({ reason: "Suspended by administrator" }),
      },
    ),

  activateUser: (userId: string) =>
    adminFetch<{ message: string }>(
      `/api/v1/admin/admin/users/${userId}/activate`,
      {
        method: "POST",
        body: JSON.stringify({ reason: "Activated by administrator" }),
      },
    ),

  // Platform health (via BFF /health/services)
  getServiceHealth: () =>
    fetch("http://localhost:3000/health/services").then((r) =>
      r.json(),
    ) as Promise<{
      services: {
        name: string;
        port: number;
        online: boolean;
        statusCode?: number;
        error?: string;
      }[];
      checked_at: string;
    }>,

  getSessions: () => adminFetch<any[]>("/api/v1/sessions/"),

  getAdminEarnings: () =>
    adminFetch<{
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
    }>("/api/v1/payments/admin/earnings"),
};
