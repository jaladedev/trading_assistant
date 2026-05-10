import type { Metadata } from 'next';
import './globals.css';
import ToastContainer from '@/components/ui/Toast';
import ThemeToggle from '@/components/ui/ThemeToggle';
import Onboarding from '@/components/ui/Onboarding';

export const metadata: Metadata = {
  title: 'TradeAssist',
  description: 'Multi-indicator trading assistant with strategy builder, screener and journal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        {children}
        {/* Global UI — rendered outside page tree so they're always on top */}
        <ToastContainer />
        <ThemeToggle />
        <Onboarding />
      </body>
    </html>
  );
}