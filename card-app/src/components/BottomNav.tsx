'use client';

import { usePathname, useRouter } from 'next/navigation';

const tabs = [
  { path: '/transactions', label: '카드내역' },
  { path: '/bank', label: '계좌내역' },
  { path: '/limits', label: '한도' },
  { path: '/sync', label: '가져오기' },
  { path: '/accounts', label: '연동' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === '/login') return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-bottom z-50">
      <div className="max-w-lg mx-auto flex">
        {tabs.map(tab => {
          const active = pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => router.push(tab.path)}
              className={`flex-1 py-2.5 text-xs transition-colors
                ${active ? 'text-primary-600 font-semibold' : 'text-gray-400'}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
