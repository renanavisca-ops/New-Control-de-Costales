'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { cargarOrgsPropias, traducirError } from '@/lib/datos';
import { leerFilasExcel, normalizarEncabezado } from '@/lib/excel';
import { puedeAdministrarOrg, type AsignacionRol, type Categoria, type Organizacion } from '@/lib/tipos';
import { SelectorOrg, useOrgActiva } from '@/components/selector-org';
import { Aviso, Boton, Campo, Entrada, Insignia, Modal, Titulo } from '@/components/ui';

export default function CategoriasCliente({ roles }: { roles: AsignacionRol[] }) {
  const sb = supabaseNavegador();
  const [orgs, setOrgs] = useState<Organizacion[]>([]);
  const [orgId, setOrgId] = useOrgActiva(orgs);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [form, setForm] = useState<{ id?: string; nombre: string; piezas: string; activa: boolean } | null>(null);
  const [error, setError] = useState('');
  const [resumen, setResumen] = useState('');
  const [importando, setImportando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);
  const editable = puedeAdministrarOrg(roles, orgId);

  useEffect(() => {
    cargarOrgsPropias(roles).then(setOrgs);
  }, [roles]);

  const cargar = useCallback(async () => {
    if (!orgId) return;
    const { data } = await sb.from('categorias').select('*').eq('organizacion_id', orgId).order('nombre');
    setCategorias((data as Categoria[]) || []);
  }, [orgId, sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async () => {
    if (!form || !orgId) return;
    setError('');
    const nombre = form.nombre.trim().toUpperCase();
    if (!nombre) return setError('Escribe un nombre.');
    const piezas_estandar = form.piezas.trim() === '' ? null : Number(form.piezas);
    if (piezas_estandar !== null && (!Number.isInteger(piezas_estandar) || piezas_estandar < 0)) return setError('Piezas no válidas.');
    const { error } = form.id
      ? await sb.from('categorias').update({ nombre, piezas_estandar, activa: form.activa }).eq('id', form.id)
      : await sb.from('categorias').insert({ nombre, piezas_estandar, activa: form.activa, organizacion_id: orgId });
    if (error) return setError(traducirError(error.message));
    setForm(null);
    cargar();
  };

  const importar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo || !orgId) return;
    setImportando(true);
    setResumen('');
    try {
      const filas = await leerFilasExcel(archivo);
      if (!filas.length) return setResumen('El archivo está vacío.');
      const encabezados = filas[0].map(normalizarEncabezado);
      let col = encabezados.findIndex((h) => ['producto', 'productos', 'categoria', 'categorias', 'nombre', 'descripcion'].includes(h));
      const colPiezas = encabezados.findIndex((h) => ['piezas', 'pzs', 'piezasestandar', 'piezasporcostal', 'cantidad'].includes(h));
      let inicio = 1;
      if (col === -1) {
        col = 0; // sin encabezado reconocido: se usa la primera columna desde la primera fila
        inicio = 0;
      }
      const leidos = new Map<string, number | null>();
      filas.slice(inicio).forEach((f) => {
        const nombre = String(f[col] ?? '').trim().toUpperCase();
        if (!nombre) return;
        const p = colPiezas >= 0 ? Number(String(f[colPiezas] ?? '').trim()) : NaN;
        leidos.set(nombre, Number.isInteger(p) && p >= 0 && String(f[colPiezas] ?? '').trim() !== '' ? p : null);
      });
      const porNombre = new Map(categorias.map((c) => [c.nombre.toUpperCase(), c]));
      const nuevos = Array.from(leidos.entries()).filter(([n]) => !porNombre.has(n));
      const actualizar = Array.from(leidos.entries()).filter(([n, p]) => p !== null && porNombre.has(n) && porNombre.get(n)!.piezas_estandar !== p);
      if (nuevos.length) {
        const { error } = await sb.from('categorias').insert(nuevos.map(([nombre, piezas_estandar]) => ({ nombre, piezas_estandar, organizacion_id: orgId })));
        if (error) return setResumen(traducirError(error.message));
      }
      for (const [n, p] of actualizar) {
        await sb.from('categorias').update({ piezas_estandar: p }).eq('id', porNombre.get(n)!.id);
      }
      setResumen(`Agregados: ${nuevos.length}. Piezas actualizadas: ${actualizar.length}. Sin cambios: ${leidos.size - nuevos.length - actualizar.length}.`);
      cargar();
    } catch (err) {
      setResumen('No se pudo leer el archivo: ' + (err as Error).message);
    } finally {
      setImportando(false);
      if (archivoRef.current) archivoRef.current.value = '';
    }
  };

  return (
    <div>
      <Titulo
        accion={
          editable && (
            <div className="flex gap-2">
              <input ref={archivoRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importar} />
              <Boton variante="secundario" disabled={importando} onClick={() => archivoRef.current?.click()}>
                {importando ? 'Cargando…' : 'Cargar Excel'}
              </Boton>
              <Boton onClick={() => { setForm({ nombre: '', piezas: '', activa: true }); setError(''); }}>+ Producto</Boton>
            </div>
          )
        }
      >
        Productos
      </Titulo>
      <SelectorOrg orgs={orgs} valor={orgId} onCambio={setOrgId} />
      <p className="mb-4 text-sm text-gray-500">
        Lista de productos (categorías) de la organización. La usan todas sus tiendas y las organizaciones que abastece su centro de distribución. &quot;Piezas por costal&quot; es lo que normalmente trae un costal de ese producto. El Excel necesita una columna &quot;producto&quot; y, opcional, una columna &quot;piezas&quot;.
      </p>
      {resumen && <div className="mb-4"><Aviso tipo="info">{resumen}</Aviso></div>}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="w-full max-w-sm">
          <Entrada placeholder="Buscar producto…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-gray-600">
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
          Mostrar inactivos
        </label>
        <span className="ml-auto text-sm font-bold text-gray-400">
          {categorias.filter((c) => c.activa).length} activos · {categorias.length} en total
        </span>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-xs font-black uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3">Producto</th>
              <th className="px-5 py-3 text-right">Piezas por costal</th>
              <th className="px-5 py-3">Estado</th>
              {editable && <th className="px-5 py-3 text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categorias
              .filter((c) => (verInactivos || c.activa) && c.nombre.toLowerCase().includes(busqueda.toLowerCase()))
              .map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-black">{c.nombre}</td>
                  <td className="px-5 py-3 text-right font-mono font-bold">{c.piezas_estandar ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3">
                    <Insignia color={c.activa ? 'green' : 'gray'}>{c.activa ? 'Activo' : 'Inactivo'}</Insignia>
                  </td>
                  {editable && (
                    <td className="px-5 py-2 text-right">
                      <Boton variante="suave" className="px-3 py-1.5" onClick={() => { setForm({ id: c.id, nombre: c.nombre, piezas: c.piezas_estandar?.toString() ?? '', activa: c.activa }); setError(''); }}>
                        Editar
                      </Boton>
                    </td>
                  )}
                </tr>
              ))}
            {categorias.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-sm text-gray-400">
                  Sin productos. Agrégalos uno por uno o con &quot;Cargar Excel&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal titulo={form.id ? 'Editar producto' : 'Nuevo producto'} onCerrar={() => setForm(null)}>
          <Campo etiqueta="Nombre">
            <Entrada value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="ROPA B" />
          </Campo>
          <Campo etiqueta="Piezas por costal">
            <Entrada type="number" inputMode="numeric" min={0} value={form.piezas} onChange={(e) => setForm({ ...form, piezas: e.target.value })} placeholder="80" />
          </Campo>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} />
            Activo
          </label>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton className="w-full" onClick={guardar}>Guardar</Boton>
        </Modal>
      )}
    </div>
  );
}
