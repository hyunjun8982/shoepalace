'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface User {
  id: number;
  username: string;
  displayName: string;
  role: string;
  groupId: number | null;
}

interface AuthCtx {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(AuthContext);
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const saved = localStorage.getItem('card_app_token');
    if (saved) {
      setToken(saved);
      fetch(`${BASE_PATH}/api/auth/me`, { headers: { Authorization: `Bearer ${saved}` } })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => setUser({ id: data.userId, username: data.username, displayName: data.username, role: data.role, groupId: data.groupId || null }))
        .catch(() => { localStorage.removeItem('card_app_token'); setToken(null); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && !user && pathname !== '/login') {
      router.replace('/login');
    }
  }, [loading, user, pathname, router]);

  const login = async (username: string, password: string) => {
    const res = await fetch(`${BASE_PATH}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    localStorage.setItem('card_app_token', data.token);
    setToken(data.token);
    setUser(data.user);
    router.replace('/transactions');
  };

  const logout = () => {
    localStorage.removeItem('card_app_token');
    setToken(null);
    setUser(null);
    router.replace('/login');
  };

  const apiFetch = (url: string, init?: RequestInit) => {
    return fetch(`${BASE_PATH}${url}`, {
      ...init,
      headers: {
        ...init?.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, apiFetch }}>
      {children}
    </AuthContext.Provider>
  );
}
