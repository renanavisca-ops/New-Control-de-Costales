import type { CapacitorConfig } from '@capacitor/cli';

// App de tienda (celular fijo en cada tienda). Abre la pantalla /tienda de la app web publicada en Vercel,
// así cada mejora llega a los celulares sin reinstalar el APK. La pantalla funciona sin internet gracias al
// Service Worker y a la cola local de operaciones.
const URL_APP = process.env.CAP_SERVER_URL || 'https://new-control-de-costales.vercel.app/tienda';

const config: CapacitorConfig = {
  appId: 'com.costales.tienda',
  appName: 'Costales Tienda',
  webDir: 'capacitor-www',
  server: {
    url: URL_APP,
    cleartext: false,
  },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
};

export default config;
