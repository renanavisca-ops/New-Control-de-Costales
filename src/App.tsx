import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { User, Role, Costal, Apertura, CostalStatus, OfflineAction, Store } from './types';
import { CATEGORIES, PIECES_MAP, INITIAL_STORES } from './constants';
import { gasService } from './services/gasService';
import Scanner from './components/Scanner';
import * as XLSX from 'xlsx';

type Screen =
  | 'LOGIN'
  | 'FORGOT_PASSWORD'
  | 'CHANGE_PASSWORD'
  | 'RECEPCION'
  | 'EXISTENCIAS'
  | 'APERTURA'
  | 'METRICAS'
  | 'INVENTARIO'
  | 'REPORTES';

interface ReportData {
  shopStats: { id: string; nombre: string; received: number; opened: number; pending: number }[];
  userStats: { email: string; count: number; avgDiff: number }[];
  avgGlobalDiff: number;
}

const ROOT_ADMIN_EMAIL = 'curiosidades2526@gmail.com';

const generateUUID = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const canAccessAdmin = (user: User | null) => user?.rol === Role.ADMIN || user?.rol === Role.ADMIN_2;
const canAccessReports = (user: User | null) => user?.rol === Role.ADMIN || user?.rol === Role.ADMIN_2;
const isRootAdmin = (user: User | null) => (user?.email || '').toLowerCase() === ROOT_ADMIN_EMAIL;

const normalizeCategory = (value: string) => String(value || '').trim().toUpperCase();

const groupRowsByCategory = (rows: any[]) => {
  const grouped = rows.reduce((acc, row) => {
    const category = normalizeCategory(row.categoria) || 'SIN CATEGORÍA';
    if (!acc[category]) acc[category] = [];
    acc[category].push(row);
    return acc;
  }, {} as Record<string, any[]>);

  return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0], 'es'));
};

const canManageUser = (currentUser: User | null, target: User) => {
  if (!currentUser) return false;
  if (isRootAdmin(currentUser)) return true;
  if (currentUser.rol === Role.ADMIN_2) {
    return target.email.toLowerCase() !== ROOT_ADMIN_EMAIL && target.rol !== Role.ADMIN && target.rol !== Role.ADMIN_2;
  }
  return false;
};

const getAssignableRoles = (currentUser: User | null, editingUser: User | null = null) => {
  if (!currentUser) return [Role.OPERADOR];
  if (isRootAdmin(currentUser)) {
    if (editingUser?.email.toLowerCase() === ROOT_ADMIN_EMAIL) return [Role.ADMIN];
    return [Role.OPERADOR, Role.SUPERVISOR, Role.ADMIN_2];
  }
  if (currentUser.rol === Role.ADMIN_2) {
    return [Role.OPERADOR, Role.SUPERVISOR];
  }
  return [Role.OPERADOR];
};

const LoginScreen = ({ loading, onLogin, onForgotPassword }: any) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white p-10 rounded-[40px] shadow-2xl space-y-8 border border-gray-100"
      >
        <div className="text-center">
          <div className="bg-indigo-600 w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-lg shadow-indigo-200 mb-6">📦</div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight text-center">Control de Costales</h1>
          <p className="text-gray-400 mt-2 font-medium">Gestión Profesional de Inventario</p>
        </div>

        <div className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@empresa.com"
            className="w-full p-5 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none transition-all font-semibold"
            autoComplete="email"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            className="w-full p-5 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none transition-all font-semibold"
            autoComplete="current-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white font-black py-5 rounded-3xl shadow-xl shadow-indigo-100 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? 'CARGANDO...' : 'INICIAR SESIÓN'}
          </button>

          <button
            type="button"
            onClick={onForgotPassword}
            className="w-full text-indigo-600 font-bold text-sm"
          >
            Olvidé mi contraseña
          </button>

          <p className="text-center text-[11px] text-gray-400 font-medium">
            Los usuarios son creados únicamente por el administrador.
          </p>
        </div>
      </form>
    </div>
  );
};

const ForgotPasswordScreen = ({ loading, onSend, onBack }: any) => {
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSend(email);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white p-10 rounded-[40px] shadow-2xl space-y-8 border border-gray-100"
      >
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-black tracking-tight">Recuperar contraseña</h2>
          <p className="text-gray-400 font-medium">Te enviaremos una contraseña temporal a tu correo.</p>
        </div>

        <div className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@empresa.com"
            className="w-full p-5 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none transition-all font-semibold"
            autoComplete="email"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white font-black py-5 rounded-3xl shadow-xl shadow-indigo-100 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? 'ENVIANDO...' : 'ENVIAR CONTRASEÑA TEMPORAL'}
          </button>

          <button type="button" onClick={onBack} className="w-full text-gray-500 font-bold text-sm">Volver</button>
        </div>
      </form>
    </div>
  );
};

const ChangePasswordScreen = ({ loading, onSave, onLogout }: any) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSave(password, confirmPassword);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white p-10 rounded-[40px] shadow-2xl space-y-8 border border-gray-100"
      >
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-black tracking-tight">Cambiar contraseña</h2>
          <p className="text-gray-400 font-medium">Debes crear tu contraseña personal para continuar.</p>
        </div>

        <div className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nueva contraseña"
            className="w-full p-5 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none transition-all font-semibold"
            autoComplete="new-password"
          />

          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirmar nueva contraseña"
            className="w-full p-5 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none transition-all font-semibold"
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white font-black py-5 rounded-3xl shadow-xl shadow-indigo-100 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? 'GUARDANDO...' : 'GUARDAR CONTRASEÑA'}
          </button>

          <button type="button" onClick={onLogout} className="w-full text-gray-500 font-bold text-sm">Salir</button>
        </div>
      </form>
    </div>
  );
};

const AperturaScreen = ({ user, isOnline, showNotify, enqueueAction, loadMetrics, onDataChanged }: any) => {
  const [code, setCode] = useState(localStorage.getItem('pending_apertura_code') || '');
  const [count, setCount] = useState('');
  const [selectedAperturaCategory, setSelectedAperturaCategory] = useState('');
  const [costalInfo, setCostalInfo] = useState<Costal | null>(null);
  const [isOpening, setIsOpening] = useState(false);

  useEffect(() => {
    if (code) checkCode(code);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkCode = async (c: string) => {
    const codeClean = c.trim();
    if (!codeClean) return;
    setCode(codeClean);
    localStorage.removeItem('pending_apertura_code');
    const res: any = await gasService.getInventory(user?.tienda || '');
    const item = res.data?.find((i: Costal) => i.codigo_barras === codeClean);
    if (item) {
      setCostalInfo(item);
      setSelectedAperturaCategory(item.categoria);
    } else {
      showNotify('error', 'El costal NO está en stock.');
      setCostalInfo(null);
    }
  };

  const resetOpenForm = () => {
    setCode('');
    setCount('');
    setSelectedAperturaCategory('');
    setCostalInfo(null);
  };

  const handleOpen = async () => {
    if (!costalInfo) return showNotify('error', 'Escanea un costal válido.');
    if (count === '') return showNotify('warning', 'Ingresa la cantidad contada.');

    setIsOpening(true);
    try {
      const expectedPieces = PIECES_MAP[selectedAperturaCategory] || costalInfo.piezas_asignadas;
      const countNum = parseInt(count, 10);
      const diff = countNum - expectedPieces;
      const apertura: Apertura = {
        id_apertura: generateUUID(),
        codigo_barras: costalInfo.codigo_barras,
        categoria: selectedAperturaCategory,
        tienda: user?.tienda || '',
        usuario_apertura: user?.email || '',
        fecha_apertura: new Date().toISOString(),
        piezas_asignadas: expectedPieces,
        piezas_contadas: countNum,
        diferencia: diff,
      };

      if (Math.abs(diff) > 20 && !confirm(`Diferencia de ${diff} piezas detectada. ¿Confirmas el conteo real de ${countNum}?`)) {
        setIsOpening(false);
        return;
      }

      if (isOnline) {
        const res: any = await gasService.openCostal(apertura);
        if (res.ok) {
          showNotify('success', `Costal ${costalInfo.codigo_barras} abierto.`);
          await loadMetrics();
          await onDataChanged?.();
          resetOpenForm();
        } else {
          showNotify('error', res.error || 'Error al procesar.');
        }
      } else {
        enqueueAction({ type: 'OPEN_COSTAL', payload: apertura });
        showNotify('success', 'Guardado localmente (Offline).');
        resetOpenForm();
      }
    } catch (err) {
      console.error(err);
      showNotify('error', 'Error inesperado.');
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-[32px] shadow-sm">
        <h2 className="text-xl font-black mb-4 tracking-tighter">Apertura y Conteo</h2>
        <Scanner onScan={checkCode} placeholder="Escanea código para validar stock..." allowManualEntry={false} />
      </div>

      {costalInfo && (
        <div className="bg-white p-8 rounded-[32px] shadow-sm space-y-6 animate-in zoom-in-95">
          <div className="border-b pb-4">
            <h3 className="text-3xl font-black text-gray-900 tracking-tighter">{costalInfo.codigo_barras}</h3>
            <p className="text-indigo-600 font-bold uppercase text-[10px] tracking-[0.2em] mt-1">Costal en Stock</p>
          </div>

          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Confirmar Categoría</span>
              <select value={selectedAperturaCategory} onChange={(e) => setSelectedAperturaCategory(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl outline-none font-black text-gray-700">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <p className="text-[9px] font-bold text-indigo-400">Pzs Esperadas: {PIECES_MAP[selectedAperturaCategory] || costalInfo.piezas_asignadas}</p>
            </label>

            <label className="block space-y-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Conteo Real (Piezas Contadas)</span>
              <input type="number" value={count} onChange={(e) => setCount(e.target.value)} placeholder="000" className="w-full p-6 bg-orange-50 rounded-3xl outline-none text-center text-5xl font-black text-orange-600 focus:ring-4 focus:ring-orange-100 transition-all" />
            </label>
          </div>

          <button onClick={handleOpen} disabled={isOpening} className="w-full bg-indigo-600 text-white font-black py-6 rounded-[32px] shadow-xl shadow-indigo-100 uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all text-sm disabled:opacity-50">
            {isOpening ? 'PROCESANDO...' : 'FINALIZAR Y DESCONTAR'}
          </button>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentScreen, setCurrentScreen] = useState<Screen>('LOGIN');
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState<OfflineAction[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'warning'; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [stores, setStores] = useState<Store[]>(INITIAL_STORES);
  const [metrics, setMetrics] = useState<ReportData | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>(() => localStorage.getItem('cc_last_category') || CATEGORIES[0]);
  const [sessionScannedCodes, setSessionScannedCodes] = useState<Set<string>>(new Set());

  const USER_STORAGE_KEY = 'cc_user_session';
  const QUEUE_STORAGE_KEY = 'cc_offline_queue';
  const STORES_CACHE_KEY = 'cc_stores_cache';

  useEffect(() => {
    const savedUser = localStorage.getItem(USER_STORAGE_KEY);
    if (savedUser) {
      setUser(JSON.parse(savedUser));
      setCurrentScreen('RECEPCION');
    }

    const savedQueue = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (savedQueue) {
      const parsed = JSON.parse(savedQueue);
      setOfflineQueue(parsed);
      const codes = parsed.map((a: OfflineAction) => a.payload.codigo_barras).filter(Boolean);
      setSessionScannedCodes(prev => new Set([...prev, ...codes]));
    }

    const savedStores = localStorage.getItem(STORES_CACHE_KEY);
    if (savedStores) setStores(JSON.parse(savedStores));

    const handleStatusChange = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);
    return () => {
      window.removeEventListener('online', handleStatusChange);
      window.removeEventListener('offline', handleStatusChange);
    };
  }, []);

  const loadMetrics = useCallback(async () => {
    if (!navigator.onLine) return;
    const res: any = await gasService.getReports();
    if (res.ok) setMetrics(res.data);
  }, []);

  const loadStores = useCallback(async () => {
    const res: any = await gasService.getStores();
    if (res.ok && res.data?.length > 0) {
      const unique = (res.data as Store[]).filter((v, i, a) => a.findIndex(t => t.nombre.toLowerCase() === v.nombre.toLowerCase()) === i);
      setStores(unique);
      localStorage.setItem(STORES_CACHE_KEY, JSON.stringify(unique));
    }
  }, []);

  const refreshAdminData = useCallback(async () => {
    await Promise.all([loadStores(), loadMetrics()]);
  }, [loadStores, loadMetrics]);

  useEffect(() => {
    if (isOnline) {
      refreshAdminData();
    }
  }, [isOnline, refreshAdminData]);

  const showNotify = (type: 'success' | 'error' | 'warning', msg: string) => {
    setNotification({ type, msg });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleLogin = async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) return showNotify('error', 'Ingresa correo y contraseña');

    setLoading(true);
    try {
      const res: any = await gasService.auth(cleanEmail, password);
      if (res.ok && res.data) {
        setUser(res.data.user || res.data);
        setMustChangePassword(!!res.data.mustChangePassword);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.data.user || res.data));

        if (res.data.mustChangePassword) {
          setCurrentScreen('CHANGE_PASSWORD');
          showNotify('warning', 'Debes cambiar tu contraseña temporal.');
        } else {
          setCurrentScreen('RECEPCION');
          showNotify('success', `Bienvenido ${(res.data.user || res.data).nombre}`);
        }
      } else {
        showNotify('error', res.error || 'Credenciales inválidas.');
      }
    } catch {
      showNotify('error', 'Error al autenticar.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return showNotify('error', 'Ingresa un correo');

    setLoading(true);
    try {
      const res: any = await gasService.forgotPassword(cleanEmail);
      if (res.ok) {
        showNotify('success', 'Se envió una contraseña temporal a tu correo.');
        setCurrentScreen('LOGIN');
      } else {
        showNotify('error', res.error || 'No se pudo procesar la recuperación.');
      }
    } catch {
      showNotify('error', 'Error al recuperar contraseña.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (password: string, confirmPassword: string) => {
    if (!user) return;
    if (!password || password.length < 4) return showNotify('error', 'La contraseña debe tener al menos 4 caracteres.');
    if (password !== confirmPassword) return showNotify('error', 'Las contraseñas no coinciden.');

    setLoading(true);
    try {
      const res: any = await gasService.changePassword(user.email, password);
      if (res.ok) {
        setMustChangePassword(false);
        setCurrentScreen('RECEPCION');
        showNotify('success', 'Contraseña actualizada.');
      } else {
        showNotify('error', res.error || 'No se pudo cambiar la contraseña.');
      }
    } catch {
      showNotify('error', 'Error al cambiar contraseña.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateManagedUser = async ({ nombre, email, tienda, rol }: { nombre: string; email: string; tienda: string; rol: Role }) => {
    const cleanEmail = email.trim().toLowerCase();

    if (!user) return { ok: false, error: 'No autorizado.' };
    if (!nombre.trim() || !cleanEmail || !tienda) return { ok: false, error: 'Completa todos los campos.' };
    if (cleanEmail === ROOT_ADMIN_EMAIL && !isRootAdmin(user)) return { ok: false, error: 'Ese correo está reservado para el administrador principal.' };

    const allowedRoles = getAssignableRoles(user);
    if (!allowedRoles.includes(rol)) return { ok: false, error: 'No puedes crear ese rol.' };

    setLoading(true);
    try {
      const newUser: User = {
        nombre: nombre.trim(),
        email: cleanEmail,
        tienda,
        rol,
      };

      const res: any = await gasService.createManagedUser({
        actorEmail: user.email,
        user: newUser,
      });

      if (res.ok) {
        await refreshAdminData();
        return { ok: true };
      }

      return { ok: false, error: res.error || 'No se pudo registrar.' };
    } catch {
      return { ok: false, error: 'Error al registrar.' };
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (target: User) => {
    if (!user) return;
    if (!confirm(`¿Eliminar al usuario ${target.nombre}?`)) return;

    setLoading(true);
    try {
      const res: any = await gasService.deleteUsuario(target.email, user.email);
      if (res.ok) {
        showNotify('success', 'Usuario eliminado.');
        await refreshAdminData();
      } else {
        showNotify('error', res.error || 'No se pudo eliminar el usuario.');
      }
    } catch {
      showNotify('error', 'Error al eliminar usuario.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStore = async (name: string, address: string) => {
    const cleanName = name.trim();
    if (!cleanName) return;
    if (!canAccessAdmin(user)) return showNotify('error', 'Sin permiso.');
    if (stores.some(s => s.nombre.toLowerCase() === cleanName.toLowerCase())) return showNotify('error', 'La tienda ya existe.');

    setLoading(true);
    const newId = 'T' + (stores.length + 1).toString().padStart(2, '0');
    const newStore = { id_tienda: newId, nombre: cleanName, direccion: address };

    try {
      const res: any = await gasService.addStore(newStore);
      if (res.ok) {
        await refreshAdminData();
        showNotify('success', 'Tienda creada.');
      } else {
        showNotify('error', res.error || 'Error al crear.');
      }
    } catch {
      showNotify('error', 'Error de red.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStore = async (store: Store) => {
    if (!canAccessAdmin(user)) return showNotify('error', 'Sin permiso.');
    setLoading(true);
    try {
      const res: any = await gasService.updateTienda(store);
      if (res.ok) {
        await refreshAdminData();
        showNotify('success', 'Tienda actualizada.');
      } else {
        showNotify('error', res.error || 'No se pudo actualizar la tienda.');
      }
    } catch {
      showNotify('error', 'Error al actualizar.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStore = async (store: Store) => {
    if (!user || !isRootAdmin(user)) return showNotify('error', 'Sin permiso.');
    if (!confirm(`¿Eliminar la tienda ${store.nombre}?`)) return;

    setLoading(true);
    try {
      const res: any = await gasService.deleteTienda(store.id_tienda);
      if (res.ok) {
        showNotify('success', 'Tienda eliminada.');
        await refreshAdminData();
      } else {
        showNotify('error', res.error || 'No se pudo eliminar la tienda.');
      }
    } catch {
      showNotify('error', 'Error al eliminar tienda.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetStoreData = async (tienda: string) => {
    if (!user || !isRootAdmin(user)) return showNotify('error', 'Sin permiso.');
    if (!tienda) return showNotify('error', 'Debes seleccionar una tienda.');
    if (!confirm(`Esto dejará en cero stock, recibidos y aperturas de la tienda ${tienda}. ¿Continuar?`)) return;

    setLoading(true);
    try {
      const res: any = await gasService.resetStoreData(tienda);
      if (res.ok) {
        showNotify('success', `Tienda ${tienda} reiniciada.`);
        await refreshAdminData();
      } else {
        showNotify('error', res.error || 'No se pudo resetear la tienda.');
      }
    } catch {
      showNotify('error', 'Error al resetear la tienda.');
    } finally {
      setLoading(false);
    }
  };

  const enqueueAction = (action: Omit<OfflineAction, 'id' | 'timestamp' | 'status'>) => {
    const newAction: OfflineAction = { ...action, id: generateUUID(), timestamp: Date.now(), status: 'pending' };
    const updatedQueue = [...offlineQueue, newAction];
    setOfflineQueue(updatedQueue);
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updatedQueue));
    showNotify('warning', 'Sin conexión: Acción en cola.');
  };

  const handleLogout = () => {
    localStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
    setMustChangePassword(false);
    setCurrentScreen('LOGIN');
  };

  const navItems = [
    { id: 'RECEPCION', label: 'Recibir', icon: '📥', show: true },
    { id: 'EXISTENCIAS', label: 'Stock', icon: '📦', show: true },
    { id: 'APERTURA', label: 'Abrir', icon: '✂️', show: true },
    { id: 'INVENTARIO', label: 'Inventario', icon: '🧾', show: true },
    { id: 'METRICAS', label: 'Admin', icon: '⚙️', show: canAccessAdmin(user) },
    { id: 'REPORTES', label: 'Reportes', icon: '📋', show: canAccessReports(user) },
  ];

  return (
    <div className="min-h-screen pb-24 max-w-lg mx-auto bg-gray-50/50 font-sans">
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-2xl px-8 py-6 flex justify-between items-center border-b border-gray-100">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tighter">Control de <span className="text-indigo-600">Costales</span></h1>
          <div className="flex items-center gap-2 mt-0.5">
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{isOnline ? 'En Línea' : 'Offline'}</span>
          </div>
        </div>
        {user && (
          <div className="flex flex-col items-end">
            <div className="bg-indigo-50 text-indigo-600 text-[10px] font-black px-3 py-1 rounded-full uppercase mb-1">{user.rol}</div>
            <button onClick={handleLogout} className="text-[10px] font-black text-gray-300 hover:text-red-500 uppercase">Salir</button>
          </div>
        )}
      </header>

      <main className="p-8">
        {notification && (
          <div className={`fixed top-20 left-8 right-8 z-[60] p-5 rounded-[24px] shadow-2xl border-2 animate-in slide-in-from-top-12 duration-500 ${notification.type === 'success' ? 'bg-green-50 border-green-200 text-green-900' : notification.type === 'error' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-orange-50 border-orange-200 text-orange-900'}`}>
            <p className="font-black text-xs text-center uppercase tracking-widest">{notification.msg}</p>
          </div>
        )}

        {currentScreen === 'LOGIN' && (
          <LoginScreen
            loading={loading}
            onLogin={handleLogin}
            onForgotPassword={() => setCurrentScreen('FORGOT_PASSWORD')}
          />
        )}

        {currentScreen === 'FORGOT_PASSWORD' && (
          <ForgotPasswordScreen
            loading={loading}
            onSend={handleForgotPassword}
            onBack={() => setCurrentScreen('LOGIN')}
          />
        )}

        {currentScreen === 'CHANGE_PASSWORD' && (
          <ChangePasswordScreen
            loading={loading}
            onSave={handleChangePassword}
            onLogout={handleLogout}
          />
        )}

        {currentScreen === 'APERTURA' && (
          <AperturaScreen
            user={user}
            isOnline={isOnline}
            showNotify={showNotify}
            enqueueAction={enqueueAction}
            loadMetrics={loadMetrics}
            onDataChanged={refreshAdminData}
          />
        )}
        {currentScreen === 'EXISTENCIAS' && <ExistenciasView user={user} />}
        {currentScreen === 'RECEPCION' && (
          <RecepcionView
            user={user}
            isOnline={isOnline}
            showNotify={showNotify}
            enqueueAction={enqueueAction}
            loadMetrics={loadMetrics}
            onDataChanged={refreshAdminData}
            selectedCategory={selectedCategory}
            setSelectedCategory={(cat: string) => { setSelectedCategory(cat); localStorage.setItem('cc_last_category', cat); }}
            sessionScannedCodes={sessionScannedCodes}
            setSessionScannedCodes={setSessionScannedCodes}
          />
        )}
        {currentScreen === 'INVENTARIO' && (
          <InventarioView
            user={user}
            showNotify={showNotify}
          />
        )}
        {currentScreen === 'METRICAS' && canAccessAdmin(user) && (
          <MetricasView
            metrics={metrics}
            user={user}
            stores={stores}
            showNotify={showNotify}
            onAddStore={handleAddStore}
            onUpdateStore={handleUpdateStore}
            onDeleteStore={handleDeleteStore}
            onCreateManagedUser={handleCreateManagedUser}
            onDeleteUser={handleDeleteUser}
            onResetStoreData={handleResetStoreData}
            loading={loading}
          />
        )}
        {currentScreen === 'REPORTES' && canAccessReports(user) && <ReportesView user={user} />}
      </main>

      {user && currentScreen !== 'CHANGE_PASSWORD' && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-gray-100 flex justify-around p-4 pb-6 z-50 max-w-lg mx-auto shadow-[0_-20px_50px_rgba(0,0,0,0.04)] rounded-t-[48px]">
          {navItems.filter(item => item.show).map(tab => (
            <button key={tab.id} onClick={() => setCurrentScreen(tab.id as Screen)} className={`flex flex-col items-center p-2 rounded-2xl transition-all duration-500 ${currentScreen === tab.id ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 -translate-y-2' : 'opacity-30'}`}>
              <span className="text-xl mb-1">{tab.icon}</span>
              <span className={`text-[8px] font-black uppercase tracking-widest ${currentScreen === tab.id ? 'text-white' : 'text-gray-900'}`}>{tab.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
};

const ExistenciasView = ({ user }: any) => {
  const [items, setItems] = useState<Costal[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadData = useCallback(async () => {
    const res: any = await gasService.getInventory(user?.tienda || '');
    if (res.ok) setItems(res.data);
  }, [user?.tienda]);

  useEffect(() => { loadData(); }, [loadData]);

  const normalizeHeader = (value: any) => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const normalizeCategory = (value: any) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const found = CATEGORIES.find((c) => c.toLowerCase() === raw.toLowerCase());
    return found || raw.toUpperCase();
  };

  const processImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportSummary('');

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      if (!rows.length) {
        setImportSummary('Archivo vacío.');
        return;
      }

      const headerRow = rows[0].map(normalizeHeader);
      const findIndex = (...keys: string[]) => headerRow.findIndex((h: string) => keys.includes(h));

      const codigoIndex = findIndex('codigobarras', 'codigo', 'barcode', 'costal', 'numerocostal');
      const categoriaIndex = findIndex('categoria', 'category', 'tipo');
      const piezasIndex = findIndex('piezasasignadas', 'piezas', 'cantidadpiezas', 'qty', 'cantidad');
      const tiendaIndex = findIndex('tienda', 'sucursal', 'store');
      const notasIndex = findIndex('notas', 'nota', 'observaciones', 'comentarios');

      if (codigoIndex === -1 || categoriaIndex === -1) {
        setImportSummary('El Excel debe traer al menos las columnas: codigo_barras y categoria.');
        return;
      }

      let imported = 0;
      let duplicates = 0;
      let invalid = 0;
      let failed = 0;

      for (let i = 1; i < rows.length; i += 1) {
        const row = rows[i];
        const codigo = String(row[codigoIndex] || '').trim();
        const categoria = normalizeCategory(row[categoriaIndex]);
        if (!codigo || !categoria) {
          invalid += 1;
          continue;
        }

        const piezasBase = piezasIndex >= 0 ? Number(row[piezasIndex] || 0) : (PIECES_MAP[categoria] || 0);
        const piezas = Number.isFinite(piezasBase) ? piezasBase : (PIECES_MAP[categoria] || 0);
        const tienda = tiendaIndex >= 0 && String(row[tiendaIndex] || '').trim() ? String(row[tiendaIndex]).trim() : (user?.tienda || '');
        const notas = notasIndex >= 0 ? String(row[notasIndex] || '').trim() : 'Carga masiva desde Excel';

        const duplicateCheck: any = await gasService.checkDuplicate(codigo);
        if (duplicateCheck.exists) {
          duplicates += 1;
          continue;
        }

        const costal: Costal = {
          codigo_barras: codigo,
          categoria,
          tienda,
          fecha_recepcion: new Date().toISOString(),
          usuario_recibe: user?.email || '',
          piezas_asignadas: piezas,
          estado: CostalStatus.RECIBIDO,
          notas,
        };

        const res: any = await gasService.addCostal(costal);
        if (res.ok) imported += 1;
        else failed += 1;
      }

      await loadData();
      setImportSummary(`Importados: ${imported} • Duplicados: ${duplicates} • Inválidos: ${invalid} • Fallidos: ${failed}`);
    } catch (error) {
      console.error(error);
      setImportSummary('No se pudo procesar el archivo.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-black tracking-tighter">Stock en Tienda <span className="text-indigo-600">({items.length})</span></h2>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={processImportFile}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="bg-emerald-600 text-white px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-50"
          >
            {isImporting ? 'Cargando...' : 'Cargar Excel'}
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-3xl shadow-sm border border-emerald-100 text-xs text-gray-500">
        <p className="font-black text-emerald-700 uppercase tracking-widest mb-1">Carga desde bodega</p>
        <p>Columnas sugeridas: <span className="font-bold">codigo_barras</span>, <span className="font-bold">categoria</span>, <span className="font-bold">piezas_asignadas</span>, <span className="font-bold">tienda</span>, <span className="font-bold">notas</span>.</p>
        {importSummary && <p className="mt-2 font-black text-indigo-600">{importSummary}</p>}
      </div>

      {items.length === 0 ? <div className="text-center p-20 text-gray-300 font-black border border-dashed rounded-[40px]">Inventario Vacío</div> : (
        <div className="space-y-4">
          {items.map(item => (
            <div key={item.codigo_barras} className="bg-white p-6 rounded-3xl shadow-sm border-l-8 border-indigo-500 flex justify-between items-center">
              <div>
                <p className="font-black text-gray-900">{item.codigo_barras}</p>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">{item.categoria} • ESP: {item.piezas_asignadas}</p>
              </div>
              <div className="bg-indigo-50 text-indigo-700 px-4 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest text-center">Apertura solo por escáner</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const RecepcionView = ({ user, isOnline, showNotify, enqueueAction, loadMetrics, onDataChanged, selectedCategory, setSelectedCategory, sessionScannedCodes, setSessionScannedCodes }: any) => {
  const onScanCode = async (code: string) => {
    const codeClean = code.trim();
    if (!codeClean) return;
    if (sessionScannedCodes.has(codeClean)) return showNotify('error', `Ya escaneado: ${codeClean}`);
    if (isOnline) {
      const check: any = await gasService.checkDuplicate(codeClean);
      if (check.exists) {
        setSessionScannedCodes((prev: Set<string>) => new Set(prev).add(codeClean));
        return showNotify('error', 'Ya registrado en el sistema.');
      }
    }
    const pieces = selectedCategory === 'SALDO' ? 0 : PIECES_MAP[selectedCategory];
    const newCostal: Costal = {
      codigo_barras: codeClean,
      categoria: selectedCategory,
      tienda: user?.tienda || '',
      fecha_recepcion: new Date().toISOString(),
      usuario_recibe: user?.email || '',
      piezas_asignadas: pieces,
      estado: CostalStatus.RECIBIDO,
      notas: '',
    };
    setSessionScannedCodes((prev: Set<string>) => new Set(prev).add(codeClean));
    if (isOnline) {
      const res: any = await gasService.addCostal(newCostal);
      if (res.ok) {
        showNotify('success', `RECIBIDO: ${codeClean}`);
        await loadMetrics();
        await onDataChanged?.();
      }
    } else {
      enqueueAction({ type: 'ADD_COSTAL', payload: newCostal });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-[32px] shadow-sm space-y-4">
        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Categoría de Recepción</label>
        <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl outline-none font-bold text-gray-700">
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="bg-white p-8 rounded-[32px] shadow-sm">
        <h2 className="text-xl font-black mb-4">Scanner Recepción</h2>
        <Scanner onScan={onScanCode} allowManualEntry={false} />
      </div>
    </div>
  );
};

const MetricasView = ({ metrics, user, stores, showNotify, onAddStore, onUpdateStore, onDeleteStore, onCreateManagedUser, onDeleteUser, onResetStoreData, loading }: any) => {
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [showStores, setShowStores] = useState(false);
  const [showNewStoreModal, setShowNewStoreModal] = useState(false);
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreAddr, setNewStoreAddr] = useState('');

  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserStore, setNewUserStore] = useState(stores[0]?.id_tienda || '');
  const [newUserRole, setNewUserRole] = useState<Role>(getAssignableRoles(user)[0] as Role);

  const [resetStoreId, setResetStoreId] = useState(stores[0]?.id_tienda || '');
  const [selectedShopId, setSelectedShopId] = useState<'ALL' | string>('ALL');

  const limitedAdmin = user?.rol === Role.ADMIN_2;
  const shopStats = metrics?.shopStats || [];
  const totalReceived = shopStats.reduce((acc, s) => acc + (s.received || 0), 0);
  const totalOpened = shopStats.reduce((acc, s) => acc + (s.opened || 0), 0);
  const totalPending = shopStats.reduce((acc, s) => acc + (s.pending || 0), 0);
  const selectedShop =
    selectedShopId === 'ALL'
      ? null
      : shopStats.find((s) => s.id === selectedShopId) || null;

  const loadUsers = useCallback(() => {
    gasService.listUsuarios().then((res: any) => {
      if (res.ok) setUsers(res.data || []);
      else setUsers([]);
    }).catch(() => {
      setUsers([]);
    });
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!newUserStore && stores[0]?.id_tienda) setNewUserStore(stores[0].id_tienda);
    if (!resetStoreId && stores[0]?.id_tienda) setResetStoreId(stores[0].id_tienda);
  }, [stores, newUserStore, resetStoreId]);

  useEffect(() => {
    const roles = getAssignableRoles(user);
    if (!roles.includes(newUserRole)) setNewUserRole(roles[0] as Role);
  }, [user, newUserRole]);

  useEffect(() => {
    if (selectedShopId !== 'ALL' && !shopStats.some((s) => s.id === selectedShopId)) {
      setSelectedShopId('ALL');
    }
  }, [selectedShopId, shopStats]);

  const visibleUsers = useMemo(() => {
    if (!limitedAdmin) return users;
    return users.filter((u) => u.email.toLowerCase() !== ROOT_ADMIN_EMAIL && u.rol !== Role.ADMIN && u.rol !== Role.ADMIN_2);
  }, [users, limitedAdmin]);

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !canManageUser(user, editingUser)) return showNotify('error', 'No puedes modificar ese usuario.');

    const allowedRoles = getAssignableRoles(user, editingUser);
    if (!allowedRoles.includes(editingUser.rol)) return showNotify('error', 'No puedes asignar ese rol.');

    const res: any = await gasService.updateUsuario({ ...editingUser, actorEmail: user?.email || '' });
    if (res.ok) {
      showNotify('success', 'Usuario actualizado');
      setUsers(prev => prev.map(u => u.email === editingUser.email ? editingUser : u));
      setEditingUser(null);
      loadUsers();
    } else {
      showNotify('error', res.error || 'No se pudo actualizar.');
    }
  };

  const handleCreateUserSubmit = async () => {
    const res = await onCreateManagedUser({
      nombre: newUserName,
      email: newUserEmail,
      tienda: newUserStore,
      rol: newUserRole,
    });

    if (res.ok) {
      showNotify('success', 'Usuario creado. Se envió contraseña temporal por correo.');
      setNewUserName('');
      setNewUserEmail('');
      setNewUserStore(stores[0]?.id_tienda || '');
      setNewUserRole(getAssignableRoles(user)[0] as Role);
      setShowNewUserModal(false);
      loadUsers();
    } else {
      showNotify('error', res.error || 'No se pudo crear el usuario.');
    }
  };

  const handleCreateStoreSubmit = async () => {
    await onAddStore(newStoreName, newStoreAddr);
    setNewStoreName('');
    setNewStoreAddr('');
    setShowNewStoreModal(false);
  };

  const handleResetSubmit = async () => {
    if (!resetStoreId) return showNotify('error', 'Selecciona una tienda.');
    await onResetStoreData(resetStoreId);
    setShowResetModal(false);
  };

  const userPerf = metrics?.userStats?.find((u: any) => u.email === user?.email);

  return (
    <div className="space-y-8 pb-12">
      <div className="bg-indigo-600 p-8 rounded-[40px] text-white shadow-2xl">
        <h2 className="text-[10px] font-black opacity-60 uppercase tracking-widest mb-1">Tu Rendimiento</h2>
        <p className="text-4xl font-black">{userPerf?.avgDiff?.toFixed(1) || '0.0'}</p>
        <p className="text-[10px] font-bold opacity-80 uppercase mt-1">DIFERENCIA PROMEDIO (Pzs)</p>
      </div>

      <div className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-gray-900">Resumen General</h3>
          <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Todas las tiendas</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-50 rounded-3xl p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">Recibidos</p>
            <p className="text-3xl font-black text-blue-700 mt-2">{totalReceived}</p>
          </div>
          <div className="bg-orange-50 rounded-3xl p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">Abiertos</p>
            <p className="text-3xl font-black text-orange-700 mt-2">{totalOpened}</p>
          </div>
          <div className="bg-emerald-50 rounded-3xl p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Stock</p>
            <p className="text-3xl font-black text-emerald-700 mt-2">{totalPending}</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-gray-900">Resumen por Tienda</h3>
          <select
            value={selectedShopId}
            onChange={(e) => setSelectedShopId(e.target.value)}
            className="bg-gray-50 rounded-2xl px-4 py-3 font-bold text-sm outline-none"
          >
            <option value="ALL">General</option>
            {shopStats.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.nombre}
              </option>
            ))}
          </select>
        </div>

        {selectedShopId === 'ALL' ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-blue-50 rounded-3xl p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">Recibidos</p>
              <p className="text-3xl font-black text-blue-700 mt-2">{totalReceived}</p>
            </div>
            <div className="bg-orange-50 rounded-3xl p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">Abiertos</p>
              <p className="text-3xl font-black text-orange-700 mt-2">{totalOpened}</p>
            </div>
            <div className="bg-emerald-50 rounded-3xl p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Stock</p>
              <p className="text-3xl font-black text-emerald-700 mt-2">{totalPending}</p>
            </div>
          </div>
        ) : selectedShop ? (
          <div className="space-y-3">
            <div className="bg-gray-50 rounded-[28px] p-5 border border-gray-100">
              <div className="mb-4">
                <p className="text-sm font-black text-gray-900 uppercase">{selectedShop.nombre}</p>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{selectedShop.id}</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-100 rounded-2xl p-3 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-blue-600">Recibidos</p>
                  <p className="text-2xl font-black text-blue-800 mt-1">{selectedShop.received}</p>
                </div>
                <div className="bg-orange-100 rounded-2xl p-3 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-orange-600">Abiertos</p>
                  <p className="text-2xl font-black text-orange-800 mt-1">{selectedShop.opened}</p>
                </div>
                <div className="bg-emerald-100 rounded-2xl p-3 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Stock</p>
                  <p className="text-2xl font-black text-emerald-800 mt-1">{selectedShop.pending}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center p-10 text-gray-300 font-black border border-dashed rounded-[32px]">
            Sin datos todavía
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3">
        <button
          onClick={() => setShowNewUserModal(true)}
          className="w-full bg-indigo-600 text-white font-black py-4 rounded-[28px] text-xs uppercase tracking-widest shadow-xl"
        >
          Crear Usuario
        </button>

        <button
          onClick={() => setShowNewStoreModal(true)}
          className="w-full bg-gray-900 text-white font-black py-4 rounded-[28px] text-xs uppercase tracking-widest shadow-xl"
        >
          Nueva Sede
        </button>

        {isRootAdmin(user) && (
          <button
            onClick={() => setShowResetModal(true)}
            className="w-full bg-red-600 text-white font-black py-4 rounded-[28px] text-xs uppercase tracking-widest shadow-xl"
          >
            Resetear Tienda
          </button>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-black text-gray-900 px-2 flex justify-between items-center">
          Gestión de Usuarios
          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">{visibleUsers.length} Registrados</span>
        </h3>
        <div className="space-y-3">
          {visibleUsers.map(u => (
            <div key={u.email} className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-50 flex justify-between items-center group">
              <div>
                <p className="font-black text-gray-900 text-sm">{u.nombre}</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{u.email}</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <span className="bg-indigo-50 text-indigo-600 text-[8px] px-2 py-0.5 rounded-full font-black uppercase">{u.rol}</span>
                  <span className="bg-gray-50 text-gray-500 text-[8px] px-2 py-0.5 rounded-full font-black uppercase">{stores.find((s: Store) => s.id_tienda === u.tienda)?.nombre || u.tienda}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {canManageUser(user, u) && (
                  <>
                    <button onClick={() => setEditingUser({ ...u })} className="bg-gray-100 p-3 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all text-gray-400 group-hover:scale-105 active:scale-95">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    {!isRootAdmin(u) && (
                      <button
                        onClick={() => onDeleteUser(u)}
                        className="bg-red-50 text-red-600 p-3 rounded-2xl hover:bg-red-600 hover:text-white transition-all"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-7 0h8" /></svg>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-lg font-black text-gray-900">Gestión de Tiendas</h3>
          <button onClick={() => setShowStores(!showStores)} className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest">
            {showStores ? 'Ocultar' : 'Más'}
          </button>
        </div>

        {showStores && (
          <div className="grid grid-cols-1 gap-4">
            {stores.map((s: Store) => (
              <div key={s.id_tienda} className="bg-white p-6 rounded-[32px] shadow-sm flex items-center justify-between border border-gray-50 group">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="bg-indigo-50 text-indigo-600 text-[8px] px-2 py-0.5 rounded-full font-black">{s.id_tienda}</span>
                    <p className="font-black text-gray-900 text-sm uppercase">{s.nombre}</p>
                  </div>
                  <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase leading-tight italic">{s.direccion || 'Sin dirección registrada'}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={() => setEditingStore({ ...s })} className="bg-gray-100 p-3 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all text-gray-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                  </button>

                  {isRootAdmin(user) && s.id_tienda !== 'T01' && (
                    <button
                      onClick={() => onDeleteStore(s)}
                      className="bg-red-50 text-red-600 p-3 rounded-2xl hover:bg-red-600 hover:text-white transition-all"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-7 0h8" /></svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNewUserModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[40px] p-8 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black">Crear Usuario</h3>
              <button onClick={() => setShowNewUserModal(false)} className="text-gray-400 font-bold">Cerrar</button>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Nombre completo"
                className="w-full p-4 bg-gray-50 rounded-2xl font-bold"
              />

              <input
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="correo@empresa.com"
                className="w-full p-4 bg-gray-50 rounded-2xl font-bold"
              />

              <select
                value={newUserStore}
                onChange={(e) => setNewUserStore(e.target.value)}
                className="w-full p-4 bg-gray-50 rounded-2xl font-bold"
              >
                {stores.map((s: Store) => <option key={s.id_tienda} value={s.id_tienda}>{s.nombre}</option>)}
              </select>

              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as Role)}
                className="w-full p-4 bg-gray-50 rounded-2xl font-bold"
              >
                {getAssignableRoles(user).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>

              <p className="text-[11px] text-gray-400 font-medium">
                Al crear el usuario se enviará una contraseña temporal al correo.
              </p>
            </div>

            <button
              onClick={handleCreateUserSubmit}
              disabled={loading}
              className="w-full bg-indigo-600 text-white font-black py-4 rounded-3xl shadow-xl shadow-indigo-100 disabled:opacity-50"
            >
              {loading ? 'CREANDO...' : 'CREAR USUARIO'}
            </button>
          </div>
        </div>
      )}

      {showNewStoreModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-gray-900 w-full max-w-md rounded-[40px] p-8 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-white">Nueva Sede</h3>
              <button onClick={() => setShowNewStoreModal(false)} className="text-gray-400 font-bold">Cerrar</button>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                value={newStoreName}
                onChange={e => setNewStoreName(e.target.value)}
                placeholder="Nombre de la Tienda"
                className="w-full p-4 bg-gray-800 rounded-2xl outline-none font-bold text-sm text-white focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="text"
                value={newStoreAddr}
                onChange={e => setNewStoreAddr(e.target.value)}
                placeholder="Dirección completa..."
                className="w-full p-4 bg-gray-800 rounded-2xl outline-none font-bold text-sm text-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={handleCreateStoreSubmit}
              disabled={loading || !newStoreName}
              className="w-full bg-indigo-600 py-4 rounded-2xl font-black text-xs uppercase shadow-lg shadow-indigo-900/20 active:scale-95 transition-all disabled:opacity-50 text-white"
            >
              Añadir Tienda
            </button>
          </div>
        </div>
      )}

      {showResetModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[40px] p-8 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-red-600">Resetear Tienda</h3>
              <button onClick={() => setShowResetModal(false)} className="text-gray-400 font-bold">Cerrar</button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Esto dejará en cero <strong>stock, recibidos y aperturas</strong> solo de la tienda seleccionada.
              </p>

              <select
                value={resetStoreId}
                onChange={(e) => setResetStoreId(e.target.value)}
                className="w-full p-4 bg-gray-50 rounded-2xl font-bold"
              >
                {stores.map((s: Store) => (
                  <option key={s.id_tienda} value={s.id_tienda}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleResetSubmit}
              disabled={loading || !resetStoreId}
              className="w-full bg-red-600 text-white font-black py-4 rounded-3xl shadow-xl disabled:opacity-50"
            >
              {loading ? 'RESETEANDO...' : 'CONFIRMAR RESET'}
            </button>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <form onSubmit={handleUpdateUser} className="bg-white w-full max-w-md rounded-[40px] p-8 space-y-6 animate-in slide-in-from-bottom-20 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black">Editar Usuario</h3>
              <button type="button" onClick={() => setEditingUser(null)} className="text-gray-400 font-bold">Cerrar</button>
            </div>

            <div className="space-y-4">
              <label className="block space-y-1">
                <span className="text-[10px] font-black text-gray-400 uppercase">Nombre Completo</span>
                <input type="text" value={editingUser.nombre} onChange={e => setEditingUser({ ...editingUser, nombre: e.target.value })} className="w-full p-4 bg-gray-50 rounded-2xl font-bold" />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-black text-gray-400 uppercase">Sede Asignada</span>
                <select value={editingUser.tienda} onChange={e => setEditingUser({ ...editingUser, tienda: e.target.value })} className="w-full p-4 bg-gray-50 rounded-2xl font-bold">
                  {stores.map((s: Store) => <option key={s.id_tienda} value={s.id_tienda}>{s.nombre}</option>)}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-black text-gray-400 uppercase">Rol / Permisos</span>
                <select value={editingUser.rol} onChange={e => setEditingUser({ ...editingUser, rol: e.target.value as Role })} className="w-full p-4 bg-gray-50 rounded-2xl font-bold">
                  {getAssignableRoles(user, editingUser).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            </div>

            <button type="submit" className="w-full bg-indigo-600 text-white font-black py-4 rounded-3xl shadow-xl shadow-indigo-100">GUARDAR CAMBIOS</button>
          </form>
        </div>
      )}

      {editingStore && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[40px] p-8 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black">Editar Sede</h3>
              <button onClick={() => setEditingStore(null)} className="text-gray-400 font-bold">Cerrar</button>
            </div>
            <div className="space-y-4">
              <label className="block space-y-1">
                <span className="text-[10px] font-black text-gray-400 uppercase">Nombre</span>
                <input type="text" value={editingStore.nombre} onChange={e => setEditingStore({ ...editingStore, nombre: e.target.value })} className="w-full p-4 bg-gray-50 rounded-2xl font-bold" />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-black text-gray-400 uppercase">Dirección</span>
                <textarea value={editingStore.direccion || ''} onChange={e => setEditingStore({ ...editingStore, direccion: e.target.value })} className="w-full p-4 bg-gray-50 rounded-2xl font-bold h-24" />
              </label>
            </div>
            <button onClick={() => { onUpdateStore(editingStore); setEditingStore(null); }} className="w-full bg-gray-900 text-white font-black py-4 rounded-3xl">ACTUALIZAR SEDE</button>
          </div>
        </div>
      )}
    </div>
  );
};


const InventarioView = ({ user, showNotify }: any) => {
  const [loading, setLoading] = useState(false);
  const [expected, setExpected] = useState<Costal[]>([]);
  const [scannedCodes, setScannedCodes] = useState<Set<string>>(new Set());
  const [scannedRows, setScannedRows] = useState<Costal[]>([]);

  const loadExpected = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await gasService.getInventory(user?.tienda || '');
      if (res.ok) {
        setExpected(res.data || []);
      } else {
        showNotify('error', res.error || 'No se pudo cargar el inventario esperado.');
      }
    } finally {
      setLoading(false);
    }
  }, [showNotify, user]);

  useEffect(() => {
    loadExpected();
  }, [loadExpected]);

  const onScanInventory = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;
    if (scannedCodes.has(code)) {
      showNotify('warning', `Costal duplicado en inventario: ${code}`);
      return;
    }

    const found = expected.find((item) => item.codigo_barras === code);
    if (!found) {
      showNotify('error', `El costal ${code} no pertenece al stock actual.`);
      return;
    }

    setScannedCodes((prev) => new Set(prev).add(code));
    setScannedRows((prev) => [found, ...prev]);
    showNotify('success', `Inventariado: ${code}`);
  };

  const missingRows = expected.filter((item) => !scannedCodes.has(item.codigo_barras));
  const groupedScanned = groupRowsByCategory(
    scannedRows.map((item) => ({
      codigo: item.codigo_barras,
      categoria: item.categoria,
      piezas: item.piezas_asignadas || 0,
    }))
  );

  const totalScannedCostales = scannedRows.length;
  const totalScannedPieces = scannedRows.reduce((acc, item) => acc + (item.piezas_asignadas || 0), 0);
  const totalPendingCostales = missingRows.length;
  const totalPendingPieces = missingRows.reduce((acc, item) => acc + (item.piezas_asignadas || 0), 0);

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-white p-8 rounded-[32px] shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black tracking-tighter">Toma de Inventario</h2>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Escaneo de costales de la tienda {user?.tienda || ''}</p>
          </div>
          <button onClick={loadExpected} disabled={loading} className="bg-gray-900 text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
            {loading ? 'Cargando...' : 'Recargar'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-indigo-50 rounded-3xl p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Costales contados</p>
            <p className="text-3xl font-black text-indigo-700 mt-2">{totalScannedCostales}</p>
            <p className="text-[10px] font-bold text-indigo-400 mt-1">Piezas: {totalScannedPieces}</p>
          </div>
          <div className="bg-orange-50 rounded-3xl p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">Pendientes</p>
            <p className="text-3xl font-black text-orange-700 mt-2">{totalPendingCostales}</p>
            <p className="text-[10px] font-bold text-orange-400 mt-1">Piezas: {totalPendingPieces}</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[32px] shadow-sm">
        <h3 className="text-lg font-black mb-4">Escanear costales</h3>
        <Scanner onScan={onScanInventory} allowManualEntry={false} placeholder="Escanea costal para inventario" />
      </div>

      <div className="space-y-4">
        {groupedScanned.length === 0 ? (
          <div className="bg-white p-8 rounded-[32px] shadow-sm text-center text-gray-400 font-black border border-dashed">Sin costales inventariados aún.</div>
        ) : (
          groupedScanned.map(([category, rows]) => {
            const subtotalPieces = rows.reduce((acc, row) => acc + (row.piezas || 0), 0);
            return (
              <div key={category} className="bg-white p-6 rounded-[32px] shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">{category}</h4>
                    <p className="text-[10px] font-bold text-gray-400">Costales: {rows.length}</p>
                  </div>
                  <div className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest">
                    Piezas: {subtotalPieces}
                  </div>
                </div>
                <div className="overflow-hidden rounded-3xl border border-gray-100">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-gray-500 uppercase tracking-widest text-[10px]">
                      <tr>
                        <th className="px-4 py-3">Código de costal</th>
                        <th className="px-4 py-3">Categoría</th>
                        <th className="px-4 py-3 text-right">Piezas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.codigo} className="border-t border-gray-100">
                          <td className="px-4 py-3 font-black text-gray-900">{row.codigo}</td>
                          <td className="px-4 py-3 font-bold text-gray-500">{row.categoria}</td>
                          <td className="px-4 py-3 font-black text-right text-indigo-600">{row.piezas}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const ReportesView = ({ user }: any) => {
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [reportType, setReportType] = useState('RECIBIDOS');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const mappedRows = useMemo(() => {
    return results.map((item) => ({
      codigo: item.codigo_barras || '',
      categoria: item.categoria || 'SIN CATEGORÍA',
      piezas:
        reportType === 'ABIERTOS'
          ? Number(item.piezas_contadas ?? item.piezas_asignadas ?? 0)
          : Number(item.piezas_asignadas ?? item.stock_piezas ?? 0),
      fecha: item.fecha_recepcion || item.fecha_apertura || item.fecha_conteo || '',
      tienda: item.tienda || user?.tienda || '',
    }));
  }, [reportType, results, user]);

  const groupedRows = useMemo(() => groupRowsByCategory(mappedRows), [mappedRows]);
  const totalGeneralCostales = mappedRows.length;
  const totalGeneralPiezas = mappedRows.reduce((acc, row) => acc + (row.piezas || 0), 0);

  const generateReport = async () => {
    setLoading(true);
    try {
      const res: any = await gasService.getDetailedReport({ type: reportType, dateFrom, dateTo, tienda: 'ALL', usuario: 'ALL' });
      if (res.ok) setResults(res.data || []);
      else setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = () => {
    if (mappedRows.length === 0) return;

    const exportRows: any[] = [];
    groupedRows.forEach(([category, rows]) => {
      exportRows.push({ 'Código de costal': '', 'Categoría': category, 'Piezas': '', 'Tipo': 'ENCABEZADO CATEGORÍA' });
      rows.forEach((row) => {
        exportRows.push({
          'Código de costal': row.codigo,
          'Categoría': row.categoria,
          'Piezas': row.piezas,
          'Tipo': reportType,
        });
      });
      exportRows.push({
        'Código de costal': `Subtotal ${category}`,
        'Categoría': category,
        'Piezas': rows.reduce((acc, row) => acc + (row.piezas || 0), 0),
        'Tipo': 'SUBTOTAL',
      });
    });
    exportRows.push({
      'Código de costal': 'TOTALES GENERALES',
      'Categoría': 'TODAS',
      'Piezas': totalGeneralPiezas,
      'Tipo': 'TOTAL GENERAL',
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reportes');
    XLSX.writeFile(wb, `reporte_${reportType.toLowerCase()}_${dateFrom}_${dateTo}.xlsx`);
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-white p-8 rounded-[40px] shadow-sm space-y-6">
        <h2 className="text-2xl font-black text-center">Reportes por Costal</h2>
        <div className="grid grid-cols-2 gap-4">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="p-3 bg-gray-50 rounded-2xl outline-none text-sm" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="p-3 bg-gray-50 rounded-2xl outline-none text-sm" />
        </div>
        <div className="flex gap-2 p-1 bg-gray-50 rounded-3xl">
          {['STOCK', 'RECIBIDOS', 'ABIERTOS'].map(t => (
            <button key={t} onClick={() => setReportType(t)} className={`flex-1 py-3 rounded-2xl text-[8px] font-black transition-all ${reportType === t ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}>{t}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={generateReport} disabled={loading} className="w-full bg-gray-900 text-white font-black py-4 rounded-[28px] text-xs uppercase tracking-widest shadow-xl disabled:opacity-50">{loading ? 'Generando...' : 'Generar consulta'}</button>
          <button onClick={exportExcel} disabled={mappedRows.length === 0} className="w-full bg-emerald-600 text-white font-black py-4 rounded-[28px] text-xs uppercase tracking-widest shadow-xl disabled:opacity-50">Exportar Excel</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-indigo-50 rounded-[32px] p-5 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Total costales</p>
          <p className="text-3xl font-black text-indigo-700 mt-2">{totalGeneralCostales}</p>
        </div>
        <div className="bg-green-50 rounded-[32px] p-5 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-green-500">Total piezas</p>
          <p className="text-3xl font-black text-green-700 mt-2">{totalGeneralPiezas}</p>
        </div>
      </div>

      <div className="space-y-4">
        {groupedRows.length === 0 ? (
          <div className="bg-white p-8 rounded-[32px] shadow-sm text-center text-gray-400 font-black border border-dashed">No hay resultados para el rango seleccionado.</div>
        ) : (
          groupedRows.map(([category, rows]) => {
            const subtotalPieces = rows.reduce((acc, row) => acc + (row.piezas || 0), 0);
            return (
              <div key={category} className="bg-white p-6 rounded-[32px] shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">{category}</h3>
                    <p className="text-[10px] font-bold text-gray-400">Costales: {rows.length}</p>
                  </div>
                  <div className="bg-gray-900 text-white px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest">
                    Piezas: {subtotalPieces}
                  </div>
                </div>
                <div className="overflow-hidden rounded-3xl border border-gray-100">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-gray-500 uppercase tracking-widest text-[10px]">
                      <tr>
                        <th className="px-4 py-3">Código de costal</th>
                        <th className="px-4 py-3">Categoría</th>
                        <th className="px-4 py-3 text-right">Piezas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={`${category}-${row.codigo}-${row.fecha}`} className="border-t border-gray-100">
                          <td className="px-4 py-3 font-black text-gray-900">{row.codigo}</td>
                          <td className="px-4 py-3 font-bold text-gray-500">{row.categoria}</td>
                          <td className="px-4 py-3 font-black text-right text-indigo-600">{row.piezas}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50">
                        <td className="px-4 py-3 font-black text-gray-900">Subtotal {category}</td>
                        <td className="px-4 py-3 font-bold text-gray-500">{rows.length} costales</td>
                        <td className="px-4 py-3 font-black text-right text-gray-900">{subtotalPieces}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="bg-white p-6 rounded-[32px] shadow-sm border-2 border-indigo-100">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Totales generales</p>
            <h3 className="text-lg font-black text-gray-900 mt-1">Resumen final del reporte</h3>
          </div>
          <div className="text-right">
            <p className="text-sm font-black text-gray-900">Costales: {totalGeneralCostales}</p>
            <p className="text-sm font-black text-indigo-600">Piezas: {totalGeneralPiezas}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
