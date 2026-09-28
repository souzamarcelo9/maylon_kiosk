import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

/**
 * next/font baixa e auto-hospeda no build. O totem nunca busca fonte no
 * Google em tempo de execução — em rede de shopping isso significaria
 * texto invisível enquanto a fonte não chega.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Maylon',
  description: 'Peça sua corrida em segundos.',
  icons: {
    icon: [
      { url: '/brand/favicon-32.png', sizes: '32x32' },
      { url: '/brand/icon-512.png', sizes: '512x512' },
    ],
    apple: '/brand/apple-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1e6450',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
