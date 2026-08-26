import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Role, User } from '../types';
import { gasService } from '../services/gasService';

type ShopStat = {
  id: string;
  nombre: string;
  received: number;
  opened: number;
  pending: number;
};

type DashboardData = {
  shopStats: ShopStat[];
  userStats?: { email: string; count: number; avgDiff: number }[];
  avgGlobalDiff?: number;
};

const USER_STORAGE_KEY = 'cc_user_session';

const readSessionUser = (): User | null => {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const DashboardLauncher: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => readSessionUser());
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const syncSession = () => {
      const nextUser = readSessionUser();
      setUser((current) => {
        if (current?.email === nextUser?.email && current?.rol === nextUser?.rol && current?.tienda === nextUser?.tienda) {
          return current;
        }
        return nextUser;
      });
      if (!nextUser) setOpen(false);
    };

    syncSession();
    const timer = window.setInterval(syncSession, 700);
    window.addEventListener('storage', syncSession);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', syncSession);
    };
  }, []);

  const isAdmin = user?.rol === Role.ADMIN || user?.rol === Role.ADMIN_2;

  const loadDashboard = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      const res: any = await gasService.getReports(isAdmin ? undefined : user.tienda);
      if (!res?.ok) {
        setError(res?.error || 'No se pudo cargar el Dashboard.');
        return;
      }

      setData(res.data || { shopStats: [] });
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Dashboard load failed:', err);
      setError('No se pudo conectar con los datos del Dashboard.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

  useEffect(() => {
    if (!open || !user) return;

    loadDashboard();
    const timer = window.setInterval(loadDashboard, 30000);
    return () => window.clearInterval(timer);
  }, [open, user, loadDashboard]);

  const visibleStats = useMemo(() => {
    const rows = data?.shopStats || [];
    if (isAdmin) return rows;
    return rows.filter((row) => row.id === user?.tienda);
  }, [data, isAdmin, user?.tienda]);

  const totals = useMemo(() => {
    return visibleStats.reduce(
      (acc, row) => ({
        received: acc.received + Number(row.received || 0),
        opened: acc.opened + Number(row.opened || 0),
        pending: acc.pending + Number(row.pending || 0),
      }),
      { received: 0, opened: 0, pending: 0 }
    );
  }, [visibleStats]);

  const userPerformance = useMemo(() => {
    if (!user) return null;
    return data?.userStats?.find((row) => row.email.toLowerCase() === user.email.toLowerCase()) || null;
  }, [data?.userStats, user]);

  if (!user) return null;

  return (
    <>
      <div className="max-w-lg mx-auto bg-gray-50/50 px-4 pt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-[44px] inline-flex items-center gap-2 rounded-2xl bg-gray-900 px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg active:scale-95 transition-transform"
          aria-label="Abrir Dashboard"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-12h6V4h-6v4Z" />
          </svg>
          Dashboard
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="min-h-full flex items-start sm:items-center justify-center p-4 py-6">
            <section className="w-full max-w-lg rounded-[36px] bg-gray-50 p-5 sm:p-7 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="dashboard-title">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Control de Costales</p>
                  <h2 id="dashboard-title" className="text-3xl font-black tracking-tighter text-gray-900">Dashboard</h2>
                  <p className="mt-1 text-xs font-bold text-gray-400 truncate">
                    {isAdmin ? 'Vista general de todas las tiendas' : `Tienda ${user.tienda}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-11 min-w-11 rounded-2xl bg-white px-3 font-black text-gray-500 shadow-sm border border-gray-100"
                  aria-label="Cerrar Dashboard"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="rounded-3xl bg-blue-50 p-3 sm:p-4 text-center">
                  <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-blue-500">Recibidos</p>
                  <p className="mt-2 text-3xl font-black text-blue-700">{totals.received}</p>
                </div>
                <div className="rounded-3xl bg-orange-50 p-3 sm:p-4 text-center">
                  <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-orange-500">Abiertos</p>
                  <p className="mt-2 text-3xl font-black text-orange-700">{totals.opened}</p>
                </div>
                <div className="rounded-3xl bg-emerald-50 p-3 sm:p-4 text-center">
                  <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-emerald-500">Stock</p>
                  <p className="mt-2 text-3xl font-black text-emerald-700">{totals.pending}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-3xl bg-white p-4 border border-gray-100">
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Tu diferencia prom.</p>
                  <p className="mt-2 text-2xl font-black text-gray-900">{Number(userPerformance?.avgDiff || 0).toFixed(1)}</p>
                  <p className="text-[10px] font-bold text-gray-400">piezas</p>
                </div>
                <div className="rounded-3xl bg-white p-4 border border-gray-100">
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Aperturas tuyas</p>
                  <p className="mt-2 text-2xl font-black text-gray-900">{userPerformance?.count || 0}</p>
                  <p className="text-[10px] font-bold text-gray-400">registradas</p>
                </div>
              </div>

              {isAdmin && (
                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <h3 className="text-sm font-black text-gray-900">Resumen por tienda</h3>
                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">{visibleStats.length} tiendas</span>
                  </div>

                  {visibleStats.map((shop) => (
                    <div key={shop.id} className="rounded-3xl bg-white p-4 border border-gray-100">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-black text-sm text-gray-900 truncate">{shop.nombre}</p>
                          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">{shop.id}</p>
                        </div>
                        <div className="flex gap-3 text-right">
                          <div><p className="text-[8px] font-black uppercase text-blue-400">Rec.</p><p className="font-black text-blue-700">{shop.received}</p></div>
                          <div><p className="text-[8px] font-black uppercase text-orange-400">Abr.</p><p className="font-black text-orange-700">{shop.opened}</p></div>
                          <div><p className="text-[8px] font-black uppercase text-emerald-500">Stock</p><p className="font-black text-emerald-700">{shop.pending}</p></div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {!loading && visibleStats.length === 0 && (
                    <div className="rounded-3xl border border-dashed border-gray-200 p-8 text-center text-sm font-bold text-gray-400">Sin datos de tiendas todavía.</div>
                  )}
                </div>
              )}

              {error && (
                <div className="mt-5 rounded-3xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700" role="alert">
                  {error}
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Última actualización</p>
                  <p className="text-xs font-bold text-gray-600">{lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pendiente'}</p>
                </div>
                <button
                  type="button"
                  onClick={loadDashboard}
                  disabled={loading}
                  className="min-h-[44px] rounded-2xl bg-indigo-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg disabled:opacity-50"
                >
                  {loading ? 'Actualizando...' : 'Actualizar'}
                </button>
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
};

export default DashboardLauncher;
