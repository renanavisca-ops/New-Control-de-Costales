import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabaseServidor } from '@/lib/supabase/server';

// Recibe el enlace del correo de Supabase (recuperación de contraseña) y crea la sesión.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const siguiente = url.searchParams.get('siguiente') || '/nueva-password';
  const destino = new URL(siguiente.startsWith('/') ? siguiente : '/nueva-password', request.url);
  const supabase = await supabaseServidor();

  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const tipo = url.searchParams.get('type') as EmailOtpType | null;

  let error: unknown = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && tipo) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo }));
  } else {
    error = 'sin código';
  }

  if (error) {
    const login = new URL('/login', request.url);
    login.searchParams.set('error', 'enlace');
    return NextResponse.redirect(login);
  }
  return NextResponse.redirect(destino);
}
