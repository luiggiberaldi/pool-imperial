import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ResetPasswordView from './views/ResetPasswordView.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { supabaseCloud } from './config/supabaseCloud.js'
import { storageService } from './utils/storageService.js'
import './index.css'

window.supabaseCloud = supabaseCloud;
window.storageService = storageService;

// ── Efectos pesados de GPU desactivados en equipos sin aceleración (remoto/gama baja) ──
// `backdrop-filter: blur()` PARPADEA (modales aparecen/desaparecen) en equipos sin
// GPU real — típico en control remoto (UltraViewer/RDP) y GPUs emuladas. Además, las
// animaciones de entrada/salida y los bucles (pulse/ping/bounce) provocan repintados
// caros en compositing por software. Desactivamos ambos GLOBALMENTE inyectando el
// estilo en runtime: así queda de último en la cascada y siempre gana (una regla
// equivalente en index.css NO siempre prevalece sobre las utilidades de Tailwind).
//   - Se mantiene el fondo semitransparente → los modales se ven bien.
//   - Se mantienen los spinners (animate-spin) → los indicadores de carga siguen vivos.
// Reversible (equipos con GPU buena): document.documentElement.classList.add('gpu-blur')
// y recargar — reactiva blur y animaciones.
if (typeof document !== 'undefined' && !document.documentElement.classList.contains('gpu-blur')) {
  const gpuFix = document.createElement('style');
  gpuFix.id = 'gpu-fx-fix';
  gpuFix.textContent =
    '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' +
    '.animate-in,.animate-out,.animate-pulse,.animate-ping,.animate-bounce{animation:none!important}';
  document.head.appendChild(gpuFix);
}


// ── Auto-actualización del Service Worker ──
if ('serviceWorker' in navigator) {
  // Cuando el nuevo SW toma control, recargar para cargar los assets nuevos.
  // Esto garantiza que el usuario siempre ejecuta la versión más reciente.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) {
      reloading = true;
      window.location.reload();
    }
  });

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      // Chequear actualizaciones cada 60 segundos
      setInterval(() => reg.update().catch(() => {}), 60 * 1000);
    } catch (_) {}
  });
}

/* eslint-disable react-refresh/only-export-components */

// ── Evitar que la rueda del mouse cambie valores en inputs numéricos ──
document.addEventListener('wheel', (e) => {
  if (e.target?.type === 'number' && document.activeElement === e.target) {
    e.preventDefault();  // Bloquear ANTES de que el browser cambie el valor
    e.target.blur();     // Luego quitar foco para que no siga capturando scroll
  }
}, { passive: false });

// Detectar token de recuperación en la URL al cargar (antes de React)
function detectRecovery() {
  const hash = window.location.hash;
  const params = new URLSearchParams(window.location.search);
  return hash.includes('type=recovery') || params.has('code');
}

function AppRouter() {
  const [isRecovery, setIsRecovery] = useState(detectRecovery);

  useEffect(() => {
    const { data: { subscription } } = supabaseCloud.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (isRecovery) {
    return (
      <ResetPasswordView
        onDone={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
          setIsRecovery(false);
        }}
      />
    );
  }

  return <App />;
}

import { ConfirmProvider } from './hooks/useConfirm.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <AppRouter />
      </ConfirmProvider>
    </ToastProvider>
  </React.StrictMode>,
)

