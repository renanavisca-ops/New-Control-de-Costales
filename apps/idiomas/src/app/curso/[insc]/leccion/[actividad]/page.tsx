'use client';
import { use } from 'react';
import { Marco } from '@/components/marco';
import { Reproductor } from '@/components/reproductor';

export default function Pagina({ params }: { params: Promise<{ insc: string; actividad: string }> }) {
  const { insc, actividad } = use(params);
  return <Marco><Reproductor insc={insc} actividad={actividad} /></Marco>;
}
