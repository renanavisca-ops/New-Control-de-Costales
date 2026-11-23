import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Control de Costales',
    short_name: 'Costales',
    description: 'Recepción y producción de costales en tienda',
    start_url: '/tienda',
    display: 'standalone',
    background_color: '#f6f7fb',
    theme_color: '#4f46e5',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
