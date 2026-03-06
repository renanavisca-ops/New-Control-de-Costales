import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Role, Costal, Apertura, CostalStatus, OfflineAction, Store } from './types';
import { CATEGORIES, PIECES_MAP, INITIAL_STORES } from './constants';
import { gasService } from './services/gasService';
import Scanner from './components/Scanner';

type Screen = 'LOGIN' | 'REGISTRO' | 'RECEPCION' | 'EXISTENCIAS' | 'APERTURA' | 'METRICAS' | 'REPORTES';

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

const LoginScreen = ({ loading, onLogin, onGoRegister }: any) => {
  const [email, setEmail] = useState('');
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6">
      <div className="w-full max-w-md bg-white p-10 rounded-[40px] shadow-2xl space-y-8 border border-gray-100">
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
          />
          <button
            onClick={() => onLogin(email)}
            disabled={loading}
            className="w-full bg-indigo-600 text-white font-black py-5 rounded-3xl shadow-xl shadow-indigo-100 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? 'CARGANDO...' : 'INICIAR SESIÓN'}
          </button>
          <button onClick={onGoRegister} className="w-full text-indigo-600 font-bold text-sm">Crear nueva cuenta</button>
        </div>
      </div>
    </div>
  );
};

const RegisterScreen = ({ loading, stores, onRegister, onBack }: any) => {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [tienda, setTienda] = useState(stores[0]?.id_tienda || '');

  useEffect(() => {
    if (!tienda && stores[0]?.id_tienda) setTienda(stores[0].id_tienda);
  }, [stores, tienda]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6">
      <div className="w-full max-w-md bg-white p-10 rounded-[40px] shadow-2xl space-y-8 border border-gray-100">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-black tracking-tight">Nuevo operador</h2>
          <p className="text-gray-400 font-medium">Los registros nuevos entran solo como OPERADOR.</p>
        </div>
        <div className="space-y-4">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" className="w-full p-5 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none transition-all font-semibold" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@empresa.com" className="w-full p-5 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none transition-all font-semibold" />
          <select value={tienda} onChange={(e) => setTienda(e.target.value)} className="w-full p-5 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl outline-none transition-all font-semibold">
            {stores.map((store: Store) => <option key={store.id_tienda} value={store.id_tienda}>{store.nombre}</option>)}
          </select>
          <button onClick={() => onRegister({ nombre, email, tienda })} disabled={loading} className="w-full bg-indigo-600 text-white font-black py-5 rounded-3xl shadow-xl shadow-indigo-100 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
            {loading ? 'GUARDANDO...' : 'REGISTRAR OPERADOR'}
          </button>
          <button onClick={onBack} className="w-full text-gray-500 font-bold text-sm">Volver</button>
        </div>
      </div>
    </div>
  );
};

const AperturaScreen = ({ user, isOnline, showNotify, enqueueAction, loadMetrics }: any) => {
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
        <Scanner onScan={checkCode} placeholder="Escanea código para validar stock..." />
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

  useEffect(() => {
    if (isOnline) {
      gasService.getStores().then((res: any) => {
        if (res.ok && res.data?.length > 0) {
          const unique = (res.data as Store[]).filter((v, i, a) => a.findIndex(t => t.nombre.toLowerCase() === v.nombre.toLowerCase()) === i);
          setStores(unique);
          localStorage.setItem(STORES_CACHE_KEY, JSON.stringify(unique));
        }
      });
      loadMetrics();
    }
  }, [isOnline]);

  const loadMetrics = async () => {
    if (!isOnline) return;
    const res: any = await gasService.getReports();
    if (res.ok) setMetrics(res.data);
  };

  const showNotify = (type: 'success' | 'error' | 'warning', msg: string) => {
    setNotification({ type, msg });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleLogin = async (email: string) => {
    if (!email) return showNotify('error', 'Ingresa un correo');
    setLoading(true);
    try {
      const res: any = await gasService.auth(email.trim().toLowerCase());
      if (res.ok && res.data) {
        setUser(res.data);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.data));
        setCurrentScreen('RECEPCION');
        showNotify('success', `Bienvenido ${res.data.nombre}`);
      } else {
        showNotify('error', res.error || 'Usuario no encontrado.');
      }
    } catch {
      showNotify('error', 'Error al autenticar.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async ({ nombre, email, tienda }: { nombre: string; email: string; tienda: string }) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!nombre.trim() || !cleanEmail || !tienda) return showNotify('error', 'Completa todos los campos.');
    if (cleanEmail === ROOT_ADMIN_EMAIL) return showNotify('error', 'Ese correo está reservado para el administrador principal.');
    setLoading(true);
    try {
      const newUser: User = {
        nombre: nombre.trim(),
        email: cleanEmail,
        tienda,
        rol: Role.OPERADOR,
      };
      const res: any = await gasService.register(newUser);
      if (res.ok) {
        showNotify('success', 'Operador registrado.');
        setCurrentScreen('LOGIN');
      } else {
        showNotify('error', res.error || 'No se pudo registrar.');
      }
    } catch {
      showNotify('error', 'Error al registrar.');
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
        const updatedStores = [...stores, newStore];
        setStores(updatedStores);
        localStorage.setItem(STORES_CACHE_KEY, JSON.stringify(updatedStores));
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
        const updatedStores = stores.map(s => s.id_tienda === store.id_tienda ? store : s);
        setStores(updatedStores);
        localStorage.setItem(STORES_CACHE_KEY, JSON.stringify(updatedStores));
        showNotify('success', 'Tienda actualizada.');
      }
    } catch {
      showNotify('error', 'Error al actualizar.');
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
    setCurrentScreen('LOGIN');
  };

  const navItems = [
    { id: 'RECEPCION', label: 'Recibir', icon: '📥', show: true },
    { id: 'EXISTENCIAS', label: 'Stock', icon: '📦', show: true },
    { id: 'APERTURA', label: 'Abrir', icon: '✂️', show: true },
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

        {currentScreen === 'LOGIN' && <LoginScreen loading={loading} onLogin={handleLogin} onGoRegister={() => setCurrentScreen('REGISTRO')} />}
        {currentScreen === 'REGISTRO' && <RegisterScreen loading={loading} stores={stores} onRegister={handleRegister} onBack={() => setCurrentScreen('LOGIN')} />}
        {currentScreen === 'APERTURA' && <AperturaScreen user={user} isOnline={isOnline} showNotify={showNotify} enqueueAction={enqueueAction} loadMetrics={loadMetrics} />}
        {currentScreen === 'EXISTENCIAS' && <ExistenciasView user={user} onOpen={(code: string) => { localStorage.setItem('pending_apertura_code', code); setCurrentScreen('APERTURA'); }} />}
        {currentScreen === 'RECEPCION' && <RecepcionView user={user} isOnline={isOnline} showNotify={showNotify} enqueueAction={enqueueAction} loadMetrics={loadMetrics} selectedCategory={selectedCategory} setSelectedCategory={(cat: string) => { setSelectedCategory(cat); localStorage.setItem('cc_last_category', cat); }} sessionScannedCodes={sessionScannedCodes} setSessionScannedCodes={setSessionScannedCodes} />}
        {currentScreen === 'METRICAS' && canAccessAdmin(user) && <MetricasView metrics={metrics} user={user} stores={stores} showNotify={showNotify} onAddStore={handleAddStore} onUpdateStore={handleUpdateStore} loading={loading} />}
        {currentScreen === 'REPORTES' && canAccessReports(user) && <ReportesView />}
      </main>

      {user && (
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

const ExistenciasView = ({ user, onOpen }: any) => {
  const [items, setItems] = useState<Costal[]>([]);
  const loadData = useCallback(async () => {
    const res: any = await gasService.getInventory(user?.tienda || '');
    if (res.ok) setItems(res.data);
  }, [user?.tienda]);
  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black tracking-tighter">Stock en Tienda <span className="text-indigo-600">({items.length})</span></h2>
      {items.length === 0 ? <div className="text-center p-20 text-gray-300 font-black border border-dashed rounded-[40px]">Inventario Vacío</div> : (
        <div className="space-y-4">
          {items.map(item => (
            <div key={item.codigo_barras} className="bg-white p-6 rounded-3xl shadow-sm border-l-8 border-indigo-500 flex justify-between items-center">
              <div>
                <p className="font-black text-gray-900">{item.codigo_barras}</p>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">{item.categoria} • ESP: {item.piezas_asignadas}</p>
              </div>
              <button onClick={() => onOpen(item.codigo_barras)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-xs">ABRIR</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const RecepcionView = ({ user, isOnline, showNotify, enqueueAction, loadMetrics, selectedCategory, setSelectedCategory, sessionScannedCodes, setSessionScannedCodes }: any) => {
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
        loadMetrics();
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
        <Scanner onScan={onScanCode} />
      </div>
    </div>
  );
};

const MetricasView = ({ metrics, user, stores, showNotify, onAddStore, onUpdateStore, loading }: any) => {
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreAddr, setNewStoreAddr] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [showStores, setShowStores] = useState(false);
  const [showAddStoreModal, setShowAddStoreModal] = useState(false);

  const limitedAdmin = user?.rol === Role.ADMIN_2;

  useEffect(() => {
    gasService.listUsuarios().then((res: any) => {
      if (res.ok) setUsers(res.data);
    });
  }, []);

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
    } else {
      showNotify('error', res.error || 'No se pudo actualizar.');
    }
  };

  const userPerf = metrics?.userStats.find((u: any) => u.email === user?.email);

  return (
    <div className="space-y-8 pb-12">
      <div className="bg-indigo-600 p-8 rounded-[40px] text-white shadow-2xl">
        <h2 className="text-[10px] font-black opacity-60 uppercase tracking-widest mb-1">Tu Rendimiento</h2>
        <p className="text-4xl font-black">{userPerf?.avgDiff?.toFixed(1) || '0.0'}</p>
        <p className="text-[10px] font-bold opacity-80 uppercase mt-1">DIFERENCIA PROMEDIO (Pzs)</p>
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
              {canManageUser(user, u) && (
                <button onClick={() => setEditingUser({ ...u })} className="bg-gray-100 p-3 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all text-gray-400 group-hover:scale-105 active:scale-95">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-2 gap-3">
          <h3 className="text-lg font-black text-gray-900">Gestión de Tiendas</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowStores(!showStores)} className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest">
              {showStores ? 'Ocultar' : 'Más'}
            </button>
            <button onClick={() => setShowAddStoreModal(true)} className="bg-gray-900 text-white px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest">
              Nueva Tienda
            </button>
          </div>
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
                <button onClick={() => setEditingStore({ ...s })} className="bg-gray-100 p-3 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all text-gray-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

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

      {showAddStoreModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[40px] p-8 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black">Nueva Tienda</h3>
              <button onClick={() => setShowAddStoreModal(false)} className="text-gray-400 font-bold">Cerrar</button>
            </div>
            <div className="space-y-4">
              <label className="block space-y-1">
                <span className="text-[10px] font-black text-gray-400 uppercase">Nombre</span>
                <input type="text" value={newStoreName} onChange={e => setNewStoreName(e.target.value)} placeholder="Nombre de la Tienda" className="w-full p-4 bg-gray-50 rounded-2xl font-bold" />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-black text-gray-400 uppercase">Dirección</span>
                <input type="text" value={newStoreAddr} onChange={e => setNewStoreAddr(e.target.value)} placeholder="Dirección completa..." className="w-full p-4 bg-gray-50 rounded-2xl font-bold" />
              </label>
            </div>
            <button
              onClick={() => {
                onAddStore(newStoreName, newStoreAddr);
                setNewStoreName('');
                setNewStoreAddr('');
                setShowAddStoreModal(false);
              }}
              disabled={loading || !newStoreName.trim()}
              className="w-full bg-indigo-600 text-white font-black py-4 rounded-3xl disabled:opacity-50"
            >
              CREAR TIENDA
            </button>
          </div>
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

const ReportesView = () => {
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [reportType, setReportType] = useState('RECIBIDOS');
  const [results, setResults] = useState<any[]>([]);

  const generateReport = async () => {
    const res: any = await gasService.getDetailedReport({ type: reportType, dateFrom, dateTo, tienda: 'ALL', usuario: 'ALL' });
    if (res.ok) setResults(res.data);
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-white p-8 rounded-[40px] shadow-sm space-y-6">
        <h2 className="text-2xl font-black text-center">Auditoría General</h2>
        <div className="grid grid-cols-2 gap-4">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="p-3 bg-gray-50 rounded-2xl outline-none text-sm" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="p-3 bg-gray-50 rounded-2xl outline-none text-sm" />
        </div>
        <div className="flex gap-2 p-1 bg-gray-50 rounded-3xl">
          {['STOCK', 'RECIBIDOS', 'ABIERTOS'].map(t => (
            <button key={t} onClick={() => setReportType(t)} className={`flex-1 py-3 rounded-2xl text-[8px] font-black transition-all ${reportType === t ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}>{t}</button>
          ))}
        </div>
        <button onClick={generateReport} className="w-full bg-gray-900 text-white font-black py-4 rounded-[28px] text-xs uppercase tracking-widest shadow-xl">Generar Consulta</button>
      </div>
      <div className="space-y-3">
        {results.map((item, i) => (
          <div key={i} className="bg-white p-5 rounded-[32px] shadow-sm flex justify-between items-center">
            <div>
              <p className="font-black text-gray-900 text-sm tracking-tight">{item.codigo_barras || 'ID:' + item.id_apertura?.substring(0, 8)}</p>
              <p className="text-[9px] font-black text-gray-400 uppercase">{item.categoria}</p>
              <p className="text-[8px] font-bold text-indigo-400 mt-0.5">{new Date(item.fecha_recepcion || item.fecha_apertura).toLocaleDateString()}</p>
            </div>
            {item.diferencia !== undefined && (
              <div className={`text-xs font-black p-3 rounded-2xl ${item.diferencia >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                {item.diferencia > 0 ? '+' : ''}{item.diferencia}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
