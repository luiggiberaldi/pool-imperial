// Versión de la app. Se define en package.json (campo "version") y vite.config.js la inyecta en el build.
// Para publicar una nueva versión: cambia "version" en package.json y crea el tag git correspondiente (vX.Y.Z).
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';
