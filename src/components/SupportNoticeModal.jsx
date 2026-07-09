import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, MessageCircle, X, Clock } from 'lucide-react';

// ==========================================
// CONFIGURACIÓN DE ACTIVACIÓN / REMOCIÓN
// Para desactivar completamente este aviso, cambie ENABLED a false:
const ENABLED = true;
// Tiempo en minutos para que el aviso vuelva a salir (Frecuencia):
const COOLDOWN_MINUTES = 10; 
// ==========================================

export default function SupportNoticeModal() {
    if (!ENABLED) return null;

    const [isOpen, setIsOpen] = useState(false);
    const [timeLeft, setTimeLeft] = useState(25);

    // Revisar si ha pasado el tiempo desde el último cierre
    const checkVisibility = () => {
        const lastClosed = localStorage.getItem('support_notice_last_closed');
        if (!lastClosed) {
            // Primera vez que entra al sistema, se muestra
            setIsOpen(true);
            setTimeLeft(25);
            return;
        }

        const timePassed = Date.now() - parseInt(lastClosed, 10);
        const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;

        if (timePassed >= cooldownMs) {
            setIsOpen(true);
            setTimeLeft(25);
        }
    };

    // Al montar y en intervalo verificar si corresponde mostrarse
    useEffect(() => {
        checkVisibility();

        // Revisar cada 10 segundos si es momento de re-mostrar (si no está ya abierto)
        const checkInterval = setInterval(() => {
            if (!isOpen) {
                checkVisibility();
            }
        }, 10000);

        return () => clearInterval(checkInterval);
    }, [isOpen]);

    // Sincronización entre pestañas: cerrar el modal si se cierra en otra pestaña
    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === 'support_notice_last_closed') {
                setIsOpen(false);
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    // Manejar la cuenta regresiva del temporizador de 15 segundos
    useEffect(() => {
        if (!isOpen) return;
        setTimeLeft(25);
        const interval = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [isOpen]);

    const handleClose = () => {
        if (timeLeft > 0) return; // Bloqueado hasta culminar
        localStorage.setItem('support_notice_last_closed', Date.now().toString());
        setIsOpen(false);
    };

    if (!isOpen) return null;

    // Calcular el porcentaje para una barra de progreso sutil (opcional)
    const progressPercent = ((25 - timeLeft) / 25) * 100;

    return (
        <div className="fixed inset-0 z-[400] bg-slate-955/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-amber-500/30 rounded-[2rem] p-6 sm:p-8 max-w-md w-full shadow-2xl shadow-amber-955/20 text-center relative overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Glow de fondo */}
                <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />

                {/* Botón X de cerrar (habilitado solo tras 15 segundos) */}
                {timeLeft === 0 && (
                    <button 
                        onClick={handleClose} 
                        className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-white rounded-full bg-slate-800 hover:bg-slate-700 transition-colors"
                        aria-label="Cerrar aviso"
                    >
                        <X size={18} />
                    </button>
                )}

                {/* Icono de advertencia llamativo */}
                <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5 animate-pulse">
                    <AlertTriangle className="w-8 h-8 text-amber-500" />
                </div>

                {/* Título */}
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mb-3">
                    <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 bg-clip-text text-transparent">
                        ACCIÓN REQUERIDA
                    </span>
                </h2>

                {/* Mensaje principal */}
                <p className="text-slate-300 text-sm leading-relaxed mb-6">
                    Para garantizar la continuidad operativa de su sistema de gestión y evitar interrupciones o la suspensión del servicio, es indispensable que se comunique con nuestro equipo de soporte técnico dentro de las próximas <strong>72 horas</strong>.
                </p>

                {/* Enlace destacado del número de teléfono */}
                <a 
                    href="https://wa.me/584124051793?text=Hola,%20necesito%20soporte%20tecnico%20para%20continuar%20con%20el%20servicio%20de%20Pool%20Imperial"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-500/40 rounded-2xl p-4 mb-6 transition-all duration-300 group"
                >
                    <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block mb-1">
                        Soporte Técnico
                    </span>
                    <span className="text-2xl font-extrabold text-amber-400 block tracking-wide group-hover:text-amber-300 transition-colors">
                        +58 412-4051793
                    </span>
                    <span className="text-xs text-slate-400 mt-2 flex items-center justify-center gap-1.5">
                        <MessageCircle size={14} className="text-emerald-400" />
                        Toca aquí para enviar WhatsApp
                    </span>
                </a>

                {/* Sección del botón de cierre / temporizador */}
                {timeLeft > 0 ? (
                    <div className="space-y-3">
                        <button 
                            disabled 
                            className="w-full py-4 px-6 bg-slate-800 text-slate-500 border border-slate-700 rounded-xl font-bold text-sm cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <Clock size={16} className="animate-spin text-amber-500" />
                            Esperando validación ({timeLeft}s)
                        </button>
                        {/* Barra de progreso sutil */}
                        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-1000 ease-linear"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </div>
                ) : (
                    <button 
                        onClick={handleClose}
                        className="w-full py-4 px-6 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-black rounded-xl text-sm transition-all shadow-lg shadow-orange-955/20 border border-orange-500/20 active:scale-[0.98]"
                    >
                        Entendido, continuar al sistema
                    </button>
                )}

                <p className="text-[10px] text-slate-500 mt-4 leading-normal">
                    Si ya se comunicó con soporte y completó el proceso de verificación de su cuenta, este aviso será desactivado automáticamente en su próxima actualización.
                </p>
            </div>
        </div>
    );
}
