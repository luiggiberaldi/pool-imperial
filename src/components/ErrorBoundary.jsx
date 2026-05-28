import React from 'react';
import { logEvent } from '../services/auditService';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, retried: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('🔴 App Error:', error, errorInfo);
    logEvent('SISTEMA', 'ERROR_RENDER', error?.message || 'Error de renderizado', null, {
      component: errorInfo?.componentStack?.split('\n')[1]?.trim() || 'unknown',
      message: error?.message,
    });

    // Auto-retry once after 800ms — resolves most race conditions silently
    if (!this.state.retried) {
      setTimeout(() => {
        this.setState({ hasError: false, error: null, retried: true });
      }, 800);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full bg-slate-50 dark:bg-slate-950 p-6">
          <div className="text-center max-w-sm">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-red-500 mb-2">Error de Carga</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Algo falló al mostrar esta sección. Puedes intentar de nuevo sin perder datos.
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="w-full px-6 py-3 bg-sky-500 text-white rounded-xl font-bold hover:bg-sky-600 transition-all mb-2"
            >
              Reintentar
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('calc_history');
                localStorage.removeItem('bodega_accounts_v2');
                window.location.reload();
              }}
              className="w-full px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-sm"
            >
              Limpiar y Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
