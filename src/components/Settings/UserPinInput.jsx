import React from 'react';
import { Shield, ShoppingCart, Coffee } from 'lucide-react';

export const ROLE_CONFIG = {
    ADMIN: {
        label: 'Administrador',
        gradient: 'from-indigo-500 to-purple-500',
        bg: 'bg-indigo-50 dark:bg-indigo-900/20',
        text: 'text-indigo-600 dark:text-indigo-400',
        border: 'border-indigo-200 dark:border-indigo-800/40',
        icon: Shield,
    },
    CAJERO: {
        label: 'Cajero',
        gradient: 'from-emerald-500 to-teal-500',
        bg: 'bg-emerald-50 dark:bg-emerald-900/20',
        text: 'text-emerald-600 dark:text-emerald-400',
        border: 'border-emerald-200 dark:border-emerald-800/40',
        icon: ShoppingCart,
    },
    MESERO: {
        label: 'Mesero',
        gradient: 'from-orange-400 to-amber-500',
        bg: 'bg-orange-50 dark:bg-orange-900/20',
        text: 'text-orange-600 dark:text-orange-400',
        border: 'border-orange-200 dark:border-orange-800/40',
        icon: Coffee,
    },
    BARRA: {
        label: 'Barra',
        gradient: 'from-violet-400 to-purple-500',
        bg: 'bg-violet-50 dark:bg-violet-900/20',
        text: 'text-violet-600 dark:text-violet-400',
        border: 'border-violet-200 dark:border-violet-800/40',
        icon: Coffee,
    }
};

export function PinInput({ value, onChange, label, length = 4 }) {
    const digits = (value || '').padEnd(length, '').slice(0, length).split('');

    const handleChange = (index, digit) => {
        if (!/^\d?$/.test(digit)) return;
        const newDigits = [...digits];
        newDigits[index] = digit;
        onChange(newDigits.join('').replace(/ /g, ''));

        // Auto-focus next
        if (digit && index < length - 1) {
            const next = document.getElementById(`pin-${label}-${index + 1}`);
            next?.focus();
        }
    };

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !digits[index] && index > 0) {
            const prev = document.getElementById(`pin-${label}-${index - 1}`);
            prev?.focus();
        }
    };

    return (
        <div className={`flex justify-center ${length > 4 ? 'gap-1.5' : 'gap-3'}`}>
            {Array.from({ length }).map((_, i) => (
                <input
                    key={i}
                    id={`pin-${label}-${i}`}
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    autoComplete="off"
                    autoCorrect="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    value={digits[i]?.trim() || ''}
                    onChange={e => handleChange(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    className={`${length > 4 ? 'w-[38px] h-12 text-lg' : 'w-11 h-14 text-xl'} text-center font-black bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 outline-none text-slate-800 dark:text-white transition-all`}
                    style={{ WebkitTextSecurity: 'disc', textSecurity: 'disc' }}
                />
            ))}
        </div>
    );
}
