import React, { useState, useRef } from 'react';
import { Check, FileText, ChevronDown } from 'lucide-react';

export default function TermsOverlay({ onAccept }) {
    const [hasAccepted, setHasAccepted] = useState(
        () => localStorage.getItem('pda_terms_accepted_v1') === 'true'
    );
    const [canAccept, setCanAccept] = useState(false);
    const scrollRef = useRef(null);

    const handleScroll = () => {
        const element = scrollRef.current;
        if (!element) return;
        const scrolledToBottom = Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight) < 10;
        if (scrolledToBottom && !canAccept) setCanAccept(true);
    };

    const handleAccept = () => {
        localStorage.setItem('pda_terms_accepted_v1', 'true');
        setHasAccepted(true);
        onAccept?.();
    };

    if (hasAccepted) return null;

    return (
        <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-500">

                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-500 rounded-xl">
                        <FileText size={24} className="text-white" strokeWidth={2.5} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-900 tracking-tight">Términos y Condiciones</h2>
                        <p className="text-xs text-slate-500 font-medium">Por favor, lee y acepta para continuar</p>
                    </div>
                </div>

                {/* Scroll Indicator */}
                {!canAccept && (
                    <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2 animate-pulse">
                        <ChevronDown size={16} className="text-amber-600" />
                        <p className="text-xs font-bold text-amber-700">
                            Desplázate hasta el final para poder aceptar
                        </p>
                    </div>
                )}

                {/* Terms Content */}
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto px-6 py-6 prose prose-sm max-w-none"
                    style={{ scrollbarWidth: 'thin' }}
                >                    <h1 className="text-2xl font-black text-slate-900 mb-4">Términos y Condiciones de Uso — Pool Imperial</h1>
                    <p className="text-xs text-slate-500 font-bold mb-6">Última actualización: Mayo 2026 — Versión 2.0</p>

                    <hr className="my-6" />

                    <h2 className="text-lg font-bold text-slate-900 mt-6 mb-3">1. Aceptación de los Términos</h2>
                    <p className="text-sm text-slate-700 leading-relaxed mb-4">
                        Al acceder y utilizar la aplicación <strong>Pool Imperial</strong> (en adelante, "la Aplicación"), usted acepta estar sujeto a estos Términos y Condiciones. Si no está de acuerdo con alguna parte de estos términos, no debe utilizar la Aplicación.
                    </p>

                    <h2 className="text-lg font-bold text-slate-900 mt-6 mb-3">2. Descripción del Servicio</h2>
                    <p className="text-sm text-slate-700 leading-relaxed mb-2">
                        Pool Imperial es una aplicación web progresiva (PWA) diseñada para la gestión integral de salas de pool y billar. Proporciona:
                    </p>
                    <ul className="text-sm text-slate-700 space-y-1 mb-4">
                        <li><strong>Gestión de mesas de pool</strong> con control de tiempo, sesiones activas, modo Normal y modo Piña (precio por partida)</li>
                        <li><strong>Punto de venta (POS)</strong> con carrito, múltiples métodos de pago (Efectivo COP, Nequi, Daviplata, Transferencia, Datáfono, Fiado) y recibos térmicos</li>
                        <li><strong>Gestión de inventario</strong> con precios en Pesos Colombianos (COP), control de stock y alertas de bajo inventario</li>
                        <li><strong>Sistema de roles</strong> con Administrador, Cajero y Mesero, cada uno con permisos específicos</li>
                        <li><strong>Dashboard de ventas</strong> con reportes, estadísticas en tiempo real y gestión de caja</li>
                        <li><strong>Gestión de clientes</strong> con sistema de fiados y control de deudas</li>
                        <li><strong>Impresión directa</strong> de tickets térmicos 58mm vía ESC/POS y Web Serial</li>
                        <li><strong>Onboarding guiado</strong> con tours interactivos por rol y por sección al iniciar por primera vez</li>
                        <li><strong>Bitácora de auditoría</strong> con registro de eventos del sistema por usuario</li>
                    </ul>

                    <h2 className="text-lg font-bold text-slate-900 mt-6 mb-3">3. Descargo de Responsabilidad</h2>

                    <h3 className="text-base font-bold text-slate-800 mt-4 mb-2">3.1 Información No Vinculante</h3>
                    <p className="text-sm text-slate-700 leading-relaxed mb-4">
                        <strong className="text-red-600">TODA LA INFORMACIÓN PROPORCIONADA EN LA APLICACIÓN ES ESTRICTAMENTE INFORMATIVA Y DE REFERENCIA.</strong> Pool Imperial no garantiza la exactitud absoluta, integridad, vigencia o fiabilidad de los precios o cualquier otra información mostrada.
                    </p>

                    <h3 className="text-base font-bold text-slate-800 mt-4 mb-2">3.2 No Constituye Asesoría Financiera</h3>
                    <p className="text-sm text-slate-700 leading-relaxed mb-4">
                        La información provista <strong>NO constituye asesoría financiera, legal, tributaria o de inversión</strong>. Usted es responsable de verificar los precios y consumos con fuentes oficiales.
                    </p>

                    <h3 className="text-base font-bold text-slate-800 mt-4 mb-2">3.3 Limitación de Responsabilidad</h3>
                    <p className="text-sm text-slate-700 leading-relaxed mb-2"><strong>Pool Imperial y sus desarrolladores NO se hacen responsables por:</strong></p>
                    <ul className="text-sm text-slate-700 space-y-1 mb-4">
                        <li>Pérdidas económicas directas o indirectas derivadas del uso de la información</li>
                        <li>Errores en el cálculo de precios, tiempos de mesa o cargos aplicados</li>
                        <li>Decisiones comerciales tomadas con base en la información de la Aplicación</li>
                        <li>Pérdida de datos almacenados en el dispositivo o en la nube</li>
                        <li>Interrupciones del servicio por fallos de conectividad o mantenimiento</li>
                    </ul>

                    <h3 className="text-base font-bold text-slate-800 mt-4 mb-2">3.4 Uso Bajo Propio Riesgo</h3>
                    <p className="text-sm text-slate-700 leading-relaxed mb-4">
                        Al usar Pool Imperial, usted acepta que lo hace <strong>bajo su propio riesgo y responsabilidad</strong>.
                    </p>

                    <h2 className="text-lg font-bold text-slate-900 mt-6 mb-3">4. Cuentas de Usuario y Acceso</h2>
                    <p className="text-sm text-slate-700 leading-relaxed mb-2">El acceso a la Aplicación se gestiona mediante cuentas con tres niveles de privilegio:</p>
                    <ul className="text-sm text-slate-700 space-y-1 mb-4">
                        <li><strong>Administrador:</strong> Acceso completo — configuración del sistema, gestión de usuarios (crear, editar, activar/desactivar, eliminar), reportes, apertura y cierre de caja, y anulación de sesiones.</li>
                        <li><strong>Cajero:</strong> Gestión de ventas, cobro de mesas, operaciones de caja. Puede tener permisos de apertura/cierre delegados por el administrador.</li>
                        <li><strong>Mesero:</strong> Apertura de mesas y toma de pedidos. No puede anular sesiones activas. Requiere confirmación al abrir mesa en modo Piña.</li>
                    </ul>
                    <p className="text-sm text-slate-700 leading-relaxed mb-4">
                        Cada usuario accede mediante PIN personal hasheado (SHA-256). El administrador es el único responsable de la gestión de las cuentas de su equipo. Las cuentas desactivadas no pueden iniciar sesión pero conservan su historial.
                    </p>

                    <h2 className="text-lg font-bold text-slate-900 mt-6 mb-3">5. Privacidad y Datos</h2>
                    <p className="text-sm text-slate-700 leading-relaxed mb-2">
                        Pool Imperial opera con principios de <strong>privacidad por diseño</strong>:
                    </p>
                    <ul className="text-sm text-slate-700 space-y-1 mb-4">
                        <li>Los datos operativos se almacenan localmente en su dispositivo y se sincronizan con la nube (Supabase) para respaldo y acceso multi-dispositivo.</li>
                        <li>Los datos <strong>NO se venden ni comparten con terceros</strong>.</li>
                        <li>Las transacciones se registran estrictamente en Pesos Colombianos (COP).</li>
                        <li>La comunicación entre dispositivos se realiza mediante canales cifrados de Supabase Realtime.</li>
                        <li>Los PINs de usuario <strong>nunca se almacenan en texto plano</strong> — se guarda únicamente su hash SHA-256.</li>
                    </ul>

                    <h2 className="text-lg font-bold text-slate-900 mt-6 mb-3">6. Documentos y Comprobantes</h2>
                    <p className="text-sm text-slate-700 leading-relaxed mb-4">
                        Los tickets y comprobantes generados por la Aplicación son <strong>documentos de control interno</strong> y <strong>NO constituyen factura fiscal</strong> ni tienen validez tributaria. El usuario es responsable de cumplir con las obligaciones fiscales correspondientes según la legislación vigente.
                    </p>

                    <h2 className="text-lg font-bold text-slate-900 mt-6 mb-3">7. Legislación Aplicable</h2>
                    <p className="text-sm text-slate-700 leading-relaxed mb-4">
                        Estos Términos se rigen por las leyes de la <strong>República de Colombia</strong>.
                    </p>

                    <h2 className="text-lg font-bold text-slate-900 mt-6 mb-3">8. Código de Conducta</h2>
                    <p className="text-sm text-slate-700 leading-relaxed mb-2">Al utilizar Pool Imperial, usted se compromete a:</p>
                    <ul className="text-sm text-slate-700 space-y-1 mb-4">
                        <li><strong>NO</strong> utilizar la Aplicación para actividades ilícitas</li>
                        <li><strong>NO</strong> intentar vulnerar la seguridad del sistema</li>
                        <li><strong>NO</strong> realizar ingeniería inversa del código</li>
                        <li><strong>NO</strong> compartir credenciales de acceso con personas no autorizadas</li>
                        <li><strong>NO</strong> manipular datos de ventas, inventario o registros de auditoría</li>
                        <li><strong>NO</strong> usar cuentas de otros usuarios para acceder a funciones fuera de su rol</li>
                    </ul>

                    <hr className="my-6" />

                    <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-xl mb-6">
                        <h3 className="text-base font-black text-slate-900 mb-2">Aceptación Final</h3>
                        <p className="text-sm text-slate-700 leading-relaxed">
                            <strong>AL USAR POOL IMPERIAL, USTED DECLARA HABER LEÍDO, ENTENDIDO Y ACEPTADO ESTOS TÉRMINOS Y CONDICIONES EN SU TOTALIDAD.</strong>
                        </p>
                    </div>

                    <p className="text-center text-sm font-bold text-slate-900 mt-8 mb-4">
                        Pool Imperial v2.0 — Sistema de Gestión para Salas de Pool
                    </p>
                    <p className="text-center text-xs text-slate-500 mb-8">
                        Gestión integral de mesas, ventas, inventario y personal
                    </p>

                    <div id="terms-end" className="h-1"></div>
                </div>

                {/* Footer with Accept Button */}
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
                    <button
                        onClick={handleAccept}
                        disabled={!canAccept}
                        className={`w-full py-4 rounded-xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 ${canAccept
                            ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20 active:scale-95'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                    >
                        <Check size={20} strokeWidth={2.5} />
                        <span>{canAccept ? 'Acepto los Términos y Condiciones' : 'Lee hasta el final para aceptar'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
