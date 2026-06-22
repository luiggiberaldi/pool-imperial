import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export const Modal = ({ isOpen, onClose, title, children, className = '', maxWidthClass = 'max-w-sm md:max-w-md' }) => {
  const mountTimeRef = React.useRef(0);

  React.useEffect(() => {
    if (isOpen) {
      mountTimeRef.current = Date.now();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleContentClickCapture = (e) => {
    // Ignore clicks inside the modal content in the first 350ms to prevent ghost clicks
    if (Date.now() - mountTimeRef.current < 350) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return createPortal(
    // ✅ z-[100] asegura que esté por encima de la barra de navegación (z-30)
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      
      {/* Backdrop con desenfoque */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
        onClick={(e) => {
          // Evitar que elementos desmontados del DOM (ej. botones internos que cambian estado) gatillen el cierre al caer el clic en el backdrop
          if (e.target && !document.body.contains(e.target)) {
            console.log("%c[SNIPER: Clic en backdrop de Modal ignorado porque el elemento original se desmontó del DOM]", "color: #ef4444; font-weight: bold;");
            return;
          }
          if (e.target !== e.currentTarget) return;
          if (Date.now() - mountTimeRef.current < 350) return;
          onClose();
        }}
      />
      
      {/* Contenido del Modal */}
      <div 
        onClickCapture={handleContentClickCapture}
        className={`relative bg-white dark:bg-slate-900 w-full ${maxWidthClass} rounded-[2rem] shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200 transition-all ${className}`}
      >
        
        {/* Cabecera */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <h3 className="font-black text-slate-800 dark:text-white text-lg tracking-tight">{title}</h3>
          <button 
            onClick={onClose}
            className="p-1.5 bg-slate-200 dark:bg-slate-700 rounded-full text-slate-500 hover:text-red-500 transition-colors"
          >
            <X size={16} strokeWidth={3} />
          </button>
        </div>

        {/* Body con Scroll Mejorado */}
        <div className="p-6 max-h-[85vh] overflow-y-auto custom-scrollbar pb-10">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

