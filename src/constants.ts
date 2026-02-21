
export const PIECES_MAP: Record<string, number> = {
  'EXCLUSIVA A': 20,
  'ROPA A': 100,
  'ZAPATO A': 15,
  'CARTERA A': 15,
  'PELUCHE A': 10,
  'CINCHO A': 15,
  'ROPA B': 80,
  'ZAPATO B': 15,
  'CARTERA B': 15,
  'PELUCHE B': 15,
  'CINCHO B': 15,
  'ROPA C': 80,
  'ZAPATO C': 20,
  'ACCESORIOS C': 15,
  'ELECTRONICOS C': 15,
  'BISUTERIA C': 20,
  'JUGUETE C': 15,
  'ROPA GRANDE C': 65,
  'PACA C': 200,
  'TEXTIL A': 10,
  'TEXTIL B': 10,
  'TEXTIL C': 10,
  'SALDO': 0 // Dynamic value
};

export const CATEGORIES = Object.keys(PIECES_MAP);

export const INITIAL_STORES = [
  { id_tienda: 'T01', nombre: 'Tienda 1' },
  { id_tienda: 'T02', nombre: 'Tienda 2' },
  { id_tienda: 'T03', nombre: 'Tienda 3' },
  { id_tienda: 'T04', nombre: 'Tienda 4' },
  { id_tienda: 'T05', nombre: 'Tienda 5' },
  { id_tienda: 'T06', nombre: 'Tienda 6' },
  { id_tienda: 'T07', nombre: 'Montserrat' },
  { id_tienda: 'T08', nombre: 'Metro Sur' },
  { id_tienda: 'T09', nombre: 'Amatitlan' },
  { id_tienda: 'T10', nombre: 'Pacific' },
  { id_tienda: 'T11', nombre: 'Mazate' },
  { id_tienda: 'T12', nombre: 'Centra Norte' },
  { id_tienda: 'T13', nombre: 'CC' }
];
