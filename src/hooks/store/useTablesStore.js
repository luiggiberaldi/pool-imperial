import { create } from 'zustand';
import localforage from 'localforage';
import { scopedKey } from './accountScope';
import { createSyncActions } from './tableSyncActions';
import { createSessionActions } from './tableSessionActions';
import { createBillingActions } from './tableBillingActions';
import { createRealtimeActions } from './tableRealtimeActions';

const tablesCache = localforage.createInstance({
    name: "PoolLosDiaz",
    storeName: "tables_cache"
});

export const useTablesStore = create((set, get) => ({
    tables: [],
    activeSessions: [],
    paidHoursOffsets: {},
    paidRoundsOffsets: {},
    paidElapsedOffsets: {},
    pausedSessions: {},
    loading: true,
    realtimeChannel: null,
    _onlineHandler: null,

    config: {
        pricePerHour: 5,
        pricePerHourBs: 0,
        pricePina: 2,
        pricePinaBs: 0,
    },

    // Compose slices
    ...createSyncActions(set, get, tablesCache, scopedKey),
    ...createSessionActions(set, get, tablesCache, scopedKey),
    ...createBillingActions(set, get, tablesCache, scopedKey),
    ...createRealtimeActions(set, get, tablesCache, scopedKey),
}));

// Initialize
useTablesStore.getState().init();
