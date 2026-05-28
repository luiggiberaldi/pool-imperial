import React from 'react';
import { useAuthStore } from '../../hooks/store/authStore';
import { useCashStore } from '../../hooks/store/cashStore';
import { Lock } from 'lucide-react';

export function AdminRoute({ children }) {
    const { role } = useAuthStore();
    
    if (role !== 'ADMIN') {
        return <UnauthMessage message="Acceso restringido a Administradores." />;
    }
    
    return <>{children}</>;
}

export function CashierRoute({ children }) {
    const { role } = useAuthStore();
    const { activeCashSession } = useCashStore();
    const cajeroAbreCaja = localStorage.getItem('cajero_puede_abrir_caja') === 'true';

    if (role !== 'CAJERO' && role !== 'ADMIN') {
        return <UnauthMessage message="Acceso restringido a Cajeros y Administradores." />;
    }

    // Role is CAJERO or ADMIN. Admin can always pass.
    if (role === 'CAJERO' && !activeCashSession && !cajeroAbreCaja) {
        return <CashClosedLockScreen />;
    }

    return <>{children}</>;
}

export function AnyStaffRoute({ children }) {
    const { role } = useAuthStore();
    const { activeCashSession } = useCashStore();
    const cajeroAbreCaja = localStorage.getItem('cajero_puede_abrir_caja') === 'true';

    if (!role) {
        return <UnauthMessage message="Debe iniciar sesión." />;
    }

    // If role is CAJERO, MESERO or BARRA and NO box is open: Block them (unless cajero has open-caja permission).
    if (role !== 'ADMIN' && !activeCashSession && !(role === 'CAJERO' && cajeroAbreCaja)) {
         return <CashClosedLockScreen />;
    }

    return <>{children}</>;
}


// UI Components for guards
function UnauthMessage({ message }) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500">
            <Lock className="w-12 h-12 mb-4 text-slate-300" />
            <p className="text-lg font-medium">{message}</p>
        </div>
    );
}

function CashClosedLockScreen() {
    const { logout } = useAuthStore();
    
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl m-4 md:m-8">
            <Lock className="w-16 h-16 mb-4 text-slate-300" />
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Caja Cerrada</h2>
            <p className="text-slate-500 max-w-sm mb-8">
                El turno aún no ha sido abierto. Espera a que un administrador o cajero con permisos inicie la caja para comenzar a operar.
            </p>
            <button 
                onClick={() => logout()}
                className="px-6 py-2.5 bg-sky-50 text-sky-600 hover:bg-sky-100 rounded-xl font-semibold transition-colors border border-sky-100"
            >
                Volver al Login
            </button>
        </div>
    );
}
