import React from 'react';

const AVATAR_COLORS = {
  ADMIN: { 
    bg: 'bg-gradient-to-b from-sky-400 to-sky-500 border-t-2 border-sky-300 shadow-[0_6px_0_#0284c7,_0_12px_25px_rgba(14,165,233,0.4)]', 
    text: 'text-white font-black' 
  },
  CAJERO: { 
    bg: 'bg-gradient-to-b from-teal-400 to-teal-500 border-t-2 border-teal-300 shadow-[0_6px_0_#0f766e,_0_12px_25px_rgba(20,184,166,0.4)]', 
    text: 'text-white font-black' 
  },
  MESERO: {
    bg: 'bg-gradient-to-b from-orange-400 to-orange-500 border-t-2 border-orange-300 shadow-[0_6px_0_#c2410c,_0_12px_25px_rgba(249,115,22,0.4)]',
    text: 'text-white font-black'
  },
  BARRA: {
    bg: 'bg-gradient-to-b from-violet-400 to-violet-500 border-t-2 border-violet-300 shadow-[0_6px_0_#6d28d9,_0_12px_25px_rgba(139,92,246,0.4)]',
    text: 'text-white font-black'
  },
};

export default function LoginAvatar({ user, size = 'lg', className = '' }) {
  const role = user?.role || user?.rol || 'CAJERO';
  const name = user?.name || user?.nombre || 'U';
  const initial = name.charAt(0).toUpperCase();
  const colors = AVATAR_COLORS[role] || AVATAR_COLORS.CAJERO;
  const sizeClasses = size === 'lg' ? 'w-24 h-24 sm:w-28 sm:h-28 text-4xl sm:text-5xl' : 'w-10 h-10 text-base';

  return (
    <div className={`${sizeClasses} rounded-[1.25rem] sm:rounded-[1.5rem] ${colors.bg} flex items-center justify-center ${colors.text} select-none transition-all ${className}`}>
      {initial}
    </div>
  );
}
