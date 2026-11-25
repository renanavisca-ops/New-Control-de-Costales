'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Marco } from '@/components/marco';
import { mensajeError, useApp } from '@/components/contexto';
import { supabaseNavegador } from '@/lib/supabase/client';
import { IDIOMAS_INTERFAZ } from '@/lib/i18n';
import { pendientes, sincronizarCola } from '@/lib/offline';

function Perfil() {
  const { perfil, recargar, t } = useApp();
  const sb = supabaseNavegador();
  const [msg, setMsg] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [cola, setCola] = useState(0);
  const [zonas, setZonas] = useState<string[]>([]);
  useEffect(() => {
    setCola(pendientes());
    try { setZonas((Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone')); } catch { setZonas([]); }
  }, []);
  if (!perfil?.miembro) return <p className="suave">Cargando…</p>;

  const guardar = async (cambios: Record<string, unknown>) => {
    const { error } = await sb.rpc('actualizar_preferencias', cambios);
    setMsg(error ? mensajeError(error) : 'Guardado.');
    recargar();
  };
  const eliminarCurso = async (id: string) => {
    if (!confirm('Se borrará el avance, los repasos y el XP de este curso. Los demás cursos no cambian. ¿Continuar?')) return;
    const { error } = await sb.rpc('eliminar_inscripcion', { p_insc: id, p_confirmacion: 'ELIMINAR' });
    setMsg(error ? mensajeError(error) : 'Curso eliminado.');
    recargar();
  };
  const archivar = async (id: string) => { await sb.rpc('archivar_inscripcion', { p_insc: id }); recargar(); };
  const eliminarPerfil = async () => {
    const r = await fetch('/api/eliminar-perfil', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmacion: confirmar }) });
    const j = await r.json();
    if (!j.ok) { setMsg(j.error === 'confirmacion_requerida' ? 'Escribe ELIMINAR para confirmar.' : 'No se pudo eliminar.'); return; }
    alert(j.cuenta_compartida_conservada
      ? 'Tus datos de idiomas se eliminaron. Tu cuenta se conserva porque también la usas en otra app.'
      : 'Tus datos de idiomas y tu cuenta se eliminaron.');
    location.href = '/';
  };

  return (
    <div className="pila">
      <h1>{t('perfil.titulo')}</h1>
      {msg && <p className="info" role="status">{msg}</p>}
      <div className="tarjeta pila">
        <label className="campo"><span>{t('perfil.interfaz')}</span>
          <select value={perfil.idioma_interfaz} onChange={(e) => guardar({ p_idioma_interfaz: e.target.value })}>
            {IDIOMAS_INTERFAZ.map((l) => <option key={l.codigo} value={l.codigo}>{l.nombre}</option>)}
          </select>
        </label>
        <p className="suave peq">Cambia solo los menús. Tus cursos y su avance no cambian.</p>
        <label className="campo"><span>{t('perfil.zona')}</span>
          <select value={perfil.zona_horaria} onChange={(e) => guardar({ p_zona: e.target.value })}>
            {(zonas.length ? zonas : [perfil.zona_horaria!]).map((z) => <option key={z}>{z}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'start' }}>
          <input type="checkbox" checked={!!perfil.consentimiento_reportes} onChange={(e) => guardar({ p_consentimiento_reportes: e.target.checked })} />
          <span>{t('perfil.consent')}</span>
        </label>
      </div>
      <div className="tarjeta pila">
        <h2>Cursos</h2>
        {(perfil.inscripciones || []).map((c) => (
          <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ flex: 1 }}>{c.titulo} {c.estado === 'archivada' && <span className="chip">archivado</span>}</strong>
            {c.estado === 'activa' && <button className="boton borde" onClick={() => archivar(c.id)}>Archivar</button>}
            <button className="boton borde" onClick={() => eliminarCurso(c.id)}>{t('perfil.eliminar_curso')}</button>
          </div>
        ))}
        <Link href="/catalogo">Añadir o reactivar un curso</Link>
      </div>
      <div className="tarjeta pila">
        <h2>Sin conexión</h2>
        <p className="suave">{cola} eventos pendientes de enviar.</p>
        <button className="boton sec" onClick={async () => { await sincronizarCola(); setCola(pendientes()); }}>Sincronizar ahora</button>
      </div>
      {(perfil.rol === 'editor' || perfil.rol === 'revisor' || perfil.rol === 'admin') && <Link className="boton sec" href="/editor">Consola editorial</Link>}
      <div className="tarjeta pila">
        <h2>{t('perfil.eliminar_perfil')}</h2>
        <p className="suave">{t('perfil.eliminar_aviso')}</p>
        <label className="campo"><span>Escribe ELIMINAR para confirmar</span><input type="text" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} /></label>
        <button className="boton peligro" disabled={confirmar !== 'ELIMINAR'} onClick={eliminarPerfil}>{t('perfil.eliminar_perfil')}</button>
      </div>
      <button className="boton borde" onClick={async () => { await sb.auth.signOut(); location.href = '/'; }}>{t('acc.salir')}</button>
    </div>
  );
}
export default function Pagina() { return <Marco><Perfil /></Marco>; }
