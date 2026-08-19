import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, tokenStore } from "../api/client";
import type { TokenResponse, User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: Record<string, unknown>) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => tokenStore.getUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tokenStore.access && !tokenStore.getUser()) {
      api
        .get<User>("/api/auth/me")
        .then((res) => {
          setUser(res.data);
          tokenStore.setUser(res.data);
        })
        .catch(() => tokenStore.clear())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const persist = useCallback((data: TokenResponse) => {
    tokenStore.set({ access_token: data.access_token, refresh_token: data.refresh_token });
    tokenStore.setUser(data.user);
    setUser(data.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<TokenResponse>("/api/auth/login", { email, password });
      persist(data);
      return data.user;
    },
    [persist],
  );

  const register = useCallback(
    async (payload: Record<string, unknown>) => {
      const { data } = await api.post<TokenResponse>("/api/auth/register", payload);
      persist(data);
      return data.user;
    },
    [persist],
  );

  const logout = useCallback(() => {
    api.post("/api/auth/logout").catch(() => undefined);
    tokenStore.clear();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get<User>("/api/auth/me");
      setUser(data);
      tokenStore.setUser(data);
    } catch {
      /* keep current user */
    }
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      tokenStore.clear();
      setUser(null);
    };
    window.addEventListener("medrush:unauthorized", onUnauthorized);
    return () => window.removeEventListener("medrush:unauthorized", onUnauthorized);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshUser }),
    [user, loading, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}