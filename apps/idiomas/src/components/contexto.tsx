'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabaseNavegador } from '@/lib/supabase/client';
import { traductor } from '@/lib/i18n';
import type { Perfil } from '@/lib/tipos';

interface Estado {
  cargando: boolean;
  sesion: boolean;
  perfil: Perfil | null;
  t: (k: string) => string;
  recargar: () => Promise<void>;
}
const Ctx = createContext<Estado | null>(null);

export function ProveedorApp({ children }: { children: React.ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [sesion, setSesion] = useState(false);
  const [perfil, setPerfil] = useState<Perfil | null>(null);

  const recargar = useCallback(async () => {
    const sb = supabaseNavegador();
    const { data: { user } } = await sb.auth.getUser();
    setSesion(!!user);
    if (user) {
      const { data } = await sb.rpc('mi_perfil');
      setPerfil((data as Perfil) ?? { miembro: false });
    } else {
      setPerfil(null);
    }
    setCargando(false);
  }, []);

  useEffect(() => { recargar(); }, [recargar]);
  useEffect(() => {
    if (perfil?.idioma_interfaz) document.documentElement.lang = perfil.idioma_interfaz;
  }, [perfil?.idioma_interfaz]);

  const t = useMemo(() => traductor(perfil?.idioma_interfaz || 'es-419'), [perfil?.idioma_interfaz]);
  return <Ctx.Provider value={{ cargando, sesion, perfil, t, recargar }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp fuera del proveedor');
  return v;
}

/** Traduce los códigos de error del servidor a mensajes claros. */
export function mensajeError(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e);
  const mapa: Record<string, string> = {
    no_miembro: 'Tu cuenta todavía no forma parte del piloto de Puente.',
    codigo_invalido: 'El código de invitación no es válido o ya se usó.',
    cupo_lleno: 'El piloto ya alcanzó su cupo de participantes.',
    inscripciones_cerradas: 'Las inscripciones están cerradas por ahora.',
    cuenta_no_permitida: 'Esta cuenta no puede unirse a la app de idiomas.',
    limite_sesiones_dia: 'Llegaste al límite de sesiones de hoy en el piloto. ¡Vuelve mañana!',
    actividad_bloqueada: 'Esta actividad todavía está bloqueada.',
    sin_material_para_practicar: 'Completa una lección para tener material de práctica.',
    'Invalid login credentials': 'Correo o contraseña incorrectos.',
  };
  for (const [k, v] of Object.entries(mapa)) if (m.includes(k)) return v;
  return 'Ocurrió un problema. Inténtalo de nuevo.';
}
