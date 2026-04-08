export const API_BASE = "https://api.aifut.net";
export const TOKEN_KEY = "aifut_token";

export type AuthSession = {
  token?: string;
  user?: {
    id: string;
    email: string;
    name?: string | null;
  } | null;
  tenant?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  membership?: {
    id: string;
    role: string;
    tenantId: string;
    userId: string;
  } | null;
};

export function getStoredToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TOKEN_KEY) || "";
}

export function setStoredToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export async function fetchAuthMe(token: string): Promise<AuthSession> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json?.message || `auth/me failed (${res.status})`);
  }

  return json;
}

export async function loginWithPassword(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json?.message || `Login failed (${res.status})`);
  }

  return json as AuthSession;
}
