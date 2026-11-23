import { redirect } from 'next/navigation';
import { rolesActuales } from '@/lib/contexto';
import { supabaseServidor } from '@/lib/supabase/server';
import { esSuperadmin, puedeAdministrarOrg } from '@/lib/tipos';
import Detalle from './detalle';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const roles = await rolesActuales();
  if (!esSuperadmin(roles) && !puedeAdministrarOrg(roles, id)) redirect('/');
  const sb = await supabaseServidor();
  const { data: org } = await sb.from('organizaciones').select('id, nombre, prefijo_empleado, activa').eq('id', id).maybeSingle();
  if (!org) redirect('/admin/organizaciones');
  return <Detalle roles={roles} org={org} />;
}
