export type BackendMode = 'gas' | 'mock' | 'blocked';

const rawGasUrl = String(import.meta.env.VITE_GAS_URL || '').trim();
const normalizedGasUrl = rawGasUrl.replace(/\/$/, '');

const isPlaceholderGasUrl =
  !normalizedGasUrl ||
  normalizedGasUrl === 'MOCK' ||
  normalizedGasUrl.includes('REPLACE_WITH_YOUR_DEPLOY_ID');

const isProduction = Boolean(import.meta.env.PROD);
const isGasConfigured = !isPlaceholderGasUrl;

const backendMode: BackendMode = isGasConfigured
  ? 'gas'
  : isProduction
    ? 'blocked'
    : 'mock';

export const appConfig = {
  isProduction,
  gasUrl: normalizedGasUrl,
  isGasConfigured,
  backendMode,
  backendBlockedMessage:
    'La aplicación no tiene el backend configurado. Configura VITE_GAS_URL antes de usar producción.',
  rootAdminEmail: String(
    import.meta.env.VITE_ROOT_ADMIN_EMAIL || 'curiosidades2526@gmail.com'
  )
    .trim()
    .toLowerCase(),
  rootAdminInitialPassword: String(
    import.meta.env.VITE_ROOT_ADMIN_INITIAL_PASSWORD || 'Admin2026!'
  ).trim(),
} as const;
