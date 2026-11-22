'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { NOMBRE_ROL, ROLES_CENTRO, ROLES_EMPRESA, type Bodega, type Empresa, type Perfil, type Rol } from '@/lib/tipos';
import { Aviso, Boton, Campo, Entrada, Insignia, Modal, Selector, Tarjeta, Titulo } from '@/components/ui';

type Form = {
  id?: string;
  nombre: string;
  email: string;
  rol: Rol;
  empresa_id: string | null;
  bodega_ids: string[];
  activo: boolean;
};

type RespuestaFuncion = { ok: boolean; error?: string; data?: { password_temporal?: string } };

async function llamarFuncion(body: Record<string, unknown>): Promise<RespuestaFuncion> {
  const sb = supabaseNavegador();
  const { data, error } = await sb.functions.invoke('gestionar-usuarios', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = await ctx.json();
        return { ok: false, error: j.error || error.message };
      } catch {
        /* sin cuerpo JSON */
      }
    }
    return { ok: false, error: error.message };
  }
  return data as RespuestaFuncion;
}

export default function UsuariosCliente({ actor }: { actor: Perfil }) {
  const sb = supabaseNavegador();
  const [usuarios, setUsuarios] = useState<Perfil[]>([]);
  const [asignaciones, setAsignaciones] = useState<{ perfil_id: string; bodega_id: string }[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [credencial, setCredencial] = useState<{ email: string; password: string } | null>(null);

  const rolesPermitidos: Rol[] = actor.rol === 'ADMIN_CENTRO' ? [...ROLES_CENTRO, ...ROLES_EMPRESA] : ROLES_EMPRESA;

  const cargar = useCallback(async () => {
    const [u, a, b, e] = await Promise.all([
      sb.from('perfiles').select('*').order('nombre'),
      sb.from('perfil_bodegas').select('*'),
      sb.from('bodegas').select('*').eq('activa', true).order('codigo'),
      sb.from('empresas').select('*').order('nombre'),
    ]);
    setUsuarios((u.data as Perfil[]) || []);
    setAsignaciones(a.data || []);
    setBodegas((b.data as Bodega[]) || []);
    setEmpresas((e.data as Empresa[]) || []);
  }, [sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const nombreEmpresa = (id: string | null) => empresas.find((e) => e.id === id)?.nombre ?? '';
  const bodegasDe = (perfilId: string) =>
    asignaciones
      .filter((a) => a.perfil_id === perfilId)
      .map((a) => bodegas.find((b) => b.id === a.bodega_id)?.codigo)
      .filter(Boolean)
      .join(', ');

  const esRolEmpresa = (r: Rol) => ROLES_EMPRESA.includes(r);

  const bodegasDisponibles = useMemo(() => {
    if (!form) return [];
    return esRolEmpresa(form.rol)
      ? bodegas.filter((b) => b.empresa_id === form.empresa_id)
      : bodegas.filter((b) => b.tipo === 'CENTRAL');
  }, [form, bodegas]);

  const abrirNuevo = () => {
    const rol = rolesPermitidos.includes('OPERADOR') ? 'OPERADOR' : rolesPermitidos[0];
    setForm({ nombre: '', email: '', rol, empresa_id: actor.empresa_id ?? empresas[0]?.id ?? null, bodega_ids: [], activo: true });
    setError('');
  };

  const abrirEdicion = (u: Perfil) => {
    setForm({
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      empresa_id: u.empresa_id,
      bodega_ids: asignaciones.filter((a) => a.perfil_id === u.id).map((a) => a.bodega_id),
      activo: u.activo,
    });
    setError('');
  };

  const alternarBodega = (id: string) => {
    if (!form) return;
    const tiene = form.bodega_ids.includes(id);
    setForm({ ...form, bodega_ids: tiene ? form.bodega_ids.filter((b) => b !== id) : [...form.bodega_ids, id] });
  };

  const guardar = async () => {
    if (!form) return;
    setError('');
    if (!form.nombre.trim() || (!form.id && !form.email.trim())) return setError('Nombre y correo son obligatorios.');
    if (esRolEmpresa(form.rol) && !form.empresa_id) return setError('Selecciona la empresa.');
    if ((form.rol === 'OPERADOR' || form.rol === 'SUPERVISOR') && form.bodega_ids.length === 0)
      return setError('Asigna al menos una bodega (tienda).');

    setCargando(true);
    const res = form.id
      ? await llamarFuncion({ accion: 'actualizar', id: form.id, nombre: form.nombre, rol: form.rol, activo: form.activo, bodega_ids: form.bodega_ids })
      : await llamarFuncion({ accion: 'crear', nombre: form.nombre, email: form.email, rol: form.rol, empresa_id: form.empresa_id, bodega_ids: form.bodega_ids });
    setCargando(false);
    if (!res.ok) return setError(res.error || 'No se pudo guardar.');
    if (!form.id && res.data?.password_temporal) setCredencial({ email: form.email.trim().toLowerCase(), password: res.data.password_temporal });
    setForm(null);
    cargar();
  };

  const resetear = async (u: Perfil) => {
    if (!confirm(`¿Generar una contraseña temporal nueva para ${u.nombre}?`)) return;
    const res = await llamarFuncion({ accion: 'resetear_password', id: u.id });
    if (!res.ok) return alert(res.error);
    if (res.data?.password_temporal) setCredencial({ email: u.email, password: res.data.password_temporal });
  };

  return (
    <div>
      <Titulo accion={<Boton onClick={abrirNuevo}>+ Usuario</Boton>}>Usuarios</Titulo>
      <div className="space-y-3">
        {usuarios.map((u) => (
          <Tarjeta key={u.id} className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black">{u.nombre}</p>
                <p className="truncate text-xs text-gray-400">{u.email}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Insignia>{NOMBRE_ROL[u.rol]}</Insignia>
                  {u.empresa_id && <Insignia color="gray">{nombreEmpresa(u.empresa_id)}</Insignia>}
                  {bodegasDe(u.id) && <Insignia color="gray">{bodegasDe(u.id)}</Insignia>}
                  {!u.activo && <Insignia color="red">Inactivo</Insignia>}
                </div>
              </div>
              {u.id !== actor.id && (
                <div className="flex shrink-0 flex-col gap-2">
                  <Boton variante="suave" className="px-3 py-2" onClick={() => abrirEdicion(u)}>Editar</Boton>
                  <Boton variante="secundario" className="px-3 py-2 text-xs" onClick={() => resetear(u)}>Contraseña</Boton>
                </div>
              )}
            </div>
          </Tarjeta>
        ))}
      </div>

      {form && (
        <Modal titulo={form.id ? 'Editar usuario' : 'Nuevo usuario'} onCerrar={() => setForm(null)}>
          <Campo etiqueta="Nombre completo">
            <Entrada value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </Campo>
          <Campo etiqueta="Correo">
            <Entrada type="email" value={form.email} disabled={!!form.id} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Campo>
          <Campo etiqueta="Rol">
            <Selector
              value={form.rol}
              onChange={(e) => setForm({ ...form, rol: e.target.value as Rol, bodega_ids: [] })}
            >
              {rolesPermitidos
                .filter((r) => !form.id || esRolEmpresa(r) === esRolEmpresa(form.rol))
                .map((r) => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}
            </Selector>
          </Campo>
          {esRolEmpresa(form.rol) && actor.rol === 'ADMIN_CENTRO' && !form.id && (
            <Campo etiqueta="Empresa">
              <Selector value={form.empresa_id ?? ''} onChange={(e) => setForm({ ...form, empresa_id: e.target.value || null, bodega_ids: [] })}>
                <option value="">Selecciona…</option>
                {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </Selector>
            </Campo>
          )}
          <Campo etiqueta={form.rol === 'SUPERVISOR' ? 'Tiendas que supervisa' : 'Bodegas asignadas'}>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-2xl bg-gray-50 p-3">
              {bodegasDisponibles.length === 0 && <p className="text-xs text-gray-400">No hay bodegas para esta selección.</p>}
              {bodegasDisponibles.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={form.bodega_ids.includes(b.id)} onChange={() => alternarBodega(b.id)} />
                  {b.codigo} · {b.nombre}
                </label>
              ))}
            </div>
          </Campo>
          {form.id && (
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
              Activo
            </label>
          )}
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton className="w-full" onClick={guardar} disabled={cargando}>
            {cargando ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Crear usuario'}
          </Boton>
        </Modal>
      )}

      {credencial && (
        <Modal titulo="Contraseña temporal" onCerrar={() => setCredencial(null)}>
          <p className="text-sm text-gray-600">
            Entrégale estos datos al usuario. Al entrar por primera vez deberá crear su propia contraseña. Esta contraseña no se volverá a mostrar.
          </p>
          <div className="space-y-1 rounded-2xl bg-indigo-50 p-4 text-center">
            <p className="text-sm font-semibold text-indigo-700">{credencial.email}</p>
            <p className="select-all font-mono text-2xl font-black tracking-wider text-indigo-900">{credencial.password}</p>
          </div>
          <Boton
            className="w-full"
            onClick={() => navigator.clipboard?.writeText(`Usuario: ${credencial.email}\nContraseña temporal: ${credencial.password}`)}
          >
            Copiar
          </Boton>
        </Modal>
      )}
    </div>
  );
}
