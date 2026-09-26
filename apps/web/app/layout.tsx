import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: '어울몰',
  description: '전국 산지의 정성을 잇는 어울몰',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
