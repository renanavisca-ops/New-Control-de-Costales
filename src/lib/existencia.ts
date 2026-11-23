// Plantilla de inventario inicial (existencia de una sucursal) y su lectura.
import { buscarProducto } from '@/lib/traslado';
import { normalizarEncabezado } from '@/lib/excel';

export const COLUMNAS_PLANTILLA = ['CODIGO', 'PRODUCTO', 'PIEZAS', 'PRECIO', 'PESO'];

export type FilaExistencia = { fila: number; codigo: string; producto: string; piezas: number; precio: number | null; peso: number | null };
export type LecturaExistencia = { filas: FilaExistencia[]; errores: string[] };

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').replace(/[Q,\s]/g, '');
  return s && /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};

/** Lee la plantilla. `productos` = nombre → piezas estándar (para completar piezas vacías). */
export function leerExistencia(celdas: unknown[][], productos: Map<string, number | null>): LecturaExistencia {
  const errores: string[] = [];
  const filas: FilaExistencia[] = [];
  const iEnc = celdas.findIndex((f) => f.map(normalizarEncabezado).some((h) => ['codigo', 'costal', 'codigocostal'].includes(h)));
  if (iEnc === -1) return { filas, errores: ['No se encontró la fila de encabezados (CODIGO, PRODUCTO, PIEZAS…). Usa la plantilla.'] };
  const enc = celdas[iEnc].map(normalizarEncabezado);
  const col = (...n: string[]) => enc.findIndex((h) => n.includes(h));
  const cCod = col('codigo', 'costal', 'codigocostal');
  const cProd = col('producto', 'categoria', 'productos');
  const cPz = col('piezas', 'pzs', 'cantidad');
  const cPre = col('precio', 'valor');
  const cPeso = col('peso', 'libras', 'lbs');
  if (cProd === -1) return { filas, errores: ['Falta la columna PRODUCTO.'] };
  const nombres = Array.from(productos.keys());
  const sinProducto = new Set<string>();
  const vistos = new Set<string>();

  celdas.slice(iEnc + 1).forEach((f, i) => {
    const n = iEnc + i + 2;
    const codigo = String(f[cCod] ?? '').trim().toUpperCase().replace(/\s+/g, '');
    const prodTxt = String(f[cProd] ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (!codigo && !prodTxt) return;
    if (!codigo) return errores.push(`Fila ${n}: falta el código.`);
    if (vistos.has(codigo)) return errores.push(`Fila ${n}: el código ${codigo} está repetido.`);
    vistos.add(codigo);
    const producto = productos.has(prodTxt) ? prodTxt : buscarProducto(prodTxt, nombres);
    if (!producto) {
      sinProducto.add(prodTxt || '(vacío)');
      return;
    }
    let piezas = cPz >= 0 ? num(f[cPz]) : null;
    if (piezas === null) piezas = productos.get(producto) ?? null;
    if (piezas === null || piezas < 0 || !Number.isInteger(piezas))
      return errores.push(`Fila ${n}: piezas no válidas y ${producto} no tiene piezas por costal definidas.`);
    filas.push({ fila: n, codigo, producto, piezas, precio: cPre >= 0 ? num(f[cPre]) : null, peso: cPeso >= 0 ? num(f[cPeso]) : null });
  });
  if (sinProducto.size) errores.unshift(`Productos que no existen en la lista: ${Array.from(sinProducto).join(', ')}.`);
  return { filas, errores };
}
