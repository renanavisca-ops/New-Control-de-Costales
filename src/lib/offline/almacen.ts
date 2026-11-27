'use client';
// Almacenamiento local del celular de tienda (localStorage, con nombres por dispositivo).

export type Categoria = { id: string; nombre: string };
export type CostalLocal = { codigo: string; estado: 'EN_TRANSITO' | 'EN_TIENDA' | 'EN_PRODUCCION'; producto: string | null };
export type EnProceso = { codigo: string; producto: string | null; empleado_id: string; empleado: string; iniciado_at: string };
export type InventarioAbierto = { id: string; tipo: 'COMPLETO' | 'SELECTIVO'; productos: string[]; esperados: number; leidos: string[] };
export type DatosOffline = {
  generado_at: string;
  categorias: Categoria[];
  costales: CostalLocal[];
  en_proceso: EnProceso[];
  inventario?: InventarioAbierto | null;
  destino_saldo?: { id: string; nombre: string } | null;
  inicial_cerrado?: boolean | null;
  venta_local?: boolean | null;
  vendidos_hoy?: Vendido[];
};

export type TipoOp = 'RECIBIR' | 'INICIAR' | 'FINALIZAR' | 'RETORNO' | 'INVENTARIO' | 'VENDER' | 'ANULAR_VENTA';
export type Vendido = { codigo: string; producto: string | null; vendido_at: string; empleado: string | null };
export type Operacion = {
  id: string;
  tipo: TipoOp;
  token: string;
  empleado: { id: string; nombre: string };
  datos: Record<string, unknown>;
  ocurrido_at: string;
  estado: 'PENDIENTE' | 'OK' | 'ERROR';
  error?: string;
  resultado?: string;
};

export type Credencial = {
  empleado: { id: string; codigo: string; nombre: string };
  token: string;
  expira: string;
  verificador: string;
};

const leer = <T,>(clave: string, defecto: T): T => {
  try {
    const v = localStorage.getItem(clave);
    return v ? (JSON.parse(v) as T) : defecto;
  } catch {
    return defecto;
  }
};
const escribir = (clave: string, valor: unknown) => {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
};

export function almacen(dispositivoId: string) {
  const k = (n: string) => `cc:${dispositivoId}:${n}`;
  return {
    datos: () => leer<DatosOffline | null>(k('datos'), null),
    guardarDatos: (d: DatosOffline) => escribir(k('datos'), d),
    operaciones: () => leer<Operacion[]>(k('ops'), []),
    guardarOperaciones: (ops: Operacion[]) => {
      // Se conservan todas las pendientes y las últimas 100 ya procesadas
      const pendientes = ops.filter((o) => o.estado === 'PENDIENTE');
      const hechas = ops.filter((o) => o.estado !== 'PENDIENTE').slice(-100);
      escribir(k('ops'), [...hechas, ...pendientes].sort((a, b) => a.ocurrido_at.localeCompare(b.ocurrido_at)));
    },
    credenciales: () => leer<Record<string, Credencial>>(k('cred'), {}),
    guardarCredencial: (c: Credencial) => {
      const todas = leer<Record<string, Credencial>>(k('cred'), {});
      todas[c.empleado.codigo.toUpperCase()] = c;
      escribir(k('cred'), todas);
    },
  };
}

export const nuevoId = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

/** Aplica una operación a los datos locales para que la pantalla refleje el cambio al instante. */
export function aplicarLocal(d: DatosOffline, op: Operacion, nombreProducto: string | null): DatosOffline {
  const codigo = String(op.datos.codigo);
  const costales = [...d.costales];
  let en_proceso = [...d.en_proceso];
  const i = costales.findIndex((c) => c.codigo === codigo);
  if (op.tipo === 'RECIBIR') {
    if (i >= 0 && costales[i].estado === 'EN_TRANSITO') costales[i] = { ...costales[i], estado: 'EN_TIENDA' };
    if (i < 0) costales.push({ codigo, estado: 'EN_TIENDA', producto: nombreProducto });
  } else if (op.tipo === 'INICIAR') {
    if (i >= 0) costales[i] = { ...costales[i], estado: 'EN_PRODUCCION' };
    en_proceso.push({ codigo, producto: i >= 0 ? costales[i].producto : null, empleado_id: op.empleado.id, empleado: op.empleado.nombre, iniciado_at: op.ocurrido_at });
  } else if (op.tipo === 'FINALIZAR') {
    en_proceso = en_proceso.filter((p) => p.codigo !== codigo);
    if (i >= 0) costales.splice(i, 1);
  } else if (op.tipo === 'VENDER') {
    const producto = i >= 0 ? costales[i].producto : nombreProducto;
    if (i >= 0) costales.splice(i, 1);
    const vendidos = (d.vendidos_hoy ?? []).filter((v) => v.codigo !== codigo);
    return { ...d, costales, vendidos_hoy: [{ codigo, producto, vendido_at: op.ocurrido_at, empleado: op.empleado.nombre }, ...vendidos] };
  } else if (op.tipo === 'ANULAR_VENTA') {
    const v = (d.vendidos_hoy ?? []).find((x) => x.codigo === codigo);
    if (i < 0) costales.push({ codigo, estado: 'EN_TIENDA', producto: v?.producto ?? nombreProducto });
    return { ...d, costales, vendidos_hoy: (d.vendidos_hoy ?? []).filter((x) => x.codigo !== codigo) };
  } else if (op.tipo === 'INVENTARIO' && d.inventario && !d.inventario.leidos.includes(codigo)) {
    return { ...d, inventario: { ...d.inventario, leidos: [...d.inventario.leidos, codigo] } };
  }
  return { ...d, costales, en_proceso };
}
