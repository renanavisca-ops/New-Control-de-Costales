'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { cargarOrgsPropias } from '@/lib/datos';
import {
  DESCRIPCION_ROL, NOMBRE_ROL, esSuperadmin, puedeAdministrarOrg,
  type Administrador, type AsignacionRol, type Organizacion, type Rol, type Tienda,
} from '@/lib/tipos';
import { Aviso, Boton, Campo, Entrada, Insignia, Modal, Selector, Tarjeta, Titulo } from '@/components/ui';

type Fila = AsignacionRol & { administrador_id: string };
type Form = { id?: string; nombre: string; email: string; activo: boolean; roles: AsignacionRol[] };
type Respuesta = { ok: boolean; error?: string; data?: { password_temporal?: string } };

const REQUIERE_TIENDA: Rol[] = ['SUPERVISOR', 'BODEGA'];

async function llamar(body: Record<string, unknown>): Promise<Respuesta> {
  const { data, error } = await supabaseNavegador().functions.invoke('gestionar-usuarios', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    try {
      if (ctx) return { ok: false, error: (await ctx.json()).error || error.message };
    } catch {
      /* sin cuerpo */
    }
    return { ok: false, error: error.message };
  }
  return data as Respuesta;
}

export default function UsuariosCliente({ roles, miId }: { roles: AsignacionRol[]; miId: string }) {
  const sb = supabaseNavegador();
  const superadmin = esSuperadmin(roles);
  const [admins, setAdmins] = useState<Administrador[]>([]);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [orgs, setOrgs] = useState<Organizacion[]>([]);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [credencial, setCredencial] = useState<{ email: string; password: string } | null>(null);

  const orgsAdministrables = orgs.filter((o) => puedeAdministrarOrg(roles, o.id));
  const rolesDisponibles: Rol[] = superadmin ? ['SUPERADMIN', 'ADMIN_ORG', 'SUPERVISOR', 'BODEGA', 'AUDITOR'] : ['ADMIN_ORG', 'SUPERVISOR', 'BODEGA', 'AUDITOR'];

  const cargar = useCallback(async () => {
    const [a, r, t] = await Promise.all([
      sb.from('administradores').select('id, email, nombre, activo, debe_cambiar_password').order('nombre'),
      sb.from('asignaciones_rol').select('administrador_id, rol, organizacion_id, tienda_id'),
      sb.from('tiendas').select('*').order('codigo'),
    ]);
    setAdmins((a.data as Administrador[]) || []);
    setFilas((r.data as Fila[]) || []);
    setTiendas((t.data as Tienda[]) || []);
    setOrgs(await cargarOrgsPropias(roles));
  }, [sb, roles]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const nombreOrg = (id: string | null) => orgs.find((o) => o.id === id)?.nombre ?? '';
  const nombreTienda = (id: string | null) => tiendas.find((t) => t.id === id)?.codigo ?? '';
  const describir = (r: AsignacionRol) =>
    [NOMBRE_ROL[r.rol], r.organizacion_id && nombreOrg(r.organizacion_id), r.tienda_id && nombreTienda(r.tienda_id)].filter(Boolean).join(' · ');

  const rolVacio = (): AsignacionRol => ({ rol: 'ADMIN_ORG', organizacion_id: orgsAdministrables[0]?.id ?? null, tienda_id: null });

  const cambiarRol = (i: number, cambios: Partial<AsignacionRol>) => {
    if (!form) return;
    const roles2 = form.roles.map((r, j) => {
      if (j !== i) return r;
      const nuevo = { ...r, ...cambios };
      if (nuevo.rol === 'SUPERADMIN') return { rol: nuevo.rol, organizacion_id: null, tienda_id: null };
      if (!nuevo.organizacion_id) nuevo.organizacion_id = orgsAdministrables[0]?.id ?? null;
      if (!REQUIERE_TIENDA.includes(nuevo.rol)) nuevo.tienda_id = null;
      if (cambios.organizacion_id) nuevo.tienda_id = null;
      return nuevo;
    });
    setForm({ ...form, roles: roles2 });
  };

  const guardar = async () => {
    if (!form) return;
    setError('');
    if (!form.nombre.trim() || (!form.id && !form.email.trim())) return setError('Nombre y correo son obligatorios.');
    if (!form.roles.length) return setError('Agrega al menos un rol.');
    if (form.roles.some((r) => REQUIERE_TIENDA.includes(r.rol) && !r.tienda_id)) return setError('Supervisor y Bodega requieren una tienda.');
    setCargando(true);
    const res = form.id
      ? await llamar({ accion: 'actualizar', id: form.id, nombre: form.nombre, activo: form.activo, ...(form.id !== miId ? { roles: form.roles } : {}) })
      : await llamar({ accion: 'crear', nombre: form.nombre, email: form.email, roles: form.roles });
    setCargando(false);
    if (!res.ok) return setError(res.error || 'No se pudo guardar.');
    if (!form.id && res.data?.password_temporal) setCredencial({ email: form.email.trim().toLowerCase(), password: res.data.password_temporal });
    setForm(null);
    cargar();
  };

  const resetear = async (a: Administrador) => {
    if (!confirm(`¿Generar una contraseña temporal nueva para ${a.nombre}?`)) return;
    const res = await llamar({ accion: 'resetear_password', id: a.id });
    if (!res.ok) return alert(res.error);
    if (res.data?.password_temporal) setCredencial({ email: a.email, password: res.data.password_temporal });
  };

  return (
    <div>
      <Titulo accion={<Boton onClick={() => { setForm({ nombre: '', email: '', activo: true, roles: [rolVacio()] }); setError(''); }}>+ Usuario</Boton>}>
        Usuarios administradores
      </Titulo>
      <p className="mb-4 text-sm text-gray-500">Personas que entran con correo y contraseña. Los empleados de tienda se manejan en la sección Empleados.</p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {admins.map((a) => {
          const susRoles = filas.filter((f) => f.administrador_id === a.id);
          return (
            <Tarjeta key={a.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black">{a.nombre}</p>
                <p className="truncate text-xs text-gray-400">{a.email}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {susRoles.map((r, i) => <Insignia key={i}>{describir(r)}</Insignia>)}
                  {!a.activo && <Insignia color="red">Inactivo</Insignia>}
                </div>
              </div>
              {a.id !== miId && (
                <div className="flex shrink-0 flex-col gap-2">
                  <Boton variante="suave" className="px-3 py-2" onClick={() => { setForm({ id: a.id, nombre: a.nombre, email: a.email, activo: a.activo, roles: susRoles.map(({ rol, organizacion_id, tienda_id }) => ({ rol, organizacion_id, tienda_id })) }); setError(''); }}>
                    Editar
                  </Boton>
                  <Boton variante="secundario" className="px-3 py-2 text-xs" onClick={() => resetear(a)}>Contraseña</Boton>
                </div>
              )}
            </Tarjeta>
          );
        })}
      </div>

      {form && (
        <Modal titulo={form.id ? 'Editar usuario' : 'Nuevo usuario'} onCerrar={() => setForm(null)}>
          <Campo etiqueta="Nombre completo">
            <Entrada value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </Campo>
          <Campo etiqueta="Correo">
            <Entrada type="email" value={form.email} disabled={!!form.id} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Campo>

          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Roles</span>
            {form.roles.map((r, i) => (
              <div key={i} className="space-y-2 rounded-2xl bg-gray-50 p-3">
                <div className="flex gap-2">
                  <Selector value={r.rol} onChange={(e) => cambiarRol(i, { rol: e.target.value as Rol })}>
                    {rolesDisponibles.map((x) => <option key={x} value={x}>{NOMBRE_ROL[x]}</option>)}
                  </Selector>
                  <button className="px-2 text-sm font-bold text-red-500" onClick={() => setForm({ ...form, roles: form.roles.filter((_, j) => j !== i) })}>✕</button>
                </div>
                <p className="text-[11px] text-gray-400">{DESCRIPCION_ROL[r.rol]}</p>
                {r.rol !== 'SUPERADMIN' && (
                  <Selector value={r.organizacion_id ?? ''} onChange={(e) => cambiarRol(i, { organizacion_id: e.target.value })}>
                    {orgsAdministrables.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                  </Selector>
                )}
                {REQUIERE_TIENDA.includes(r.rol) && (
                  <Selector value={r.tienda_id ?? ''} onChange={(e) => cambiarRol(i, { tienda_id: e.target.value || null })}>
                    <option value="">Selecciona tienda…</option>
                    {tiendas.filter((t) => t.organizacion_id === r.organizacion_id).map((t) => <option key={t.id} value={t.id}>{t.codigo} · {t.nombre}</option>)}
                  </Selector>
                )}
              </div>
            ))}
            {form.id !== miId && (
              <Boton variante="suave" className="w-full" onClick={() => setForm({ ...form, roles: [...form.roles, rolVacio()] })}>+ Agregar rol</Boton>
            )}
            <p className="text-[11px] text-gray-400">Para un supervisor de varias tiendas, agrega un rol Supervisor por cada tienda.</p>
          </div>

          {form.id && (
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
              Activo
            </label>
          )}
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton className="w-full" onClick={guardar} disabled={cargando}>{cargando ? 'Guardando…' : 'Guardar'}</Boton>
        </Modal>
      )}

      {credencial && (
        <Modal titulo="Contraseña temporal" onCerrar={() => setCredencial(null)}>
          <p className="text-sm text-gray-600">Entrégale estos datos. Al entrar deberá crear su propia contraseña. No se volverá a mostrar.</p>
          <div className="space-y-1 rounded-2xl bg-indigo-50 p-4 text-center">
            <p className="text-sm font-semibold text-indigo-700">{credencial.email}</p>
            <p className="select-all font-mono text-2xl font-black tracking-wider text-indigo-900">{credencial.password}</p>
          </div>
          <Boton className="w-full" onClick={() => navigator.clipboard?.writeText(`Usuario: ${credencial.email}\nContraseña temporal: ${credencial.password}`)}>Copiar</Boton>
        </Modal>
      )}
    </div>
  );
}
