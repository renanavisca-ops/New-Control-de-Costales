import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { MANUALES, type TipoManual } from '../../datos';
import { manualesPermitidos } from '../../acceso';

export async function GET(req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const tipo = (await params).tipo as TipoManual;
  if (!MANUALES[tipo]) return new NextResponse('No encontrado', { status: 404 });
  if (tipo === 'tienda') return NextResponse.redirect(new URL('/manuales/manual-tienda.pdf', req.url));
  if (!(await manualesPermitidos()).includes(tipo)) return NextResponse.redirect(new URL('/login', req.url));
  const pdf = await readFile(path.join(process.cwd(), 'manuales-privados', MANUALES[tipo].pdf));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${MANUALES[tipo].pdf}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
