'use client';
import { use } from 'react';
import { Marco } from '@/components/marco';
import { Reproductor } from '@/components/reproductor';

export default function Pagina({ params }: { params: Promise<{ insc: string }> }) {
  const { insc } = use(params);
  return <Marco><Reproductor insc={insc} /></Marco>;
}
