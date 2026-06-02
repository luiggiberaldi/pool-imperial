// src/config/venueConfig.js
// ─────────────────────────────────────────────────────────────
// 🏢 Configuración centralizada del local (venue).
// Un solo archivo controla TODA la identidad del negocio.
//
// PARA REPLICAR EN OTRO LOCAL:
//   1. Duplica este archivo.
//   2. Cambia los valores a los del nuevo negocio.
//   3. No toques ningún otro archivo del sistema.
//
// Los módulos de la app importan desde aquí en vez de hardcodear.
// ─────────────────────────────────────────────────────────────

// ── IDENTIDAD DEL NEGOCIO ──────────────────────────────────
export const VENUE_NAME        = 'Pool Imperial';
export const VENUE_SHORT_NAME  = 'Pool Imperial';
export const VENUE_TAGLINE     = 'Punto de venta simple y poderoso para tu negocio';
export const VENUE_VERSION     = '1.0.0';

// ── MONEDA Y LOCALIZACIÓN ──────────────────────────────────
export const CURRENCY_CODE     = 'COP';            // ISO 4217
export const CURRENCY_LOCALE   = 'es-CO';           // Intl locale
export const CURRENCY_SYMBOL   = '$';               // Para formateo rápido
export const COUNTRY_CODE      = 'CO';              // ISO 3166-1 alpha-2

// ── CONTACTO / SOPORTE (WhatsApp del desarrollador) ────────
export const SUPPORT_WHATSAPP  = '584124051793';     // Sin '+', para URL wa.me/
export const SUPPORT_PHONE     = '+58 412-405-1793'; // Display humano

// ── IMPRESIÓN TÉRMICA ──────────────────────────────────────
export const TICKET_WIDTH_MM   = 58;                 // Ancho del rollo térmico
export const TICKET_LOGO_PATH  = '/logo-ticket.png'; // Logo en tickets PDF
export const TICKET_LOGO_ALT   = VENUE_NAME;

// ── LLAVES DE ALMACENAMIENTO LOCAL ─────────────────────────
// (IndexedDB vía LocalForage)
export const STORAGE_DB_NAME       = 'PoolImperialApp';  // localforage name
export const STORAGE_IDB_NAME      = 'PoolImperial';     // localforage stores
export const STORAGE_BUSINESS_KEY  = 'business_name';    // localStorage key
export const STORAGE_PM_KEY        = 'pool_imperial_payment_methods_v1';

// ── TARIFAS DEFAULT DE MESAS ───────────────────────────────
// Estos valores son fallbacks cuando no hay config guardada en Supabase.
export const DEFAULT_PRICE_PER_HOUR    = 5;    // COP (ej: 5.000)
export const DEFAULT_PRICE_PER_HOUR_BS = 0;    // Bs (legacy compat)
export const DEFAULT_PRICE_PINA        = 2;    // COP (ej: 2.000)
export const DEFAULT_PRICE_PINA_BS     = 0;    // Bs (legacy compat)

// ── PWA / SEO ──────────────────────────────────────────────
export const PWA_THEME_COLOR       = '#D97706';     // amber-600 — Oro Imperial
export const PWA_BACKGROUND_COLOR  = '#F8FAFC';     // slate-50
export const OG_LOCALE             = 'es_CO';

// ── IDENTIDAD VISUAL ──────────────────────────────────────
export const LOGO_PATH         = '/logo.png';
export const LOGO_DARK_PATH    = '/logodark.png';
export const FAVICON_PATH      = '/favicon.png';

// ── BIOMETRÍA / WebAuthn ───────────────────────────────────
export const WEBAUTHN_RP_NAME  = VENUE_NAME;
// rp.id se determina dinámicamente con window.location.hostname

// ── LICENCIAS ──────────────────────────────────────────────
export const LICENSE_SALT = import.meta.env.VITE_LICENSE_SALT || 'POOL_IMPERIAL_COLOMBIA_2026';

// ── HELPER: Objeto agrupado para consumo de componentes ────
export const venueConfig = Object.freeze({
  name:          VENUE_NAME,
  shortName:     VENUE_SHORT_NAME,
  tagline:       VENUE_TAGLINE,
  version:       VENUE_VERSION,
  currency:      CURRENCY_CODE,
  locale:        CURRENCY_LOCALE,
  currencySymbol: CURRENCY_SYMBOL,
  country:       COUNTRY_CODE,
  support: {
    whatsapp:    SUPPORT_WHATSAPP,
    phone:       SUPPORT_PHONE,
  },
  printer: {
    widthMm:     TICKET_WIDTH_MM,
    logoPath:    TICKET_LOGO_PATH,
    logoAlt:     TICKET_LOGO_ALT,
  },
  storage: {
    dbName:          STORAGE_DB_NAME,
    idbName:         STORAGE_IDB_NAME,
    businessKey:     STORAGE_BUSINESS_KEY,
    paymentMethodsKey: STORAGE_PM_KEY,
  },
  defaults: {
    pricePerHour:    DEFAULT_PRICE_PER_HOUR,
    pricePerHourBs:  DEFAULT_PRICE_PER_HOUR_BS,
    pricePina:       DEFAULT_PRICE_PINA,
    pricePinaBs:     DEFAULT_PRICE_PINA_BS,
  },
  pwa: {
    themeColor:      PWA_THEME_COLOR,
    backgroundColor: PWA_BACKGROUND_COLOR,
  },
  logo: {
    light:   LOGO_PATH,
    dark:    LOGO_DARK_PATH,
    favicon: FAVICON_PATH,
  },
});
