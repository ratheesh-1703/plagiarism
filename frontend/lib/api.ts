function normalizeApiBaseUrl(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim();
  if (!trimmed) {
    return "/api";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

export const API_BASE_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL || "/api");

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export type LoginResponse = {
  access_token: string;
  token_type: string;
};

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const mergedHeaders = new Headers(options.headers || {});
  mergedHeaders.set("Content-Type", "application/json");

  if (token) {
    mergedHeaders.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(buildApiUrl(path), {
      ...options,
      headers: mergedHeaders,
    });
  } catch {
    throw new Error(
      `Cannot connect to API at ${API_BASE_URL}. Start the backend service and try again.`,
    );
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ detail: "Unknown API error" }));
    throw new Error(errorBody.detail || "Request failed");
  }

  return response.json();
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("plagiarism_token");
}

export function saveToken(token: string): void {
  localStorage.setItem("plagiarism_token", token);
}
