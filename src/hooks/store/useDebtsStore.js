import { create } from 'zustand';
import { supabaseCloud } from '../../config/supabaseCloud';

const getAuthUserId = async () => {
    try {
        const { data: { session } } = await supabaseCloud.auth.getSession();
        return session?.user?.id || null;
    } catch { return null; }
};

export const useDebtsStore = create((set, get) => ({
    debts: [],
    payments: {},   // { [debtId]: Payment[] }
    loading: false,
    fetched: false,

    fetchDebts: async () => {
        if (get().loading) return;
        set({ loading: true });
        try {
            const userId = await getAuthUserId();
            if (!userId) { set({ loading: false }); return; }

            const { data, error } = await supabaseCloud
                .from('staff_debts')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            set({ debts: data || [], loading: false, fetched: true });
        } catch (err) {
            console.error('fetchDebts error:', err);
            set({ loading: false, fetched: true });
        }
    },

    createDebt: async (staffId, concept, amountUsd, note = '') => {
        const userId = await getAuthUserId();
        if (!userId) return null;

        const payload = {
            staff_id: staffId,
            user_id: userId,
            concept: concept.trim(),
            amount_usd: amountUsd,
            remaining_usd: amountUsd,
            status: 'pending',
        };
        if (note && note.trim()) payload.note = note.trim();

        let { data, error } = await supabaseCloud
            .from('staff_debts')
            .insert(payload)
            .select()
            .single();

        // If 'note' column doesn't exist yet, retry without it
        if (error && payload.note) {
            const { note: _, ...payloadWithoutNote } = payload;
            const retry = await supabaseCloud.from('staff_debts').insert(payloadWithoutNote).select().single();
            data = retry.data;
            error = retry.error;
        }

        if (error) throw error;

        set({ debts: [data, ...get().debts] });
        return data;
    },

    fetchPayments: async (debtId) => {
        const { data, error } = await supabaseCloud
            .from('staff_debt_payments')
            .select('*')
            .eq('debt_id', debtId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        set({ payments: { ...get().payments, [debtId]: data || [] } });
        return data;
    },

    addPayment: async (debtId, amountUsd, note = '') => {
        // Insert payment
        const { data: payment, error: payErr } = await supabaseCloud
            .from('staff_debt_payments')
            .insert({ debt_id: debtId, amount_usd: amountUsd, note: note.trim() })
            .select()
            .single();

        if (payErr) throw payErr;

        // Update debt remaining
        const debt = get().debts.find(d => d.id === debtId);
        if (!debt) return;

        const newRemaining = Math.max(0, debt.remaining_usd - amountUsd);
        const newStatus = newRemaining <= 0 ? 'paid' : 'pending';

        const { error: updErr } = await supabaseCloud
            .from('staff_debts')
            .update({ remaining_usd: newRemaining, status: newStatus })
            .eq('id', debtId);

        if (updErr) throw updErr;

        // Update local state
        set({
            debts: get().debts.map(d =>
                d.id === debtId ? { ...d, remaining_usd: newRemaining, status: newStatus } : d
            ),
            payments: {
                ...get().payments,
                [debtId]: [payment, ...(get().payments[debtId] || [])],
            },
        });
    },

    deleteDebt: async (debtId) => {
        const { error } = await supabaseCloud
            .from('staff_debts')
            .delete()
            .eq('id', debtId);

        if (error) throw error;

        const { [debtId]: _, ...restPayments } = get().payments;
        set({
            debts: get().debts.filter(d => d.id !== debtId),
            payments: restPayments,
        });
    },

    getDebtsByStaff: (staffId) => {
        return get().debts.filter(d => d.staff_id === staffId);
    },

    getTotalByStaff: (staffId) => {
        return get().debts
            .filter(d => d.staff_id === staffId && d.status === 'pending')
            .reduce((sum, d) => sum + Number(d.remaining_usd), 0);
    },
}));
