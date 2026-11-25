import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Puente · Idiomas',
  description: 'Aprende idiomas con práctica que se adapta a ti.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#3b2f9e' };

export default function Raiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-419">
      <body>{children}</body>
    </html>
  );
}
