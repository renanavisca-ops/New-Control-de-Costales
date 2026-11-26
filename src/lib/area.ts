// Área activa del panel (plataforma u organización), guardada en una cookie para que el servidor la conozca.
export const COOKIE_AREA = 'cc_area';
export const AREA_PLATAFORMA = 'plataforma';
export const PREFIJO_CENTRO = 'centro:';

export function fijarAreaCliente(valor: string) {
  document.cookie = `${COOKIE_AREA}=${encodeURIComponent(valor)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  try {
    if (valor !== AREA_PLATAFORMA && !valor.startsWith(PREFIJO_CENTRO)) localStorage.setItem('cc_org_activa', valor);
  } catch {
    /* sin almacenamiento */
  }
}

export function leerAreaCliente(): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_AREA}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
