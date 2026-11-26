import { exigirCentro } from '@/lib/contexto';
import { supabaseServidor } from '@/lib/supabase/server';
import VentasLocales from './cliente';

export default async function Page() {
  const { centro } = await exigirCentro();
  const sb = await supabaseServidor();
  const { data } = await sb
    .from('tiendas')
    .select('id, codigo, nombre')
    .eq('organizacion_id', centro.organizacion_id)
    .eq('es_venta_local', true)
    .eq('activa', true)
    .order('codigo');
  return <VentasLocales bodegas={(data as { id: string; codigo: string; nombre: string }[]) || []} />;
}
