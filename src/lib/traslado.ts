// Lectura del reporte de traslado del centro de distribución (4ZTRAS99.RPT exportado a Excel).
//
// Formato:
//   NUMERO:  559 · REFERENCIA: … · FECHA 23/11/2026 · BODEGA DE ENTRADA: B102 SALIDA: B090
//   COSTAL # | PIEZAS | PRECIO | PESO
//   CLASIFICACION B            ← clase (A, B, C, D, AB…)
//   ZAPATOS                    ← producto (si no viene, es ROPA)
//   EMP02209922 | 15 | 45 | 16.5
//   ZAPATOS | 240 | 720 | …     ← subtotal del producto (o fila vacía en ropa)
//   TOTAL | 710 | 3064.5 | …
//   Total Costales48: | 48

export type CostalTraslado = {
  codigo: string;
  seccion: string; // nombre del Excel + clase, ej. "ZAPATOS B" o "ROPA AB"
  piezas: number;
  precio: number;
  peso: number | null;
};

export type Traslado = {
  numero: string;
  referencia: string;
  fecha: string | null; // yyyy-mm-dd
  bodegaEntrada: string;
  bodegaSalida: string;
  costales: CostalTraslado[];
  totalPiezas: number | null;
  totalPrecio: number | null;
  totalCostales: number | null;
  avisos: string[];
};

const texto = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const numero = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = texto(v).replace(/,/g, '');
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
};
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export function leerTraslado(filas: unknown[][]): Traslado {
  const t: Traslado = {
    numero: '', referencia: '', fecha: null, bodegaEntrada: '', bodegaSalida: '',
    costales: [], totalPiezas: null, totalPrecio: null, totalCostales: null, avisos: [],
  };
  let enDetalle = false;
  let clase = '';
  let producto = '';
  let acumPiezas = 0;
  let acumPrecio = 0;

  const cerrarProducto = (subPiezas: number | null, subPrecio: number | null) => {
    const nombre = `${producto || 'ROPA'} ${clase}`.trim();
    if (subPiezas !== null && Math.round(subPiezas) !== Math.round(acumPiezas))
      t.avisos.push(`${nombre}: el subtotal dice ${subPiezas} piezas y los costales suman ${acumPiezas}.`);
    if (subPrecio !== null && Math.abs(subPrecio - acumPrecio) > 0.05)
      t.avisos.push(`${nombre}: el subtotal dice Q${subPrecio} y los costales suman Q${acumPrecio.toFixed(2)}.`);
    acumPiezas = 0;
    acumPrecio = 0;
  };

  for (const fila of filas) {
    const a = texto(fila[0]);
    const A = sinAcentos(a);
    const b = numero(fila[1]);
    const c = numero(fila[2]);
    const d = numero(fila[3]);
    if (!a && b === null) continue;

    if (!enDetalle) {
      let m;
      if ((m = A.match(/^NUMERO:\s*(\S+)/))) t.numero = m[1];
      else if ((m = a.match(/^REFERENCIA:\s*(.*)$/i))) t.referencia = m[1].trim();
      else if ((m = A.match(/^FECHA:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/)))
        t.fecha = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      else if ((m = A.match(/BODEGA DE ENTRADA:\s*(\S+)(?:\s+SALIDA:\s*(\S+))?/))) {
        t.bodegaEntrada = m[1];
        t.bodegaSalida = m[2] ?? '';
      } else if (A.startsWith('COSTAL')) enDetalle = true;
      continue;
    }

    let m;
    if ((m = A.match(/^CLA[SC]+IFICACION\s+([A-Z0-9]+)$/))) {
      clase = m[1];
      producto = '';
      continue;
    }
    if (A === 'TOTAL') {
      t.totalPiezas = b;
      t.totalPrecio = c;
      continue;
    }
    if ((m = A.match(/^TOTAL COSTALES\s*(\d+)?/))) {
      t.totalCostales = b ?? (m[1] ? Number(m[1]) : null);
      continue;
    }
    if (A.startsWith('ENTREGADO') || A.startsWith('RECIBIDO')) continue;

    const esCodigo = /\d/.test(a) && /^[A-Z0-9-]+$/.test(A);
    if (esCodigo && b !== null) {
      t.costales.push({
        codigo: A,
        seccion: `${producto || 'ROPA'} ${clase}`.trim(),
        piezas: Math.round(b),
        precio: c ?? 0,
        peso: d,
      });
      acumPiezas += Math.round(b);
      acumPrecio += c ?? 0;
      continue;
    }
    // Subtotal: fila vacía (ropa) o con el nombre del producto, con números
    if (b !== null && (!a || A === producto)) {
      cerrarProducto(b, c);
      continue;
    }
    // Encabezado de producto
    if (a && b === null) {
      producto = A;
      acumPiezas = 0;
      acumPrecio = 0;
      continue;
    }
    t.avisos.push(`Fila no reconocida: "${a}"`);
  }

  const sumaPiezas = t.costales.reduce((s, k) => s + k.piezas, 0);
  const sumaPrecio = t.costales.reduce((s, k) => s + k.precio, 0);
  if (t.totalPiezas !== null && Math.round(t.totalPiezas) !== sumaPiezas)
    t.avisos.push(`El total del reporte dice ${t.totalPiezas} piezas y los costales suman ${sumaPiezas}.`);
  if (t.totalPrecio !== null && Math.abs(t.totalPrecio - sumaPrecio) > 0.05)
    t.avisos.push(`El total del reporte dice Q${t.totalPrecio} y los costales suman Q${sumaPrecio.toFixed(2)}.`);
  if (t.totalCostales !== null && t.totalCostales !== t.costales.length)
    t.avisos.push(`El reporte dice ${t.totalCostales} costales y se leyeron ${t.costales.length}.`);
  if (!t.numero) t.avisos.push('No se encontró el NUMERO del traslado.');
  if (!t.bodegaEntrada) t.avisos.push('No se encontró la BODEGA DE ENTRADA.');
  return t;
}

/** Busca el producto del sistema para una sección del Excel ("ZAPATOS B" → "ZAPATO B"). */
export function buscarProducto(seccion: string, productos: string[]): string | null {
  const lista = new Map(productos.map((p) => [sinAcentos(p).replace(/\s+/g, ' ').trim(), p]));
  const s = sinAcentos(seccion);
  const partes = s.split(' ');
  const clase = partes.length > 1 ? partes.pop()! : '';
  const base = partes.join(' ');
  const variantes = [base, base.replace(/ES$/, ''), base.replace(/S$/, ''), base.split(' ').map((w) => w.replace(/S$/, '')).join(' ')];
  for (const v of variantes) {
    const hit = lista.get(`${v} ${clase}`.trim());
    if (hit) return hit;
  }
  return null;
}
