'use client';

import { useAuth } from './AuthProvider';
import { usePathname, useRouter } from 'next/navigation';

const titles: Record<string, string> = {
  '/transactions': '카드 이용내역',
  '/bank': '계좌 입출금',
  '/limits': '카드 한도 조회',
  '/sync': '내역 가져오기',
  '/accounts': '연동 관리',
  '/settings': 'CODEF 설정',
  '/profile': '회원 정보',
};

export default function Header() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === '/login') return null;

  return (
    <header className="sticky top-0 bg-white border-b border-gray-200 z-40">
      <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between">
        <h1 className="text-base font-bold text-gray-800">
          {titles[pathname] || '카드 관리'}
        </h1>
        {user && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => router.push('/profile')}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
            >
              {user.displayName || user.username}
            </button>
            <span className="text-gray-200">|</span>
            <button
              onClick={logout}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
            >
              로그아웃
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
