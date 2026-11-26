// Lectura de los reportes de Excel del sistema del centro de distribución.
//
// 1) Traslado / existencia inicial de tienda (4ZTRAS26.RPT):
//      NUMERO: 559 · REFERENCIA: … · FECHA 23/11/2026 · BODEGA DE ENTRADA: B102 SALIDA: B090
//      COSTAL # | PIEZAS | PESO            (versiones anteriores traían además PRECIO)
//      CLASIFICACION B                     ← clase (A, B, C, D, AB…)
//      ZAPATOS                             ← producto (si no viene, es ROPA)
//      EMP02209922 | 15 | 16.5
//      ZAPATOS | 240 | 224.4               ← subtotal del producto (o fila sin nombre en ropa)
//      TOTAL | 710 | 569.5
//      Total Costales48: | 48
//
// 2) Existencias del centro / producción por contenedor (REPEXISCOS26.RPT):
//      EMBARQUE NO. | BOS 160
//      1 | EMP02203772 | | 46127 (fecha) | (fec. enviado) | | 30 (piezas) | | 1.3 (peso)
//      | | | | BISUTERÍA | 30 | 230 | | 9.9          ← producto de los costales de arriba
//      | | | | CLACIFICACION C | 20 | 270 | | 48.6   ← clase de los productos de arriba
//      | | | Totales Costales este Embarque BOS 160: | | 16 | 430 | | 212.3
//      TOTAL COSTALES EN BODEGA: | | 3523 · TOTAL DE PIEZAS: | | 176970 · TOTAL PESO: | | 98980.18

export type CostalLeido = {
  codigo: string;
  seccion: string; // producto del Excel + clase, ej. "ZAPATOS B" o "ROPA AB"
  piezas: number;
  peso: number | null;
  contenedor?: string | null;
  fecha?: string | null; // fecha de empaque yyyy-mm-dd
};

export type Traslado = {
  numero: string;
  referencia: string;
  fecha: string | null; // yyyy-mm-dd
  bodegaEntrada: string;
  bodegaSalida: string;
  documento?: string;
  costales: CostalLeido[];
  totalPiezas: number | null;
  totalCostales: number | null;
  avisos: string[];
};

export type ExistenciaCC = {
  fecha: string | null;
  costales: CostalLeido[];
  contenedores: { contenedor: string; costales: number; piezas: number; peso: number }[];
  totalCostales: number | null;
  totalPiezas: number | null;
  enviadosOmitidos: number;
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
const esCodigoCostal = (A: string) => /\d/.test(A) && /^[A-Z0-9-]+$/.test(A) && A.length >= 4;
const fechaTexto = (A: string) => {
  const m = A.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};
/** Fecha de Excel (número de serie o texto dd/mm/aaaa) → yyyy-mm-dd */
const fechaCelda = (v: unknown): string | null => {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  return fechaTexto(texto(v));
};
const CLASE = /^CLA[SC]+IFICACION\s+([A-Z0-9]+)$/;

/** ¿Qué reporte es? */
export function tipoReporte(filas: unknown[][]): 'TRASLADO' | 'EXISTENCIA_CC' | null {
  for (const f of filas.slice(0, 40)) {
    const A = sinAcentos(texto(f[0]));
    if (A.startsWith('EMBARQUE NO')) return 'EXISTENCIA_CC';
    if (A.startsWith('COSTAL')) return 'TRASLADO';
    if (f.some((c) => sinAcentos(texto(c)).includes('EXISTENCIAS DE COSTALES'))) return 'EXISTENCIA_CC';
  }
  return null;
}

export function leerTraslado(filas: unknown[][]): Traslado {
  const t: Traslado = { numero: '', referencia: '', fecha: null, bodegaEntrada: '', bodegaSalida: '', costales: [], totalPiezas: null, totalCostales: null, avisos: [] };
  let col: { piezas: number; peso: number } | null = null;
  let clase = '';
  let producto = '';
  let acumPiezas = 0;

  for (const fila of filas) {
    const a = texto(fila[0]);
    const A = sinAcentos(a);

    if (!col) {
      let m;
      if ((m = A.match(/^NUMERO:\s*(\S+)/))) t.numero = m[1];
      else if ((m = A.match(/^TIPO DOCUMENTO:\s*(\S+)/))) t.documento = m[1];
      else if ((m = a.match(/^REFERENCIA:\s*(.*)$/i))) t.referencia = m[1].trim();
      else if (A.startsWith('FECHA')) t.fecha = fechaTexto(A);
      else if ((m = A.match(/BODEGA DE ENTRADA:\s*(.+?)\s*(?:SALIDA:\s*(.+?))?\s*$/))) {
        t.bodegaEntrada = m[1].trim();
        t.bodegaSalida = (m[2] ?? '').trim();
      } else if (A.startsWith('COSTAL')) {
        const enc = fila.map((c) => sinAcentos(texto(c)));
        const pz = enc.findIndex((h) => h.startsWith('PIEZA'));
        const ps = enc.findIndex((h) => h.startsWith('PESO'));
        col = { piezas: pz > 0 ? pz : 1, peso: ps > 0 ? ps : -1 };
      }
      continue;
    }

    const pz = numero(fila[col.piezas]);
    const peso = col.peso > 0 ? numero(fila[col.peso]) : null;
    if (!a && pz === null) continue;

    let m;
    if ((m = A.match(CLASE))) {
      clase = m[1];
      producto = '';
      continue;
    }
    if (A === 'TOTAL') {
      t.totalPiezas = pz;
      continue;
    }
    if ((m = A.match(/^TOTAL COSTALES\s*(\d+)?/))) {
      t.totalCostales = pz ?? (m[1] ? Number(m[1]) : null);
      continue;
    }
    if (A.startsWith('ENTREGADO') || A.startsWith('RECIBIDO')) continue;

    if (esCodigoCostal(A) && pz !== null) {
      t.costales.push({ codigo: A, seccion: `${producto || 'ROPA'} ${clase}`.trim(), piezas: Math.round(pz), peso });
      acumPiezas += Math.round(pz);
      continue;
    }
    // Subtotal: fila sin nombre (ropa) o con el nombre del producto
    if (pz !== null && (!a || A === producto)) {
      if (Math.round(pz) !== acumPiezas)
        t.avisos.push(`${producto || 'ROPA'} ${clase}: el subtotal dice ${pz} piezas y los costales suman ${acumPiezas}.`);
      acumPiezas = 0;
      continue;
    }
    if (a && pz === null) {
      producto = A;
      acumPiezas = 0;
      continue;
    }
    t.avisos.push(`Fila no reconocida: "${a}"`);
  }

  if (!col) t.avisos.push('No se encontró la fila de encabezados (COSTAL # | PIEZAS | PESO).');
  const sumaPiezas = t.costales.reduce((s, k) => s + k.piezas, 0);
  if (t.totalPiezas !== null && Math.round(t.totalPiezas) !== sumaPiezas)
    t.avisos.push(`El total del reporte dice ${t.totalPiezas} piezas y los costales suman ${sumaPiezas}.`);
  if (t.totalCostales !== null && t.totalCostales !== t.costales.length)
    t.avisos.push(`El reporte dice ${t.totalCostales} costales y se leyeron ${t.costales.length}.`);
  if (!t.numero) t.avisos.push('No se encontró el NUMERO del traslado.');
  if (!t.bodegaEntrada) t.avisos.push('No se encontró la BODEGA DE ENTRADA.');
  return t;
}

export function leerExistenciaCC(filas: unknown[][]): ExistenciaCC {
  const r: ExistenciaCC = { fecha: null, costales: [], contenedores: [], totalCostales: null, totalPiezas: null, enviadosOmitidos: 0, avisos: [] };
  let contenedor = '';
  let sinProducto: CostalLeido[] = []; // costales esperando su fila de producto
  let sinClase: { prod: string; costales: CostalLeido[] }[] = []; // productos esperando su fila de clase

  const cerrarContenedor = () => {
    sinProducto.forEach((k) => r.avisos.push(`El costal ${k.codigo} (${contenedor}) no tiene producto.`));
    sinClase.forEach((g) => g.costales.forEach((k) => (k.seccion = g.prod)));
    if (sinClase.length) r.avisos.push(`Contenedor ${contenedor}: ${sinClase.map((g) => g.prod).join(', ')} sin clasificación.`);
    sinProducto = [];
    sinClase = [];
  };

  for (const f of filas) {
    const a = texto(f[0]);
    const A = sinAcentos(a);
    const celdas = f.map((c) => sinAcentos(texto(c)));

    if (!r.fecha) {
      const fe = celdas.find((c) => c.startsWith('FECHA '));
      if (fe) r.fecha = fechaTexto(fe);
    }
    if (A.startsWith('EMBARQUE NO')) {
      if (contenedor) cerrarContenedor();
      contenedor = texto(f[1]) || texto(f[2]);
      continue;
    }
    if (A.startsWith('TOTAL COSTALES')) {
      r.totalCostales = f.map(numero).find((n) => n !== null) ?? null;
      continue;
    }
    if (A.startsWith('TOTAL DE PIEZAS')) {
      r.totalPiezas = f.map(numero).find((n) => n !== null) ?? null;
      continue;
    }
    if (A.startsWith('TOTAL')) continue;

    const codigo = sinAcentos(texto(f[1]));
    if (numero(f[0]) !== null && esCodigoCostal(codigo)) {
      const enviado = fechaCelda(f[4]);
      // números después de las columnas de fecha: piezas y peso
      const nums = f.slice(5).map(numero).filter((n): n is number => n !== null);
      if (enviado) {
        r.enviadosOmitidos++;
        continue;
      }
      if (!nums.length) {
        r.avisos.push(`El costal ${codigo} no tiene piezas.`);
        continue;
      }
      const k: CostalLeido = {
        codigo,
        seccion: '',
        piezas: Math.round(nums[0]),
        peso: nums.length > 1 ? nums[nums.length - 1] : null,
        contenedor: contenedor || null,
        fecha: fechaCelda(f[3]),
      };
      r.costales.push(k);
      sinProducto.push(k);
      continue;
    }

    const etiqueta = celdas.slice(1, 6).find((c) => c && numero(c) === null && !/^(TOTALES|PAGINA|REPORTE|FECHA|NO\.|COSTAL|BODEGA|MARCA)/.test(c)) ?? '';
    if (!a && etiqueta) {
      const m = etiqueta.match(CLASE);
      if (m) {
        if (sinProducto.length) {
          sinClase.push({ prod: 'ROPA', costales: sinProducto });
          sinProducto = [];
        }
        sinClase.forEach((g) => g.costales.forEach((k) => (k.seccion = `${g.prod} ${m[1]}`)));
        sinClase = [];
      } else {
        sinClase.push({ prod: etiqueta, costales: sinProducto });
        sinProducto = [];
      }
    }
  }
  if (contenedor) cerrarContenedor();

  const porCont = new Map<string, { contenedor: string; costales: number; piezas: number; peso: number }>();
  r.costales.forEach((k) => {
    const c = k.contenedor ?? 'SIN CONTENEDOR';
    const x = porCont.get(c) ?? { contenedor: c, costales: 0, piezas: 0, peso: 0 };
    x.costales++;
    x.piezas += k.piezas;
    x.peso += k.peso ?? 0;
    porCont.set(c, x);
  });
  r.contenedores = Array.from(porCont.values());

  const vistos = new Set<string>();
  r.costales = r.costales.filter((k) => {
    if (vistos.has(k.codigo)) {
      r.avisos.push(`El costal ${k.codigo} aparece repetido; se tomó una vez.`);
      return false;
    }
    vistos.add(k.codigo);
    return true;
  });
  const leidos = r.costales.length + r.enviadosOmitidos;
  if (r.totalCostales !== null && r.totalCostales !== leidos)
    r.avisos.push(`El reporte dice ${r.totalCostales} costales y se leyeron ${leidos}.`);
  const sumaPiezas = r.costales.reduce((s, k) => s + k.piezas, 0);
  if (r.totalPiezas !== null && r.enviadosOmitidos === 0 && Math.round(r.totalPiezas) !== sumaPiezas)
    r.avisos.push(`El reporte dice ${r.totalPiezas} piezas y los costales suman ${sumaPiezas}.`);
  if (!r.costales.length) r.avisos.push('No se encontraron costales. ¿Es el reporte de existencias de costales?');
  return r;
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

/** Plantillas descargables con la forma de los reportes del sistema. */
export function plantillaTraslado(empresa: string): unknown[][] {
  return [
    [empresa.toUpperCase(), '', ''],
    ['TIPO DOCUMENTO: T0103', '', ''],
    [],
    ['NUMERO:        000', '', ''],
    [],
    ['REFERENCIA:  ', '', ''],
    [],
    ['FECHA dd/mm/aaaa', '', ''],
    ['BODEGA DE ENTRADA: B000 SALIDA: B090', '', ''],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    ['COSTAL #', 'PIEZAS', 'PESO'],
    ['CLASIFICACION A', '', ''],
    ['ROPA', '', ''],
    ['EMP00000001', 100, 60.5],
    ['EMP00000002', 100, 58.2],
    ['ROPA', 200, 118.7],
    ['ZAPATOS', '', ''],
    ['EMP00000003', 15, 16.5],
    ['ZAPATOS', 15, 16.5],
    [],
    ['TOTAL', 215, 135.2],
    ['Total Costales3:', 3, ''],
  ];
}

export function plantillaExistenciaCC(empresa: string): unknown[][] {
  return [
    ['', '', '', '', '', 'PAGINA: 1', '', '', ''],
    [empresa.toUpperCase(), '', '', '', '', 'FECHA dd/mm/aaaa', '', '', ''],
    ['', '', '', 'Reporte de Existencias de Costales', '', '', '', '', ''],
    [],
    ['BODEGA: TODAS'],
    ['TODOS LOS PRODUCTOS'],
    ['MARCA: TODAS'],
    [],
    ['NO.', 'COSTAL', '', 'FECHA', 'FEC.ENVIADO', 'PIEZAS', '', 'PESO', ''],
    ['EMBARQUE NO.', 'BOS 000', '', '', '', '', '', '', ''],
    [1, 'EMP00000001', '', '01/11/2026', '', '', 100, '', 60.5],
    [2, 'EMP00000002', '', '01/11/2026', '', '', 100, '', 58.2],
    ['', '', '', '', 'ROPA', 100, 200, '', 118.7],
    [3, 'EMP00000003', '', '01/11/2026', '', '', 15, '', 16.5],
    ['', '', '', '', 'ZAPATOS', 15, 15, '', 16.5],
    ['', '', '', '', 'CLASIFICACION A', 100, 215, '', 135.2],
    [],
    ['', '', '', 'Totales Costales este Embarque BOS 000:', '', 3, 215, '', 135.2],
    [],
    ['TOTAL COSTALES EN BODEGA:', '', 3, '', '', '', '', '', ''],
    [],
    ['TOTAL DE PIEZAS:', '', 215, '', '', '', '', '', ''],
    [],
    ['TOTAL PESO:', '', 135.2, '', '', '', '', '', ''],
  ];
}
