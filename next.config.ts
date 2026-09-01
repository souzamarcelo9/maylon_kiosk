import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // O totem roda em rede de shopping/hospital. Nada de otimização remota
  // que dependa de terceiros no caminho crítico.
  images: { unoptimized: true },
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
  async redirects() {
  return [
    { source: '/', destination: '/kiosk', permanent: false },
  ];
},
};

export default nextConfig;
