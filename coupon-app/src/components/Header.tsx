'use client';

import { useAuth } from './AuthProvider';
import { usePathname, useRouter } from 'next/navigation';

const titles: Record<string, string> = {
  '/accounts': '계정 관리',
  '/fetch': '조회 / 발급',
  '/stats': '통계',
};

export default function Header() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === '/login') return null;

  const isDetail = pathname.startsWith('/accounts/') && pathname !== '/accounts';
  const title = isDetail ? '계정 상세' : (titles[pathname] || '아디다스 쿠폰');

  return (
    <header className="sticky top-0 bg-white border-b border-gray-200 z-40">
      <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isDetail && (
            <button onClick={() => router.back()} className="text-gray-400 text-sm">&larr;</button>
          )}
          <h1 className="text-base font-bold text-gray-800">{title}</h1>
        </div>
        {user && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">{user.displayName}</span>
            <span className="text-gray-200">|</span>
            <button onClick={logout} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">
              로그아웃
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
