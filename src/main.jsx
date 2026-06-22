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

// ── FIX flicker de modales en equipos sin aceleración GPU (escritorio remoto) ──
// `backdrop-filter: blur()` parpadea (aparece/desaparece) en equipos sin GPU
// real — típico en control remoto (UltraViewer/RDP) y GPUs emuladas. Lo
// desactivamos GLOBALMENTE inyectando el estilo en runtime: así queda de último
// en la cascada y siempre gana (una regla equivalente en index.css NO siempre
// prevalece sobre las utilidades backdrop-blur-* de Tailwind, por eso no bastaba).
// El fondo oscuro semitransparente se mantiene → los modales se ven bien.
// Reversible: document.documentElement.classList.add('gpu-blur') y recargar.
if (typeof document !== 'undefined' && !document.documentElement.classList.contains('gpu-blur')) {
  const blurFix = document.createElement('style');
  blurFix.id = 'gpu-blur-fix';
  blurFix.textContent = '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';
  document.head.appendChild(blurFix);
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

