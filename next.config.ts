import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Los PDF de los manuales de organización y plataforma no son públicos: se sirven desde /manual/[tipo]/pdf
  outputFileTracingIncludes: { '/manual/[tipo]/pdf': ['./manuales-privados/**'] },
};

export default nextConfig;
