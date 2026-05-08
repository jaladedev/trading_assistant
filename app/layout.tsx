import type { Metadata } from 'next';
import './globals.css'; 

export const metadata: Metadata = {
  title: 'Trading Assistant',
  description: '3-EMA trading assistant with futures calculator and trade journal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}