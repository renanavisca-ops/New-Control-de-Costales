'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { cargarOrgsPropias } from '@/lib/datos';
import type { AsignacionRol, Organizacion, Tienda } from '@/lib/tipos';
import { SelectorOrg, useOrgActiva } from '@/components/selector-org';
import { Aviso, Boton, Campo, Entrada, Insignia, Modal, Selector, Tarjeta, Titulo } from '@/components/ui';

type Codigo = { id: string; tienda_id: string; auditor: string; pista: string; expira: string; revocado_at: string | null; created_at: string };
type Aud = { id: string; tienda_id: string; auditor: string; estado: string; iniciado_at: string; finalizado_at: string | null };

export default function AuditoriasCliente({ roles }: { roles: AsignacionRol[] }) {
  const sb = supabaseNavegador();
  const [orgs, setOrgs] = useState<Organizacion[]>([]);
  const [orgId, setOrgId] = useOrgActiva(orgs);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [codigos, setCodigos] = useState<Codigo[]>([]);
  const [auds, setAuds] = useState<Aud[]>([]);
  const [nuevo, setNuevo] = useState<{ tienda: string; auditor: string; horas: string } | null>(null);
  const [generado, setGenerado] = useState<{ codigo: string; expira: string; tienda: string; auditor: string } | null>(null);
  const [error, setError] = useState('');
  const puedeGenerar = roles.some((r) => r.rol === 'SUPERADMIN' || ((r.rol === 'ADMIN_ORG' || r.rol === 'AUDITOR') && r.organizacion_id === orgId));

  useEffect(() => {
    cargarOrgsPropias(roles).then(setOrgs);
  }, [roles]);

  const cargar = useCallback(async () => {
    if (!orgId) return;
    const [t, c, a] = await Promise.all([
      sb.from('tiendas').select('*').eq('organizacion_id', orgId).eq('activa', true).order('codigo'),
      sb.from('auditoria_codigos').select('id, tienda_id, auditor, pista, expira, revocado_at, created_at').eq('organizacion_id', orgId).order('created_at', { ascending: false }).limit(50),
      sb.from('auditorias').select('id, tienda_id, auditor, estado, iniciado_at, finalizado_at').eq('organizacion_id', orgId).order('iniciado_at', { ascending: false }).limit(100),
    ]);
    setTiendas(((t.data as Tienda[]) || []).filter((x) => !x.es_central));
    setCodigos((c.data as Codigo[]) || []);
    setAuds((a.data as Aud[]) || []);
  }, [orgId, sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const nombreTienda = (id: string) => {
    const t = tiendas.find((x) => x.id === id);
    return t ? `${t.codigo} · ${t.nombre}` : '';
  };

  const generar = async () => {
    if (!nuevo) return;
    setError('');
    const { data, error: e } = await sb.rpc('crear_codigo_auditoria', { p_tienda: nuevo.tienda, p_auditor: nuevo.auditor, p_horas: Number(nuevo.horas) || 24 });
    const r = data as { ok: boolean; error?: string; codigo: string; expira: string } | null;
    if (e || !r?.ok) return setError(r?.error ?? e?.message ?? 'No se pudo generar.');
    setGenerado({ codigo: r.codigo, expira: r.expira, tienda: nombreTienda(nuevo.tienda), auditor: nuevo.auditor });
    setNuevo(null);
    cargar();
  };

  const revocar = async (id: string) => {
    if (!confirm('¿Revocar este código? Ya no se podrá usar.')) return;
    await sb.rpc('revocar_codigo_auditoria', { p_id: id });
    cargar();
  };

  const cerrar = async (id: string) => {
    if (!confirm('¿Finalizar esta auditoría desde el panel?')) return;
    await sb.rpc('auditoria_cerrar', { p_auditoria: id });
    cargar();
  };

  const [enlace, setEnlace] = useState('/auditoria');
  useEffect(() => setEnlace(`${window.location.origin}/auditoria`), []);
  const vigente = (c: Codigo) => !c.revocado_at && new Date(c.expira) > new Date();

  return (
    <div className="space-y-4">
      <Titulo accion={puedeGenerar && <Boton onClick={() => { setNuevo({ tienda: '', auditor: '', horas: '24' }); setError(''); }}>+ Código de auditoría</Boton>}>
        Auditorías
      </Titulo>
      <SelectorOrg orgs={orgs} valor={orgId} onCambio={setOrgId} />
      <Aviso tipo="info">
        Genera un código temporal para quien hará la auditoría. Lo usa en el celular de la tienda (botón <b>Auditoría</b>) o en cualquier celular
        abriendo <b>{enlace}</b>. Nada queda guardado en el celular; el reporte queda aquí y se puede imprimir.
      </Aviso>

      <div>
        <p className="mb-2 text-sm font-black">Auditorías realizadas</p>
        {auds.length === 0 && <p className="text-sm text-gray-400">Todavía no hay auditorías.</p>}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {auds.map((a) => (
            <Tarjeta key={a.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-black">{nombreTienda(a.tienda_id)}</p>
                <p className="text-xs text-gray-500">
                  {a.auditor} · {new Date(a.iniciado_at).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Insignia color={a.estado === 'ABIERTA' ? 'indigo' : 'green'}>{a.estado === 'ABIERTA' ? 'En curso' : 'Finalizada'}</Insignia>
                <a href={`/reporte-auditoria/${a.id}`} target="_blank" className="text-xs font-bold text-indigo-600 hover:underline">
                  Ver / imprimir
                </a>
                {a.estado === 'ABIERTA' && puedeGenerar && (
                  <button onClick={() => cerrar(a.id)} className="text-xs font-bold text-gray-500 hover:underline">Finalizar</button>
                )}
              </div>
            </Tarjeta>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-black">Códigos generados</p>
        {codigos.length === 0 && <p className="text-sm text-gray-400">Sin códigos.</p>}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {codigos.map((c) => (
            <Tarjeta key={c.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-bold">{nombreTienda(c.tienda_id)}</p>
                <p className="text-xs text-gray-500">
                  {c.auditor} · termina en …{c.pista} · vence {new Date(c.expira).toLocaleString()}
                </p>
              </div>
              {vigente(c) ? (
                <div className="flex items-center gap-2">
                  <Insignia color="green">Vigente</Insignia>
                  {puedeGenerar && <button onClick={() => revocar(c.id)} className="text-xs font-bold text-red-600 hover:underline">Revocar</button>}
                </div>
              ) : (
                <Insignia color="gray">{c.revocado_at ? 'Revocado' : 'Vencido'}</Insignia>
              )}
            </Tarjeta>
          ))}
        </div>
      </div>

      {nuevo && (
        <Modal titulo="Nuevo código de auditoría" onCerrar={() => setNuevo(null)}>
          <div className="space-y-3">
            <Campo etiqueta="Sucursal">
              <Selector value={nuevo.tienda} onChange={(e) => setNuevo({ ...nuevo, tienda: e.target.value })}>
                <option value="">Selecciona…</option>
                {tiendas.map((t) => <option key={t.id} value={t.id}>{t.codigo} · {t.nombre}</option>)}
              </Selector>
            </Campo>
            <Campo etiqueta="¿Quién hará la auditoría?">
              <Entrada value={nuevo.auditor} onChange={(e) => setNuevo({ ...nuevo, auditor: e.target.value })} placeholder="Nombre del auditor" />
            </Campo>
            <Campo etiqueta="Válido por">
              <Selector value={nuevo.horas} onChange={(e) => setNuevo({ ...nuevo, horas: e.target.value })}>
                <option value="4">4 horas</option>
                <option value="12">12 horas</option>
                <option value="24">24 horas</option>
                <option value="48">48 horas</option>
                <option value="72">72 horas</option>
              </Selector>
            </Campo>
            {error && <Aviso tipo="error">{error}</Aviso>}
            <Boton className="w-full" disabled={!nuevo.tienda || !nuevo.auditor.trim()} onClick={generar}>Generar código</Boton>
          </div>
        </Modal>
      )}

      {generado && (
        <Modal titulo="Código de auditoría" onCerrar={() => setGenerado(null)}>
          <div className="space-y-3 text-center">
            <p className="text-sm text-gray-500">{generado.tienda} · {generado.auditor}</p>
            <p className="select-all rounded-2xl bg-gray-50 p-4 font-mono text-4xl font-black tracking-widest">{generado.codigo}</p>
            <p className="text-xs text-gray-500">Vence {new Date(generado.expira).toLocaleString()}. Guárdalo o envíalo ahora: por seguridad no se vuelve a mostrar.</p>
            <Boton
              className="w-full"
              onClick={() =>
                navigator.clipboard?.writeText(`Código de auditoría ${generado.tienda}: ${generado.codigo}\nVence: ${new Date(generado.expira).toLocaleString()}\nEn el celular de la tienda: botón Auditoría. En otro celular: ${enlace}`)
              }
            >
              Copiar para enviar
            </Boton>
          </div>
        </Modal>
      )}
    </div>
  );
}
