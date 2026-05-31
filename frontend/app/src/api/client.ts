const API_BASE_URL = "http://localhost:3000";

import { getAdminServiceToken } from "./admin";

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export class APIError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "APIError";
    this.status = status;
    this.detail = detail;
  }
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  // Determine token based on endpoint type
  const isAdminEndpoint = endpoint.startsWith("/api/v1/admin");
  const token = isAdminEndpoint
    ? getAdminServiceToken()
    : localStorage.getItem("token");
  // Prepare headers
  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Automatically set Content-Type to application/json for non-FormData bodies
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  // Construct URL with query parameters
  let url = `${API_BASE_URL}${endpoint}`;
  if (options.params) {
    const searchParams = new URLSearchParams();
    Object.entries(options.params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401 && !endpoint.includes("/auth/login")) {
    if (isAdminEndpoint) {
      // Only clear admin token on admin 401s — don't touch identity token
      localStorage.removeItem("admin_service_token");
    } else {
      // Identity/session 401 — clear user token only
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.dispatchEvent(new Event("auth-logout"));
    }
  }

  if (!response.ok) {
    let errorDetail = "An unexpected server error occurred";
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || errorJson.message || errorDetail;
    } catch {
      // Failed to parse JSON error, fall back to status text
      errorDetail = response.statusText || errorDetail;
    }
    throw new APIError(response.status, errorDetail);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}
