'use client';
import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/config';

let cliente: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseNavegador() {
  if (!cliente) cliente = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return cliente;
}
