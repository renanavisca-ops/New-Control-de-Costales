'use client';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

export function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-gray-100 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function Titulo({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h1 className="text-2xl font-black tracking-tight">{children}</h1>
      {accion}
    </div>
  );
}

type Variante = 'primario' | 'secundario' | 'peligro' | 'suave';
const ESTILOS: Record<Variante, string> = {
  primario: 'bg-indigo-600 text-white hover:bg-indigo-700',
  secundario: 'bg-gray-900 text-white hover:bg-black',
  peligro: 'bg-red-600 text-white hover:bg-red-700',
  suave: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
};

export function Boton({
  variante = 'primario',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      {...props}
      className={`rounded-2xl px-4 py-3 text-sm font-bold transition active:scale-[0.98] disabled:opacity-50 ${ESTILOS[variante]} ${className}`}
    />
  );
}

export function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{etiqueta}</span>
      {children}
    </label>
  );
}

const BASE_INPUT =
  'w-full rounded-2xl border-2 border-transparent bg-gray-50 p-3 font-semibold outline-none focus:border-indigo-500';

export function Entrada(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${BASE_INPUT} ${props.className || ''}`} />;
}

export function Selector(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${BASE_INPUT} ${props.className || ''}`} />;
}

export function Aviso({ tipo, children }: { tipo: 'error' | 'exito' | 'info'; children: ReactNode }) {
  const color =
    tipo === 'error'
      ? 'bg-red-50 border-red-200 text-red-800'
      : tipo === 'exito'
        ? 'bg-green-50 border-green-200 text-green-800'
        : 'bg-indigo-50 border-indigo-200 text-indigo-800';
  return <div className={`rounded-2xl border p-3 text-sm font-semibold ${color}`}>{children}</div>;
}

export function Insignia({ children, color = 'indigo' }: { children: ReactNode; color?: 'indigo' | 'gray' | 'red' | 'green' }) {
  const c = {
    indigo: 'bg-indigo-50 text-indigo-700',
    gray: 'bg-gray-100 text-gray-600',
    red: 'bg-red-50 text-red-700',
    green: 'bg-green-50 text-green-700',
  }[color];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${c}`}>{children}</span>;
}

export function Modal({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">{titulo}</h2>
          <button onClick={onCerrar} className="text-sm font-bold text-gray-400">
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function mensajeError(e: unknown): string {
  if (!e) return 'Error desconocido';
  if (typeof e === 'string') return e;
  const m = (e as { message?: string }).message || '';
  if (m.includes('duplicate key') && m.includes('codigo')) return 'Ya existe una bodega con ese código.';
  if (m.includes('duplicate key') && m.includes('nombre')) return 'Ya existe una categoría con ese nombre.';
  if (m.includes('row-level security')) return 'No tienes permiso para esta acción.';
  return m || 'Error desconocido';
}
