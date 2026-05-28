import { create } from 'zustand';
import { storageService } from '../../utils/storageService';

const STORAGE_KEY = 'bodega_customers_v1';

export const useCustomersStore = create((set, get) => ({
    customers: [],
    loading: false,
    fetched: false,

    fetchCustomers: async () => {
        if (get().fetched || get().loading) return;
        set({ loading: true });
        try {
            const customers = await storageService.getItem(STORAGE_KEY, []);
            set({ customers: customers || [], loading: false, fetched: true });
        } catch {
            set({ loading: false, fetched: true });
        }
    },

    createCustomer: async (name, phone = '', documentId = '') => {
        const newCustomer = {
            id: `pool_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: name.trim(),
            phone: phone.trim() || null,
            documentId: documentId.trim() || null,
            deuda: 0,
            createdAt: new Date().toISOString(),
        };
        const updated = [...get().customers, newCustomer]
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        await storageService.setItem(STORAGE_KEY, updated);
        set({ customers: updated });
        return newCustomer;
    },

    // Refresca desde storage (útil después de que CustomersView crea un cliente)
    refresh: async () => {
        try {
            const customers = await storageService.getItem(STORAGE_KEY, []);
            set({ customers: customers || [], fetched: true });
        } catch {}
    },
}));
