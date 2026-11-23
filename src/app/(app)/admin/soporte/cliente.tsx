'use client';
import { useState } from 'react';
import { rpc } from '@/lib/datos';
import { Aviso, Boton, Campo, Entrada, Selector, Tarjeta, Titulo } from '@/components/ui';
import TablaSoporte from './tabla';

const DURACIONES = [
  { horas: 2, texto: '2 horas' },
  { horas: 8, texto: '8 horas' },
  { horas: 24, texto: '1 día' },
  { horas: 72, texto: '3 días' },
  { horas: 168, texto: '7 días' },
];

export default function SoporteCliente({ orgId, orgNombre, puedeOtorgar }: { orgId: string; orgNombre: string; puedeOtorgar: boolean }) {
  const [horas, setHoras] = useState(24);
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [recarga, setRecarga] = useState(0);

  const otorgar = async () => {
    setAviso(null);
    const r = await rpc('otorgar_soporte', { p_org: orgId, p_horas: horas, p_motivo: motivo });
    if (r.error) return setAviso({ ok: false, texto: r.error });
    setAviso({ ok: true, texto: 'Acceso de soporte otorgado.' });
    setMotivo('');
    setRecarga((n) => n + 1);
  };

  return (
    <div className="space-y-5">
      <Titulo>Acceso de soporte</Titulo>
      <p className="text-sm text-gray-500">
        El administrador de la plataforma no puede ver los datos de <b>{orgNombre}</b> salvo que le des acceso de soporte. El acceso es de <b>solo lectura</b>, vence solo y cada ingreso queda registrado aquí.
      </p>
      {puedeOtorgar && (
        <Tarjeta className="max-w-xl space-y-3">
          <p className="font-black">Dar acceso de soporte</p>
          <Campo etiqueta="Duración">
            <Selector value={horas} onChange={(e) => setHoras(Number(e.target.value))}>
              {DURACIONES.map((d) => (
                <option key={d.horas} value={d.horas}>
                  {d.texto}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Motivo (opcional)">
            <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. revisar diferencias de la tienda 5" />
          </Campo>
          {aviso && <Aviso tipo={aviso.ok ? 'exito' : 'error'}>{aviso.texto}</Aviso>}
          <Boton onClick={otorgar}>Dar acceso</Boton>
        </Tarjeta>
      )}
      <TablaSoporte orgId={orgId} puedeRevocar={puedeOtorgar} recarga={recarga} />
    </div>
  );
}
