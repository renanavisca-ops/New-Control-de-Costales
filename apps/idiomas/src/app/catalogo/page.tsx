'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Marco } from '@/components/marco';
import { mensajeError } from '@/components/contexto';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { Curso } from '@/lib/tipos';

function Catalogo() {
  const [base, setBase] = useState('es');
  const [cursos, setCursos] = useState<Curso[] | null>(null);
  const [error, setError] = useState('');
  const router = useRouter();
  useEffect(() => {
    supabaseNavegador().rpc('catalogo', { p_idioma_base: base }).then(({ data, error }) => {
      if (error) setError(mensajeError(error)); else setCursos(data as Curso[]);
    });
  }, [base]);
  const inscribir = async (c: Curso) => {
    if (c.inscripcion_id) return router.push(`/curso/${c.inscripcion_id}`);
    const { data, error } = await supabaseNavegador().rpc('inscribirme', { p_curso: c.courseId, p_modo: 'cero' });
    if (error) setError(mensajeError(error)); else router.push(`/curso/${(data as { inscripcion_id: string }).inscripcion_id}`);
  };
  return (
    <div className="pila">
      <h1>Elige un curso</h1>
      <label className="campo"><span>Aprender desde</span>
        <select value={base} onChange={(e) => setBase(e.target.value)}>
          <option value="es">Español</option><option value="en">English</option>
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      {cursos?.length === 0 && <p className="suave">No hay cursos publicados para ese idioma base todavía.</p>}
      <ul className="ruta">
        {cursos?.map((c) => (
          <li key={c.courseId}>
            <button className="nodo" style={{ width: '100%', font: 'inherit', cursor: 'pointer' }} onClick={() => inscribir(c)}>
              <span className="icono" aria-hidden>{c.targetLocale.toUpperCase()}</span>
              <span style={{ textAlign: 'left' }}>
                <h3>{c.titulo}</h3>
                <span className="suave peq">Hasta {c.maxCefr} · {Object.entries(c.capabilities).filter(([k, v]) => v && k !== 'conversacion_ia').map(([k]) => k).join(', ')}</span>
                <br /><span className="chip">{c.inscripcion_id ? 'Continuar' : 'Empezar desde cero'}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
export default function Pagina() { return <Marco><Catalogo /></Marco>; }
