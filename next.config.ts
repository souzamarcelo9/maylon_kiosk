import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // O totem roda em rede de shopping/hospital. Nada de otimização remota
  // que dependa de terceiros no caminho crítico.
  images: { unoptimized: true },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/kiosk',
        // 307, não 308. Redirect permanente fica cacheado no Chrome do
        // tablet e é chato de reverter depois — e a raiz pode virar uma
        // landing ou um painel de operação mais adiante.
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/kiosk/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
};

export default nextConfig;
