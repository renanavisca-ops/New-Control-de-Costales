import { Costal, Apertura, User, Role, CostalStatus, Store } from '../types';

// En producción, reemplazar con la URL de implementación del Web App de Apps Script
const GAS_URL = 'https://script.google.com/macros/s/REPLACE_WITH_YOUR_DEPLOY_ID/exec';

// Claves para el "DB Virtual" en modo mock
const MOCK_DB_COSTALES = 'cc_mock_db_costales';
const MOCK_DB_STORES = 'cc_mock_db_stores';
const MOCK_DB_APERTURAS = 'cc_mock_db_aperturas';
const MOCK_DB_USERS = 'cc_mock_db_users';

class GASService {
  private async request(action: string, data: any = {}) {
    if (GAS_URL.includes('REPLACE')) {
      console.warn(`GAS_URL no configurada. Simulando acción: ${action}`);
      return this.mockResponse(action, data);
    }

    try {
      const response = await fetch(GAS_URL, {
        method: 'POST',
        body: JSON.stringify({ action, ...data }),
        mode: 'no-cors'
      });
      return { ok: true, data: {} };
    } catch (error) {
      console.error('GAS request failed:', error);
      return { ok: false, error: 'Error de conexión con el servidor' };
    }
  }

  private getMockData<T>(key: string): T[] {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  }

  private saveMockData<T>(key: string, data: T[]) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  private mockResponse(action: string, data: any) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const costales = this.getMockData<Costal>(MOCK_DB_COSTALES);
        const aperturas = this.getMockData<Apertura>(MOCK_DB_APERTURAS);
        const stores = this.getMockData<Store>(MOCK_DB_STORES);
        const users = this.getMockData<User>(MOCK_DB_USERS);

        switch (action) {
          case 'authUsuario':
            const foundUser = users.find(u => u.email === data.email);
            if (foundUser) {
              resolve({ ok: true, data: foundUser });
            } else {
              // Si no hay usuarios en mock, creamos el Admin por defecto
              const defaultAdmin = { email: data.email, nombre: 'Admin Demo', tienda: 'T01', rol: Role.ADMIN, password: 'admin' };
              if (users.length === 0) {
                this.saveMockData(MOCK_DB_USERS, [defaultAdmin]);
              }
              resolve({ ok: true, data: defaultAdmin });
            }
            break;

          case 'registrarUsuario':
            if (users.some(u => u.email === data.email)) {
              resolve({ ok: false, error: 'Usuario ya existe' });
            } else {
              this.saveMockData(MOCK_DB_USERS, [...users, data]);
              resolve({ ok: true, data });
            }
            break;

          case 'updateUsuario':
            const updatedUsers = users.map(u => u.email === data.email ? { ...u, ...data } : u);
            this.saveMockData(MOCK_DB_USERS, updatedUsers);
            resolve({ ok: true });
            break;

          case 'listUsuarios':
            resolve({ ok: true, data: users });
            break;

          case 'checkDuplicado':
            const exists = costales.some(c => c.codigo_barras === data.codigo);
            resolve({ ok: true, exists });
            break;

          case 'addCostal':
            if (costales.some(c => c.codigo_barras === data.codigo_barras)) {
              resolve({ ok: false, error: 'Código ya existe en el sistema' });
            } else {
              this.saveMockData(MOCK_DB_COSTALES, [...costales, data]);
              resolve({ ok: true });
            }
            break;

          case 'abrirCostal':
            const costalToOpen = costales.find(c => c.codigo_barras === data.codigo_barras);
            if (!costalToOpen) {
              resolve({ ok: false, error: 'El costal no existe' });
            } else if (costalToOpen.estado === CostalStatus.ABIERTO) {
              resolve({ ok: false, error: 'El costal ya fue abierto previamente' });
            } else {
              const updatedCostales = costales.map(c => 
                c.codigo_barras === data.codigo_barras ? { ...c, estado: CostalStatus.ABIERTO } : c
              );
              this.saveMockData(MOCK_DB_COSTALES, updatedCostales);
              this.saveMockData(MOCK_DB_APERTURAS, [...aperturas, data]);
              resolve({ ok: true });
            }
            break;

          case 'trasladarCostal':
            const updatedTransfer = costales.map(c => 
              c.codigo_barras === data.codigo ? { ...c, tienda: data.tiendaDestino, estado: CostalStatus.TRASLADADO } : c
            );
            this.saveMockData(MOCK_DB_COSTALES, updatedTransfer);
            resolve({ ok: true });
            break;

          case 'listExistencias':
            const inventory = costales.filter(c => c.tienda === data.tienda && c.estado !== CostalStatus.ABIERTO);
            resolve({ ok: true, data: inventory });
            break;

          case 'listTiendas':
            resolve({ ok: true, data: stores });
            break;

          case 'addTienda':
            const cleanName = data.nombre.trim();
            if (stores.some(s => s.nombre.toLowerCase() === cleanName.toLowerCase())) {
              resolve({ ok: false, error: 'Ya existe una tienda con ese nombre' });
            } else {
              this.saveMockData(MOCK_DB_STORES, [...stores, data]);
              resolve({ ok: true });
            }
            break;

          case 'updateTienda':
            const updatedStores = stores.map(s => s.id_tienda === data.id_tienda ? { ...s, ...data } : s);
            this.saveMockData(MOCK_DB_STORES, updatedStores);
            resolve({ ok: true });
            break;

          case 'reportes':
            const totalAperturas = aperturas.length;
            const avgGlobalDiff = totalAperturas > 0 ? aperturas.reduce((acc, curr) => acc + curr.diferencia, 0) / totalAperturas : 0;
            
            const shopStats = stores.map(s => {
              const received = costales.filter(c => c.tienda === s.id_tienda).length;
              const opened = aperturas.filter(a => a.tienda === s.id_tienda).length;
              const pending = costales.filter(c => c.tienda === s.id_tienda && c.estado !== CostalStatus.ABIERTO).length;
              return { id: s.id_tienda, nombre: s.nombre, received, opened, pending };
            });

            const userStats = Array.from(new Set(aperturas.map(a => a.usuario_apertura))).map(email => {
              const userAperturas = aperturas.filter(a => a.usuario_apertura === email);
              const count = userAperturas.length;
              const avgDiff = count > 0 ? userAperturas.reduce((acc, curr) => acc + curr.diferencia, 0) / count : 0;
              return { email, count, avgDiff };
            });

            resolve({ ok: true, data: { shopStats, userStats, avgGlobalDiff } });
            break;

          case 'getDetailedReport':
            const { type, dateFrom, dateTo, tienda, usuario } = data;
            const start = new Date(dateFrom).getTime();
            const end = new Date(dateTo).getTime() + (24 * 60 * 60 * 1000);

            let filtered: any[] = [];
            if (type === 'STOCK') {
              filtered = costales.filter(c => c.estado !== CostalStatus.ABIERTO);
            } else if (type === 'RECIBIDOS') {
              filtered = costales.filter(c => {
                const date = new Date(c.fecha_recepcion).getTime();
                return date >= start && date <= end;
              });
            } else if (type === 'ABIERTOS') {
              filtered = aperturas.filter(a => {
                const date = new Date(a.fecha_apertura).getTime();
                return date >= start && date <= end;
              });
            }

            if (tienda !== 'ALL') {
              filtered = filtered.filter(item => item.tienda === tienda);
            }
            if (usuario !== 'ALL') {
              filtered = filtered.filter(item => (item.usuario_recibe === usuario || item.usuario_apertura === usuario));
            }

            resolve({ ok: true, data: filtered });
            break;

          default:
            resolve({ ok: true });
        }
      }, 500);
    });
  }

  async auth(email: string) {
    return this.request('authUsuario', { email });
  }

  async register(userData: User) {
    return this.request('registrarUsuario', userData);
  }

  async updateUsuario(userData: Partial<User> & { email: string }) {
    return this.request('updateUsuario', userData);
  }

  async listUsuarios() {
    return this.request('listUsuarios');
  }

  async checkDuplicate(codigo: string) {
    return this.request('checkDuplicado', { codigo });
  }

  async addCostal(costal: Costal) {
    return this.request('addCostal', costal);
  }

  async openCostal(apertura: Apertura) {
    return this.request('abrirCostal', apertura);
  }

  async transferCostal(codigo: string, tiendaDestino: string, usuario: string) {
    return this.request('trasladarCostal', { codigo, tiendaDestino, usuario });
  }

  async getInventory(tienda: string) {
    return this.request('listExistencias', { tienda });
  }

  async getReports(tienda?: string) {
    return this.request('reportes', { tienda });
  }

  async getStores() {
    return this.request('listTiendas');
  }

  async addStore(store: Store) {
    return this.request('addTienda', store);
  }

  async updateTienda(store: Store) {
    return this.request('updateTienda', store);
  }

  async getDetailedReport(params: { type: string, dateFrom: string, dateTo: string, tienda: string, usuario: string }) {
    return this.request('getDetailedReport', params);
  }
}

export const gasService = new GASService();
