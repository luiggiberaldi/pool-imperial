import { supabaseCloud } from '../../config/supabaseCloud';
import { logEvent } from '../../services/auditService';
import { useAuthStore } from './authStore';

const getUser = () => useAuthStore.getState().currentUser;
const getAuthUserId = async () => {
    try {
        const { data: { session } } = await supabaseCloud.auth.getSession();
        return session?.user?.id || null;
    } catch { return null; }
};

const sortTables = (tables) => {
    if (!tables) return [];
    return [...tables].sort((a, b) => {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
};

export const createSyncActions = (set, get, tablesCache, scopedKey) => ({
    init: async () => {
        set({ loading: true });
        try {
            const cachedConfig = await tablesCache.getItem(scopedKey('pool_config'));
            if (cachedConfig) {
                // Use cached values directly — don't Math.max with localStorage
                // (that prevented saving 0 Bs prices from ever taking effect)
                const hourBs = cachedConfig.pricePerHourBs ?? (parseFloat(localStorage.getItem('pool_price_per_hour_bs')) || 0);
                const pinaBs = cachedConfig.pricePinaBs ?? (parseFloat(localStorage.getItem('pool_price_pina_bs')) || 0);
                cachedConfig.pricePerHourBs = hourBs;
                cachedConfig.pricePinaBs = pinaBs;
                set({ config: cachedConfig });
                localStorage.setItem('pool_price_per_hour_bs', String(hourBs));
                localStorage.setItem('pool_price_pina_bs', String(pinaBs));
            }

            const cachedTables = await tablesCache.getItem(scopedKey('tables')) || [];
            const cachedSessions = await tablesCache.getItem(scopedKey('active_sessions')) || [];
            const cachedOffsets = await tablesCache.getItem(scopedKey('paid_hours_offsets')) || {};
            const cachedRoundsOffsets = await tablesCache.getItem(scopedKey('paid_rounds_offsets')) || {};
            const cachedElapsedOffsets = await tablesCache.getItem(scopedKey('paid_elapsed_offsets')) || {};

            set({
                tables: sortTables(cachedTables),
                activeSessions: cachedSessions,
                paidHoursOffsets: cachedOffsets,
                paidRoundsOffsets: cachedRoundsOffsets,
                paidElapsedOffsets: cachedElapsedOffsets,
                loading: false
            });

            await get().processPendingActions();
            get().syncTablesAndSessions();

            if (typeof window !== 'undefined') {
                const handler = () => get().processPendingActions();
                window.addEventListener('online', handler);
                set({ _onlineHandler: handler });

                const priceHandler = (e) => {
                    if (e.key === 'pool_price_per_hour_bs' || e.key === 'pool_price_pina_bs') {
                        const val = parseFloat(e.newValue) || 0;
                        const cfg = { ...get().config };
                        if (e.key === 'pool_price_per_hour_bs') cfg.pricePerHourBs = val;
                        if (e.key === 'pool_price_pina_bs') cfg.pricePinaBs = val;
                        set({ config: cfg });
                        tablesCache.setItem(scopedKey('pool_config'), cfg);
                    }
                };
                window.addEventListener('storage', priceHandler);
            }
        } catch (error) {
            console.error('Error in useTablesStore init:', error);
            set({ loading: false });
        }
    },

    addPendingAction: async (action) => {
        const PENDING_KEY_BASE = 'pool_pending_table_actions';
        const pendingKey = scopedKey(PENDING_KEY_BASE);
        const queue = await tablesCache.getItem(pendingKey) || [];
        const isDuplicate = (a, b) => a.type === b.type && a.sessionId === b.sessionId;
        const filtered = queue.filter(existing => !isDuplicate(existing, action));
        filtered.push({ ...action, id: Date.now(), timestamp: new Date().toISOString() });
        await tablesCache.setItem(pendingKey, filtered);
    },

    processPendingActions: async () => {
        const PENDING_KEY_BASE = 'pool_pending_table_actions';
        const pendingKey = scopedKey(PENDING_KEY_BASE);
        const queue = await tablesCache.getItem(pendingKey) || [];
        if (queue.length === 0) return;

        console.log(`[TablesSync] Procesando ${queue.length} acciones de mesa pendientes...`);
        const remainingQueue = [];

        for (const action of queue) {
            try {
                let success = false;
                if (action.type === 'OPEN_SESSION') {
                    const { error } = await supabaseCloud.from('table_sessions').insert(action.payload);
                    if (!error) success = true;
                } else if (action.type === 'UPDATE_SESSION') {
                    const { error } = await supabaseCloud.from('table_sessions').update(action.payload).eq('id', action.sessionId);
                    if (!error) success = true;
                } else if (action.type === 'CLOSE_SESSION') {
                    const { error } = await supabaseCloud.from('table_sessions').update(action.payload).eq('id', action.sessionId);
                    if (!error) success = true;
                }
                if (!success) remainingQueue.push(action);
            } catch (e) {
                remainingQueue.push(action);
            }
        }

        await tablesCache.setItem(pendingKey, remainingQueue);
        if (remainingQueue.length === 0) {
            get().syncTablesAndSessions();
        }
    },

    updateConfig: async (newConfig) => {
        const merged = { ...get().config, ...newConfig };
        set({ config: merged });
        await tablesCache.setItem(scopedKey('pool_config'), merged);

        if (merged.pricePerHourBs != null) localStorage.setItem('pool_price_per_hour_bs', String(merged.pricePerHourBs));
        if (merged.pricePinaBs != null) localStorage.setItem('pool_price_pina_bs', String(merged.pricePinaBs));

        try {
            const { error } = await supabaseCloud.from('pool_config').update({
                price_per_hour: merged.pricePerHour,
                price_per_hour_bs: merged.pricePerHourBs || 0,
                price_pina: merged.pricePina,
                price_pina_bs: merged.pricePinaBs || 0,
                updated_at: new Date().toISOString()
            }).eq('id', 1);
            if (error && error.message?.includes('column')) {
                await supabaseCloud.from('pool_config').update({
                    price_per_hour: merged.pricePerHour,
                    price_pina: merged.pricePina,
                    updated_at: new Date().toISOString()
                }).eq('id', 1);
            }
        } catch (e) {
            console.error('Error updating config in cloud', e);
        }
    },

    syncTablesAndSessions: async () => {
        try {
            const userId = await getAuthUserId();

            let tablesQuery = supabaseCloud.from('tables').select('*').eq('active', true).order('name', { ascending: true });
            if (userId) tablesQuery = tablesQuery.eq('user_id', userId);
            const { data: tablesData, error: tablesError } = await tablesQuery;
            if (tablesError) throw tablesError;

            let sessionsQuery = supabaseCloud.from('table_sessions').select('*').in('status', ['ACTIVE', 'CHECKOUT']);
            if (userId) sessionsQuery = sessionsQuery.eq('user_id', userId);
            const { data: sessionsData, error: sessionsError } = await sessionsQuery;
            if (sessionsError) throw sessionsError;

            let configQuery = supabaseCloud.from('pool_config').select('*').eq('id', 1);
            if (userId) configQuery = configQuery.eq('user_id', userId);
            const { data: configData, error: configError } = await configQuery.maybeSingle();

            if (!configError && configData) {
                // Prefer cloud values, even if 0 (use ?? instead of || to respect 0)
                const cloudHourBs = configData.price_per_hour_bs != null ? Number(configData.price_per_hour_bs) : null;
                const cloudPinaBs = configData.price_pina_bs != null ? Number(configData.price_pina_bs) : null;
                const cloudConfig = {
                    pricePerHour: Number(configData.price_per_hour) || get().config.pricePerHour,
                    pricePerHourBs: cloudHourBs ?? get().config.pricePerHourBs ?? 0,
                    pricePina: Number(configData.price_pina) || get().config.pricePina,
                    pricePinaBs: cloudPinaBs ?? get().config.pricePinaBs ?? 0,
                };
                set({ config: cloudConfig });
                await tablesCache.setItem(scopedKey('pool_config'), cloudConfig);
            }

            const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
            const mergedSessions = sessionsData.map(s =>
                paidCache[s.id] ? { ...s, paid_at: paidCache[s.id] } : s
            );

            const finalTables = sortTables(tablesData);
            set({ tables: finalTables, activeSessions: mergedSessions });
            await tablesCache.setItem(scopedKey('tables'), finalTables);
            await tablesCache.setItem(scopedKey('active_sessions'), mergedSessions);

            const offsetCache = await tablesCache.getItem(scopedKey('paid_hours_offsets')) || {};
            const roundsOffsetCache = await tablesCache.getItem(scopedKey('paid_rounds_offsets')) || {};
            set({ paidHoursOffsets: offsetCache, paidRoundsOffsets: roundsOffsetCache });
        } catch (error) {
            console.warn('Sync cloud fallido (Modo Offline activo):', error.message);
        }
    },

    // --- ADMINISTRACIÓN DE MESAS ---
    addTable: async (name, type = 'POOL') => {
        const userId = await getAuthUserId();
        const insertPayload = { name, type, status: 'libre', active: true };
        if (userId) insertPayload.user_id = userId;
        const { data, error } = await supabaseCloud.from('tables').insert([insertPayload]).select().single();
        if (error) throw error;
        set(state => ({ tables: sortTables([...state.tables, data]) }));
        await tablesCache.setItem(scopedKey('tables'), get().tables);
        logEvent('MESAS', 'MESA_CREADA', `Mesa "${name}" creada (${type})`, getUser(), { tableId: data.id, name, type });
        return data;
    },

    updateTable: async (id, updates) => {
        set(state => ({ tables: sortTables(state.tables.map(t => t.id === id ? { ...t, ...updates } : t)) }));
        await tablesCache.setItem(scopedKey('tables'), get().tables);
        try {
            const { error } = await supabaseCloud.from('tables').update(updates).eq('id', id);
            if (error) throw error;
        } catch (e) { console.error('Update table cloud fail:', e); }
    },

    deleteTable: async (id) => {
        const tableName = get().tables.find(t => t.id === id)?.name ?? id;
        set(state => ({ tables: state.tables.filter(t => t.id !== id) }));
        await tablesCache.setItem(scopedKey('tables'), get().tables);
        logEvent('MESAS', 'MESA_ELIMINADA', `Mesa "${tableName}" eliminada`, getUser(), { tableId: id });
        const { error } = await supabaseCloud.from('tables').update({ active: false }).eq('id', id);
        if (error) {
            await get().syncTablesAndSessions();
            throw error;
        }
    },
});
