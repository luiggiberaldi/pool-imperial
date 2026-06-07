import React from 'react';
import { Printer, Monitor, Info, ShieldAlert, Laptop, Play } from 'lucide-react';
import { SectionCard } from '../SettingsShared';

export default function WebSerialPanel() {
    return (
        <SectionCard 
            icon={Printer} 
            title="Impresora" 
            subtitle="Diálogo de impresión estándar del sistema" 
            iconColor="text-indigo-500"
        >
            <div className="space-y-4">
                {/* Status Header */}
                <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/40 rounded-2xl p-4 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <Monitor size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="text-sm font-black text-slate-800 dark:text-white">Impresora del Sistema Activa</h4>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                Recomendado
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                            Las facturas y pre-cuentas se abren mediante el diálogo de impresión estándar de tu navegador. Compatible con USB, Bluetooth, Wi-Fi y cualquier impresora instalada en tu sistema.
                        </p>
                    </div>
                </div>

                {/* Bluetooth Protection Alert */}
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30 rounded-xl p-3 flex gap-2.5">
                    <div className="text-emerald-600 dark:text-emerald-500 mt-0.5">
                        <ShieldAlert size={15} />
                    </div>
                    <p className="text-[10px] text-emerald-800 dark:text-emerald-400 leading-relaxed font-semibold">
                        Protección activa: El escaneo directo de puertos de hardware (Web Serial) ha sido desactivado para evitar interferencias, desconexiones o ruidos en tus auriculares, ratones y teclados Bluetooth.
                    </p>
                </div>

                {/* Guide 1: Kiosk Mode */}
                <div className="border border-slate-100 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <Laptop size={16} className="text-slate-400" />
                        <h5 className="text-xs font-black text-slate-700 dark:text-slate-200">¿Cómo imprimir automáticamente (Modo Kiosco)?</h5>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Para omitir la pantalla de confirmación cada vez que imprimes una factura, puedes iniciar tu navegador en Modo Kiosco:
                    </p>
                    <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-3 space-y-2 text-[10px]">
                        <div className="flex gap-2">
                            <span className="font-bold text-indigo-500 shrink-0">1.</span>
                            <p className="text-slate-600 dark:text-slate-300">Establece tu ticketera como la <strong>impresora predeterminada</strong> en los ajustes de Windows/Mac.</p>
                        </div>
                        <div className="flex gap-2">
                            <span className="font-bold text-indigo-500 shrink-0">2.</span>
                            <p className="text-slate-600 dark:text-slate-300">Cierra tu navegador. Haz clic derecho en su acceso directo y selecciona <strong>Propiedades</strong>.</p>
                        </div>
                        <div className="flex gap-2">
                            <span className="font-bold text-indigo-500 shrink-0">3.</span>
                            <div className="text-slate-600 dark:text-slate-300">
                                En el campo <strong>Destino</strong>, agrega un espacio al final de las comillas y escribe:
                                <code className="block mt-1 p-1 bg-slate-200 dark:bg-slate-800 rounded font-mono text-[9px] text-indigo-600 dark:text-indigo-400 select-all">--kiosk-printing</code>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <span className="font-bold text-indigo-500 shrink-0">4.</span>
                            <p className="text-slate-600 dark:text-slate-300">Guarda los cambios e inicia el navegador desde ese acceso directo. Las impresiones se enviarán directo al papel.</p>
                        </div>
                    </div>
                </div>

                {/* Guide 2: Cash Drawer */}
                <div className="border border-slate-100 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <Play size={16} className="text-slate-400 rotate-90" />
                        <h5 className="text-xs font-black text-slate-700 dark:text-slate-200">Apertura Automática de Cajón de Dinero</h5>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Dado que el sistema ahora utiliza la impresora del sistema operativo, la apertura del cajón monedero (RJ11) se configura en las propiedades del propio driver de la impresora:
                    </p>
                    <div className="bg-slate-50 dark:bg-slate-950 rounded-xl p-3 space-y-2 text-[10px] text-slate-600 dark:text-slate-300">
                        <p>1. Abre el <strong>Panel de Control</strong> en Windows y ve a <strong>Dispositivos e Impresoras</strong>.</p>
                        <p>2. Haz clic derecho sobre tu impresora y selecciona <strong>Propiedades de la impresora</strong>.</p>
                        <p>3. Ve a la pestaña **Configuración del Dispositivo** (o *Device Settings* / *Document Options*).</p>
                        <p>4. Busca la opción **Cajón de Dinero** (o *Cash Drawer* / *Peripheral Control*) y configúrala en: **"Abrir antes de imprimir"** (o *Open Before Printing*).</p>
                    </div>
                </div>
            </div>
        </SectionCard>
    );
}
