'use client';
// Verificador local del PIN (PBKDF2). Permite el ingreso sin internet sin guardar el PIN en el celular.
export async function verificadorPin(pin: string, empleadoId: string, dispositivoId: string): Promise<string> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(`cc:${empleadoId}:${dispositivoId}`), iterations: 150000 },
    base,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
}
