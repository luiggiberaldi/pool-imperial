import React, { useState, useEffect, useRef, useMemo, Suspense, lazy } from 'react';
import { Home, ShoppingCart, Store, Users, Download, FlaskConical, BarChart3, WifiOff, X, Settings, Layers } from 'lucide-react';

import SalesView from './views/SalesView';
import DashboardView from './views/DashboardView';
import { ProductsView } from './views/ProductsView';
import SettingsView from './views/SettingsView';
import ResetPasswordView from './views/ResetPasswordView';
import TablesView from './views/TablesView';
import CashierCheckoutView from './views/CashierCheckoutView';

// Lazy-loaded views (no se usan al inicio)
const CustomersView = lazy(() => import('./views/CustomersView'));
const ReportsView = lazy(() => import('./views/ReportsView'));
const TesterView = lazy(() => import('./views/TesterView').then(m => ({ default: m.TesterView })));
const TableFlowTesterView = lazy(() => import('./views/TableFlowTesterView').then(m => ({ default: m.TableFlowTesterView })));

import { useRates } from './hooks/useRates';
import { useSecurity } from './hooks/useSecurity';
import { ProductProvider } from './context/ProductContext';
import { CartProvider } from './context/CartContext';

import TermsOverlay from './components/TermsOverlay';
import OnboardingOverlay from './components/OnboardingOverlay';
import ErrorBoundary from './components/ErrorBoundary';
import { useOfflineQueue } from './hooks/useOfflineQueue';
import { useAutoBackup } from './hooks/useAutoBackup';
import CommandPalette from './components/CommandPalette';

import LoginScreen from './components/security/LoginScreen';
import CloudAuthModal from './components/security/CloudAuthModal';
import { useAuthStore } from './hooks/store/authStore';
import { AnyStaffRoute, CashierRoute, AdminRoute } from './components/security/Guards';
import { useAutoLock } from './hooks/useAutoLock';
import { purgeOldEntries } from './services/auditService';
import { useCloudSync } from './hooks/useCloudSync';
import { useConfirm } from './hooks/useConfirm.jsx';
import { useAppInit } from './hooks/useAppInit';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useGlobalTableAlerts } from './hooks/useGlobalTableAlerts';
import AppVersionLock from './components/AppVersionLock';

// Nombre del negocio fijo para todos los dispositivos (module-level, runs once on import)
if (!localStorage.getItem('business_name')) {
  localStorage.setItem('business_name', 'Pool Imperial');
}

export default function App() {
  const [activeTab, setActiveTab] = useState('inicio');

  // Inicializar Sincronización Realtime con Supabase
  useCloudSync();

  // Cloud Auth Session + Realtime Subscriptions
  const { cloudSession, checkingSession, showPasswordRecovery, setShowPasswordRecovery, setCloudSession, isVersionObsolete, currentVersion, requiredVersion } = useAppInit();

  // PWA Install Prompt
  const { installPrompt, showIOSInstall, setShowIOSInstall, showIOSButton, handleInstall, dismissIOSInstall } = useInstallPrompt();

  // Admin Panel States
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showTester, setShowTester] = useState(false);
  const [showTableTester, setShowTableTester] = useState(false);
  const adminClicksRef = useRef({ count: 0, lastTime: 0 });

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  const { rates } = useRates();
  const { deviceId } = useSecurity();
  const { isOnline, cacheRates } = useOfflineQueue();
  useAutoBackup(false, false, deviceId);
  useAutoLock(); // Auto-lock for ADMINs
  useGlobalTableAlerts(); // Global timer alerts across all views + broadcast to all devices

  // Purge old audit log entries on startup
  useEffect(() => { purgeOldEntries(); }, []);

  // Cache rates whenever they update
  useEffect(() => { if (rates) cacheRates(rates); }, [rates, cacheRates]);

  // Theme
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved;
      return 'light'; // Forced light mode by default for Bodega
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('theme', theme);

    // Update theme-color meta for mobile browsers
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0f172a' : '#f8fafc');
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  // Haptic
  const triggerHaptic = () => {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(10);
    }
  };

  // Admin Panel Logic (Hidden — 10 clicks on logo in Dashboard)
  const handleLogoClick = () => {
    const now = Date.now();
    const ref = adminClicksRef.current;
    if (now - ref.lastTime > 3000) {
      ref.count = 1;
    } else {
      ref.count += 1;
    }
    ref.lastTime = now;

    if (ref.count >= 10) {
      ref.count = 0;
      setShowAdminPanel(true);
      triggerHaptic();
    }
  };

  // Keyboard detection
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const baseHeight = useRef(0);

  useEffect(() => {
    if (!window.visualViewport) return;
    if (!baseHeight.current) baseHeight.current = window.visualViewport.height;

    const handleViewport = () => {
      setIsKeyboardOpen(window.visualViewport.height < baseHeight.current - 100);
    };
    const handleFocusBack = () => setTimeout(handleViewport, 300);

    window.visualViewport.addEventListener('resize', handleViewport);
    window.visualViewport.addEventListener('scroll', handleViewport);
    window.addEventListener('focusin', handleFocusBack);
    window.addEventListener('focusout', handleFocusBack);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewport);
      window.visualViewport?.removeEventListener('scroll', handleViewport);
      window.removeEventListener('focusin', handleFocusBack);
      window.removeEventListener('focusout', handleFocusBack);
    };
  }, []);

  // === Auth Local via PIN ===
  const { isAuthenticated, role } = useAuthStore();

  // ── T&C — el tour no debe dispararse hasta que el usuario acepte ───────────
  const [termsAccepted, setTermsAccepted] = useState(
      () => localStorage.getItem('pda_terms_accepted_v1') === 'true'
  );

  const confirm = useConfirm();

  // ── Permisos de cajero (reactivo a cambios del cloud sync) ──
  const [cajeroVeMesas, setCajeroVeMesas] = useState(
    () => localStorage.getItem('cajero_puede_ver_mesas') === 'true'
  );
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'cajero_puede_ver_mesas') {
        setCajeroVeMesas(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const ALL_TABS = [
    { id: 'inicio', label: 'Inicio', icon: Home },
    { id: 'mesas', label: 'Mesas', icon: Layers, hiddenForCajero: true },
    { id: 'ventas', label: 'Vender', icon: ShoppingCart, hiddenForMesero: true },
    { id: 'catalogo', label: 'Inventario', icon: Store, adminOnly: true },
    { id: 'clientes', label: 'Cuentas', icon: Users, adminOrCashier: true },
    { id: 'reportes', label: 'Reportes', icon: BarChart3, adminOnly: true },
    { id: 'ajustes', label: 'Config.', icon: Settings, adminOnly: true },
  ];

  const TABS = role === 'ADMIN' ? ALL_TABS :
               role === 'CAJERO' ? ALL_TABS.filter(t => !t.adminOnly && (!t.hiddenForCajero || (t.id === 'mesas' && cajeroVeMesas))) :
               ALL_TABS.filter(t => !t.adminOnly && !t.adminOrCashier && !t.hiddenForMesero);

  // Auto-redirect CAJERO away from mesas unless they have permission
  const effectiveTab = useMemo(() => {
    if (role === 'CAJERO' && activeTab === 'mesas' && !cajeroVeMesas) return 'ventas';
    return activeTab;
  }, [role, activeTab, cajeroVeMesas]);

  // Global Hard Gate: Loading State
  if (isVersionObsolete) {
    return <AppVersionLock currentVersion={currentVersion} requiredVersion={requiredVersion} />;
  }

  if (checkingSession) {
    return (
      <div className="h-[100dvh] w-full bg-[#F8FAFC] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-[#D97706] border-t-transparent animate-spin" />
      </div>
    );
  }

  // Password Recovery Flow — triggered by clicking the reset link in the email
  if (showPasswordRecovery) {
    return (
      <ResetPasswordView onDone={() => {
        setShowPasswordRecovery(false);
        setCloudSession(null);
      }} />
    );
  }

  // Global Hard Gate: Must have Cloud Session
  if (!cloudSession) {
    return <CloudAuthModal forceLogin={true} />;
  }

  // Local Guard: Require PIN login for operators
  if (!isAuthenticated) return <LoginScreen />;

  return (
    <div className="font-sans antialiased bg-[#F8FAFC] h-[100dvh] flex flex-col overflow-clip">

      {/* Terms and Conditions Overlay (First Use) */}
      <TermsOverlay onAccept={() => setTermsAccepted(true)} />



      {/* Offline Banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-[200] flex justify-center pt-[env(safe-area-inset-top)]">
          <div className="mt-2 px-4 py-2 bg-slate-900/95 backdrop-blur-md rounded-full border border-red-500/30 shadow-xl flex items-center gap-2 animate-in slide-in-from-top-4">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <WifiOff size={14} className="text-red-400" />
            <span className="text-xs font-bold text-white">Sin conexión · Modo offline</span>
          </div>
        </div>
      )}



      {/* Golden Tester View Overlay */}
      {showTester && (
        <Suspense fallback={<div className="fixed inset-0 z-[150] bg-[#F8FAFC] flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-[#D97706] border-t-transparent animate-spin" /></div>}>
          <div className="fixed inset-0 z-[150] bg-[#F8FAFC]">
            <TesterView onBack={() => setShowTester(false)} />
          </div>
        </Suspense>
      )}

      {showTableTester && (
        <Suspense fallback={<div className="fixed inset-0 z-[150] bg-slate-950 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-sky-500 border-t-transparent animate-spin" /></div>}>
          <div className="fixed inset-0 z-[150] bg-slate-950 overflow-y-auto">
            <TableFlowTesterView onBack={() => setShowTableTester(false)} />
          </div>
        </Suspense>
      )}


      <CartProvider>
      <ProductProvider rates={rates}>
        <main className={`flex-1 min-h-0 w-full max-w-md sm:max-w-xl md:max-w-3xl lg:max-w-5xl xl:max-w-7xl 2xl:max-w-none px-2 sm:px-4 lg:px-6 mx-auto relative ${isKeyboardOpen ? 'pb-4' : 'pb-24'} flex flex-col overflow-y-auto`}>

          {/* Admin panel trigger moved to DashboardView logo */}

        {/* Eager views — always mounted, visibility toggled via CSS */}
        <div className={`flex-1 min-h-0 flex flex-col ${effectiveTab === 'ventas' ? '' : 'hidden'}`}>
          <ErrorBoundary>
            <AnyStaffRoute>
              <SalesView rates={rates} triggerHaptic={triggerHaptic} onNavigate={setActiveTab} isActive={effectiveTab === 'ventas'} />
            </AnyStaffRoute>
          </ErrorBoundary>
        </div>

        <div className={`flex-1 flex flex-col ${effectiveTab === 'catalogo' ? '' : 'hidden'}`}>
          <ErrorBoundary>
            <AdminRoute>
              <ProductsView rates={rates} triggerHaptic={triggerHaptic} />
            </AdminRoute>
          </ErrorBoundary>
        </div>

        <div className={`flex-1 flex flex-col ${effectiveTab === 'inicio' ? '' : 'hidden'}`}>
          <ErrorBoundary>
            <AnyStaffRoute>
              <DashboardView rates={rates} triggerHaptic={triggerHaptic} onNavigate={setActiveTab} theme={theme} toggleTheme={toggleTheme} isActive={effectiveTab === 'inicio'} onLogoClick={handleLogoClick} />
            </AnyStaffRoute>
          </ErrorBoundary>
        </div>

        {/* Mesas de Pool / Cola de Cobros */}
        <div className={`flex-1 flex flex-col ${effectiveTab === 'mesas' ? '' : 'hidden'}`}>
          <ErrorBoundary>
            <AnyStaffRoute>
              <TablesView triggerHaptic={triggerHaptic} isActive={effectiveTab === 'mesas'} />
            </AnyStaffRoute>
          </ErrorBoundary>
        </div>

        {/* Lazy views — mount on first access, then stay persistent */}
        <Suspense fallback={<div className="flex-1 p-4 space-y-4"><div className="skeleton h-10 w-40" /><div className="skeleton h-32" /><div className="skeleton h-48" /></div>}>
          {(effectiveTab === 'clientes' || document.querySelector('[data-view="clientes"]')) && (
            <div data-view="clientes" className={`flex-1 flex flex-col ${effectiveTab === 'clientes' ? '' : 'hidden'}`}>
              <ErrorBoundary>
                <CashierRoute>
                  <CustomersView triggerHaptic={triggerHaptic} rates={rates} isActive={effectiveTab === 'clientes'} />
                </CashierRoute>
              </ErrorBoundary>
            </div>
          )}
          {(effectiveTab === 'reportes' || document.querySelector('[data-view="reportes"]')) && (
            <div data-view="reportes" className={`flex-1 flex flex-col ${effectiveTab === 'reportes' ? '' : 'hidden'}`}>
              <ErrorBoundary>
                <AdminRoute>
                  <ReportsView rates={rates} triggerHaptic={triggerHaptic} onNavigate={setActiveTab} isActive={effectiveTab === 'reportes'} />
                </AdminRoute>
              </ErrorBoundary>
            </div>
          )}
        </Suspense>

        {/* Settings — mounted as tab inside providers */}
        <div className={`flex-1 flex flex-col min-h-0 ${effectiveTab === 'ajustes' ? '' : 'hidden'}`}>
          <ErrorBoundary>
            <AdminRoute>
              <SettingsView
                onClose={() => setActiveTab('inicio')}
                theme={theme}
                toggleTheme={toggleTheme}
                triggerHaptic={triggerHaptic}
              />
            </AdminRoute>
          </ErrorBoundary>
        </div>

      </main>

      </ProductProvider>
      </CartProvider>
      
      <CommandPalette 
          isOpen={isCommandPaletteOpen} 
          onClose={() => setIsCommandPaletteOpen(false)} 
          onToggle={() => setIsCommandPaletteOpen(p => !p)} 
          navigateTo={setActiveTab} 
      />

      {/* Bottom Nav — hidden in POS mode for full-screen selling */}
      {!isKeyboardOpen && (
        <div className="fixed bottom-0 left-0 right-0 px-4 sm:px-6 pb-[env(safe-area-inset-bottom)] pt-0 mb-4 max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl mx-auto z-30 pointer-events-none animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-[#1E293B]/95 backdrop-blur-xl rounded-2xl p-1 flex justify-between items-center shadow-2xl shadow-slate-900/30 border border-white/10 ring-1 ring-black/5 pointer-events-auto">
            {TABS.map(tab => (
              <TabButton
                key={tab.id}
                icon={<tab.icon size={18} strokeWidth={effectiveTab === tab.id ? 3 : 2} />}
                label={tab.label}
                isActive={effectiveTab === tab.id}
                onClick={() => { triggerHaptic(); setActiveTab(tab.id); }}
                data-tour={`tab-${tab.id}`}
              />
            ))}

            {installPrompt && effectiveTab === 'inicio' && (
              <button onClick={() => { triggerHaptic(); handleInstall(); }} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl transition-all duration-300 bg-brand text-white shadow-md animate-pulse">
                <Download size={20} strokeWidth={3} />
              </button>
            )}

            {/* iOS: botón manual de instalación */}
            {!installPrompt && showIOSButton && effectiveTab === 'inicio' && (
              <button onClick={() => { triggerHaptic(); setShowIOSInstall(true); }} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl transition-all duration-300 bg-brand text-white shadow-md animate-pulse">
                <Download size={20} strokeWidth={3} />
              </button>
            )}


          </div>
        </div>
      )}

      {/* iOS Install Instructions Modal */}
      {showIOSInstall && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-end justify-center p-0 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-t-[2rem] p-6 shadow-2xl animate-in slide-in-from-bottom-10 duration-200">
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="text-lg font-black text-slate-800 dark:text-white">Instalar App</h3>
                <p className="text-xs text-slate-400 mt-1">Sigue estos pasos en Safari</p>
              </div>
              <button onClick={dismissIOSInstall} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center shrink-0 text-blue-600 font-bold text-sm">1</div>
                <p className="text-sm text-slate-600 dark:text-slate-300">Toca el botón <strong>Compartir</strong> <span className="inline-block w-5 h-5 align-middle">⬆️</span> en la barra de Safari</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center shrink-0 text-blue-600 font-bold text-sm">2</div>
                <p className="text-sm text-slate-600 dark:text-slate-300">Busca y toca <strong>"Agregar a la pantalla de inicio"</strong></p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center shrink-0 text-emerald-600 font-bold text-sm">✓</div>
                <p className="text-sm text-slate-600 dark:text-slate-300">¡Pool Imperial! La app aparecerá como un ícono en tu teléfono</p>
              </div>
            </div>
            <button onClick={dismissIOSInstall} className="w-full mt-6 py-3 bg-brand text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform">
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Admin Panel Modal */}
      {showAdminPanel && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-slate-700 w-full max-w-sm rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <FlaskConical className="text-[#D97706]" /> Panel Dev
              </h2>
              <button onClick={() => setShowAdminPanel(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <button
              onClick={() => { triggerHaptic(); setShowTester(true); setShowAdminPanel(false); }}
              className="w-full bg-[#D97706] hover:bg-[#B45309] text-white font-bold py-3 rounded-lg text-sm uppercase tracking-wider transition-colors"
            >
              🚀 Abrir Tester
            </button>
            <button
              onClick={() => { triggerHaptic(); setShowTableTester(true); setShowAdminPanel(false); }}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg text-sm uppercase tracking-wider transition-colors mt-2"
            >
              🎱 Tester de Mesas
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

function TabButton({ icon, label, isActive, onClick, 'data-tour': dataTour }) {
  return (
    <button data-tour={dataTour} onClick={onClick} className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl transition-all duration-300 ${isActive ? 'bg-[#D97706] text-white shadow-md shadow-amber-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
      {icon}
      {isActive && <span className="text-[9px] font-extrabold animate-in zoom-in duration-200">{label}</span>}
    </button>
  );
}
