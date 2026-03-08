import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AuthProvider from '@/components/AuthProvider';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '카드 관리',
  description: '카드 이용내역 관리 시스템',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        <AuthProvider>
          <Header />
          <main className="max-w-lg mx-auto pb-16">{children}</main>
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
