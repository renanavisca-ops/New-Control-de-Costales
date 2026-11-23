import { redirect } from 'next/navigation';
import { exigirPlataforma } from '@/lib/plataforma';
import { supabaseServidor } from '@/lib/supabase/server';
import Detalle from './detalle';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { contexto } = await exigirPlataforma();
  const sb = await supabaseServidor();
  const { data: org } = await sb.from('organizaciones').select('id, nombre, prefijo_empleado, activa').eq('id', id).maybeSingle();
  if (!org) redirect('/plataforma');
  return <Detalle org={org} roles={contexto.tipo === 'ADMIN' ? contexto.roles : []} miId={contexto.tipo === 'ADMIN' ? contexto.admin.id : ''} />;
}
