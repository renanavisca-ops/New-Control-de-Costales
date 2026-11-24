'use client';
export default function Volver() {
  return (
    <button onClick={() => (history.length > 1 ? history.back() : (location.href = '/'))} className="text-sm font-bold text-indigo-600">
      ← Volver
    </button>
  );
}
