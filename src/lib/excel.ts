'use client';
// Carga SheetJS (versión oficial y segura) desde su CDN solo cuando se necesita leer un Excel.
const URL_SHEETJS = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

type SheetJS = {
  read: (data: ArrayBuffer, opts: { type: 'array' }) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: { sheet_to_json: (hoja: unknown, opts: { header: 1; defval: string }) => unknown[][] };
};

let cache: Promise<SheetJS> | null = null;

function cargar(): Promise<SheetJS> {
  if (!cache) cache = import(/* webpackIgnore: true */ URL_SHEETJS) as Promise<SheetJS>;
  return cache;
}

/** Devuelve las filas de la primera hoja como matriz de celdas. */
export async function leerFilasExcel(archivo: File): Promise<unknown[][]> {
  const XLSX = await cargar();
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  return XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' });
}

export const normalizarEncabezado = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
