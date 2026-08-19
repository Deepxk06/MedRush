import axios from "axios";
import type { TokenResponse } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

const TOKEN_KEY = "medrush_access";
const REFRESH_KEY = "medrush_refresh";
const USER_KEY = "medrush_user";

export const tokenStore = {
  get access() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(tokens: { access_token: string; refresh_token: string }) {
    localStorage.setItem(TOKEN_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
  },
  getUser(): import("../types").User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  setUser(user: import("../types").User) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

api.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = tokenStore.refresh;
  if (!refresh) return null;
  try {
    const { data } = await axios.post<TokenResponse>(`${API_URL}/api/auth/refresh`, {
      refresh_token: refresh,
    });
    tokenStore.set({ access_token: data.access_token, refresh_token: data.refresh_token });
    tokenStore.setUser(data.user);
    return data.access_token;
  } catch {
    tokenStore.clear();
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      refreshing = refreshing || refreshAccessToken();
      const token = await refreshing;
      refreshing = null;
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("medrush:unauthorized"));
      }
    }
    return Promise.reject(error);
  },
);

export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((d) => d.msg).join("; ");
    if (error.response) return `Request failed (${error.response.status})`;
    return "Cannot reach the server. Is the backend running?";
  }
  return "Something went wrong";
}