import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: '어울몰',
  description: '전국 산지의 정성을 잇는 어울몰',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
        {children}
      </body>
    </html>
  );
}
