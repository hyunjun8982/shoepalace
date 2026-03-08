'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';

interface Group {
  id: number;
  name: string;
}

export default function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Register state
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('');
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regGroupId, setRegGroupId] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regSuccess, setRegSuccess] = useState('');

  const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

  // 그룹 목록 로드
  useEffect(() => {
    if (mode === 'register') {
      fetch(`${BASE_PATH}/api/auth/register`)
        .then(r => r.json())
        .then(data => { if (data.groups) setGroups(data.groups); })
        .catch(() => {});
    }
  }, [mode]);

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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    setRegSuccess('');

    if (regPassword !== regPasswordConfirm) {
      setRegError('비밀번호가 일치하지 않습니다');
      return;
    }

    setRegLoading(true);
    try {
      const res = await fetch(`${BASE_PATH}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regUsername,
          password: regPassword,
          display_name: regName,
          phone: regPhone || undefined,
          group_id: regGroupId ? Number(regGroupId) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRegSuccess('회원가입이 완료되었습니다. 로그인해주세요.');
      setTimeout(() => {
        setMode('login');
        setUsername(regUsername);
        setRegUsername('');
        setRegPassword('');
        setRegPasswordConfirm('');
        setRegName('');
        setRegPhone('');
        setRegGroupId('');
        setRegSuccess('');
      }, 1500);
    } catch (err: any) {
      setRegError(err.message || '회원가입에 실패했습니다');
    } finally {
      setRegLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition text-sm";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 -mt-16">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-center text-gray-800 mb-8">카드내역/은행계좌<br/>관리 시스템</h1>

        {mode === 'login' ? (
          <>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <input
                  type="text"
                  placeholder="아이디"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className={inputClass}
                  autoComplete="username"
                />
              </div>
              <div>
                <input
                  type="password"
                  placeholder="비밀번호"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={inputClass}
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <p className="text-red-500 text-xs text-center">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading || !username || !password}
                className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold text-sm
                  hover:bg-primary-700 active:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? '로그인 중...' : '로그인'}
              </button>
            </form>
            <p className="text-center mt-4 text-sm text-gray-500">
              계정이 없으신가요?{' '}
              <button onClick={() => { setMode('register'); setError(''); }} className="text-primary-600 font-semibold">
                회원가입
              </button>
            </p>
          </>
        ) : (
          <>
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <input
                  type="text"
                  placeholder="아이디 (3자 이상)"
                  value={regUsername}
                  onChange={e => setRegUsername(e.target.value)}
                  className={inputClass}
                  autoComplete="username"
                />
              </div>
              <div>
                <input
                  type="password"
                  placeholder="비밀번호 (4자 이상)"
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                  className={inputClass}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <input
                  type="password"
                  placeholder="비밀번호 확인"
                  value={regPasswordConfirm}
                  onChange={e => setRegPasswordConfirm(e.target.value)}
                  className={inputClass}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="이름"
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <input
                  type="tel"
                  placeholder="휴대폰번호 (선택)"
                  value={regPhone}
                  onChange={e => setRegPhone(e.target.value)}
                  className={inputClass}
                />
              </div>
              {groups.length > 0 && (
                <div>
                  <select
                    value={regGroupId}
                    onChange={e => setRegGroupId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">소속 그룹 선택 (선택)</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {regError && (
                <p className="text-red-500 text-xs text-center">{regError}</p>
              )}
              {regSuccess && (
                <p className="text-green-500 text-xs text-center">{regSuccess}</p>
              )}
              <button
                type="submit"
                disabled={regLoading || !regUsername || !regPassword || !regPasswordConfirm || !regName}
                className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold text-sm
                  hover:bg-primary-700 active:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {regLoading ? '가입 중...' : '회원가입'}
              </button>
            </form>
            <p className="text-center mt-4 text-sm text-gray-500">
              이미 계정이 있으신가요?{' '}
              <button onClick={() => { setMode('login'); setRegError(''); setRegSuccess(''); }} className="text-primary-600 font-semibold">
                로그인
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
