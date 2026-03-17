'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const inputClass = "w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition text-sm";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || '로그인에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 -mt-16">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-center text-gray-800 mb-2">아디다스 쿠폰</h1>
        <p className="text-sm text-center text-gray-400 mb-8">관리 시스템</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <input type="text" placeholder="아이디" value={username} onChange={e => setUsername(e.target.value)}
            className={inputClass} autoComplete="username" />
          <input type="password" placeholder="비밀번호" value={password} onChange={e => setPassword(e.target.value)}
            className={inputClass} autoComplete="current-password" />
          {error && <p className="text-red-500 text-xs text-center">{error}</p>}
          <button type="submit" disabled={loading || !username || !password}
            className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold text-sm hover:bg-primary-700 active:bg-primary-800 disabled:opacity-50 transition">
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
