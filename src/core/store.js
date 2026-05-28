import { create } from 'zustand';
import { tenantConfig } from '../config/tenant';

// Store Core que todas las apps utilizarán
export const useAppStore = create((set) => ({
    // Theme global (Dictado por config/tenant.js)
    theme: tenantConfig.themeMode,
    tenantFeatures: tenantConfig.features,

    // Auth (Para usuarios y clientes)
    user: null,
    setUser: (user) => set({ user }),

    // Carrito de compras / Comanda
    cart: [],
    addToCart: (item) => set((state) => ({ cart: [...state.cart, item] })),
    clearCart: () => set({ cart: [] }),
}));
