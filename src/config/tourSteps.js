// ─────────────────────────────────────────────────────────────
//  Tour de Onboarding — Pasos por Rol y por Pestaña
//  Claves de localStorage usadas:
//    pda_tour_done_{ROLE}          → tour de bienvenida por rol (ej: pda_tour_done_ADMIN)
//    pda_tab_tour_{tabId}_{ROLE}   → mini-tour por pestaña   (ej: pda_tab_tour_inicio_ADMIN)
// ─────────────────────────────────────────────────────────────

// ── Tours de Bienvenida por Rol ────────────────────────────────
export const ROLE_WELCOME_STEPS = {
    ADMIN: [
        {
            target: null,
            title: '¡Bienvenido, Administrador!',
            text: 'Tienes acceso completo al sistema: ventas, inventario, reportes, mesas y configuración de tu negocio.',
            emoji: '👑'
        },
        {
            target: '[data-tour="tab-inicio"]',
            title: 'Dashboard Principal',
            text: 'Aquí ves las ventas del día, medios de pago, ranking de meseros y el botón para cerrar tu caja.'
        },
        {
            target: '[data-tour="tab-mesas"]',
            title: 'Mesas de Pool',
            text: 'Abre mesas, controla el tiempo jugado y agrega consumos. Al cobrar, el ticket va a Caja.'
        },
        {
            target: '[data-tour="tab-ventas"]',
            title: 'Punto de Venta',
            text: 'Cobra productos en Bs o USD con múltiples métodos de pago. Soporta descuentos y fiados.'
        },
        {
            target: '[data-tour="tab-catalogo"]',
            title: 'Inventario',
            text: 'Agrega productos, ajusta precios y controla el stock. Recibirás alertas de bajo inventario.'
        },
        {
            target: '[data-tour="tab-clientes"]',
            title: 'Clientes y Fiados',
            text: 'Registra clientes, gestiona cuentas fiadas y cobra deudas pendientes.'
        },
        {
            target: '[data-tour="tab-reportes"]',
            title: 'Reportes',
            text: 'Historial completo de ventas y cierres de caja. Exporta a CSV para tu contabilidad.'
        },
        {
            target: '[data-tour="tab-ajustes"]',
            title: 'Configuración',
            text: 'Gestiona usuarios, métodos de pago, mesas, y los datos de tu negocio. ¡Todo listo!'
        },
    ],

    CAJERO: [
        {
            target: null,
            title: '¡Bienvenido, Cajero!',
            text: 'Tu rol es gestionar las ventas y el flujo de caja del turno. Aquí tienes tus herramientas.',
            emoji: '💰'
        },
        {
            target: '[data-tour="tab-inicio"]',
            title: 'Tu Dashboard',
            text: 'Al comenzar el turno, abre la caja aquí. Al final encontrarás el botón de cierre de turno.'
        },
        {
            target: '[data-tour="tab-ventas"]',
            title: 'Punto de Venta',
            text: 'Cobra productos y mesas. Acepta efectivo, transferencia, Zelle y más métodos de pago.'
        },
        {
            target: '[data-tour="tab-clientes"]',
            title: 'Clientes',
            text: 'Registra nuevos clientes y cobra deudas fiadas. Los saldos se actualizan automáticamente.'
        },
    ],

    MESERO: [
        {
            target: null,
            title: '¡Bienvenido, Mesero!',
            text: 'Tu rol es atender las mesas de pool. Abre mesas, registra consumos y envía a cobro.',
            emoji: '🎱'
        },
        {
            target: '[data-tour="tab-mesas"]',
            title: 'Tus Mesas',
            text: 'Toca una mesa libre para abrirla. El tiempo corre automáticamente. Agrega bebidas o snacks al pedido.'
        },
        {
            target: '[data-tour="tab-inicio"]',
            title: 'Tu Ranking',
            text: 'Ve cuántas mesas atendiste hoy y tu posición en el ranking del equipo. ¡A vender!'
        },
        {
            target: '[data-tour="tab-ventas"]',
            title: 'Ventas Directas',
            text: 'También puedes hacer cobros rápidos desde aquí cuando sea necesario.'
        },
    ],

    BARRA: [
        {
            target: null,
            title: '¡Bienvenido, Barra!',
            text: 'Tu rol es atender las mesas de pool. Abre mesas, registra consumos y envía a cobro.',
            emoji: '🎱'
        },
        {
            target: '[data-tour="tab-mesas"]',
            title: 'Tus Mesas',
            text: 'Toca una mesa libre para abrirla. El tiempo corre automáticamente. Agrega bebidas o snacks al pedido.'
        },
        {
            target: '[data-tour="tab-inicio"]',
            title: 'Tu Ranking',
            text: 'Ve cuántas mesas atendiste hoy y tu posición en el ranking del equipo. ¡A vender!'
        },
        {
            target: '[data-tour="tab-ventas"]',
            title: 'Ventas Directas',
            text: 'También puedes hacer cobros rápidos desde aquí cuando sea necesario.'
        },
    ],
};

// ── Mini-tours por Pestaña ─────────────────────────────────────
//  Cada clave es un tabId. Dentro, pasos por ROL.
//  Si el rol no tiene pasos para esa pestaña, no se muestra tour.
export const TAB_STEPS = {
    inicio: {
        ADMIN: [
            {
                target: null,
                title: 'Dashboard de Ventas',
                text: 'Aquí ves el resumen del turno activo: ingresos, items vendidos y medios de pago.'
            },
            {
                target: '[data-tour="apertura-caja"]',
                title: 'Apertura de Caja',
                text: 'Antes de vender, registra el efectivo inicial del turno con el botón "Abrir Caja".'
            },
            {
                target: '[data-tour="cierre-turno"]',
                title: 'Cierre de Turno',
                text: 'Al terminar, usa "Cerrar Turno" para reconciliar el efectivo y generar el reporte del turno.'
            },
        ],
        CAJERO: [
            {
                target: null,
                title: 'Dashboard de Turno',
                text: 'Aquí ves las ventas de tu turno actual y el estado de la caja.'
            },
            {
                target: '[data-tour="apertura-caja"]',
                title: 'Apertura de Caja',
                text: 'Registra el efectivo inicial antes de empezar a cobrar.'
            },
        ],
        MESERO: [
            {
                target: null,
                title: 'Tu Inicio',
                text: 'Ve el resumen del día y tu posición en el ranking de meseros del equipo.'
            },
        ],
        BARRA: [
            {
                target: null,
                title: 'Tu Inicio',
                text: 'Ve el resumen del día y tu posición en el ranking del equipo.'
            },
        ],
    },

    mesas: {
        ADMIN: [
            {
                target: null,
                title: 'Control de Mesas',
                text: 'Vista en tiempo real de todas las mesas. Verde = libre, Azul = ocupada con el tiempo corriendo.'
            },
            {
                target: '[data-tour="mesa-btn-normal"]',
                title: 'Modo Normal',
                text: 'Abre la mesa seleccionando el tiempo prepago. El sistema lleva el control automáticamente.'
            },
            {
                target: '[data-tour="mesa-btn-pina"]',
                title: 'La Piña',
                text: 'Cobra por partida a precio fijo. Cada vez que terminen una partida, toca "+ Nueva Piña" para sumar otra. Ideal para grupos que juegan varias rondas.'
            },
            {
                target: null,
                title: 'Consumo y Cobrar',
                text: 'Con la mesa abierta aparecen dos botones: "Consumo" para agregar bebidas o snacks al pedido, y "Cobrar" para enviar el ticket a caja y cerrar la mesa.'
            },
        ],
        MESERO: [
            {
                target: null,
                title: 'Tus Mesas',
                text: 'Toca una mesa LIBRE para abrirla. El temporizador arranca automáticamente.'
            },
            {
                target: '[data-tour="mesa-btn-normal"]',
                title: 'Modo Normal',
                text: 'Abre la mesa por tiempo. Al final, el sistema calcula el total según las horas jugadas.'
            },
            {
                target: '[data-tour="mesa-btn-pina"]',
                title: 'La Piña',
                text: 'Precio fijo por partida. Cada vez que el grupo quiera otra ronda, toca "+ Nueva Piña" para agregarla.'
            },
            {
                target: null,
                title: 'Consumo y Cobrar',
                text: 'Con la mesa abierta usa "Consumo" para añadir productos al pedido. Cuando terminen, toca "Cobrar" para enviar el ticket al cajero.'
            },
        ],
        BARRA: [
            {
                target: null,
                title: 'Tus Mesas',
                text: 'Toca una mesa LIBRE para abrirla. El temporizador arranca automáticamente.'
            },
            {
                target: '[data-tour="mesa-btn-normal"]',
                title: 'Modo Normal',
                text: 'Abre la mesa por tiempo. Al final, el sistema calcula el total según las horas jugadas.'
            },
            {
                target: '[data-tour="mesa-btn-pina"]',
                title: 'La Piña',
                text: 'Precio fijo por partida. Cada vez que el grupo quiera otra ronda, toca "+ Nueva Piña" para agregarla.'
            },
            {
                target: null,
                title: 'Consumo y Cobrar',
                text: 'Con la mesa abierta usa "Consumo" para añadir productos al pedido. Cuando terminen, toca "Cobrar" para enviar el ticket al cajero.'
            },
        ],
    },

    ventas: {
        ADMIN: [
            {
                target: null,
                title: 'Punto de Venta',
                text: 'Busca productos o tócalos para agregarlos al carrito. Puedes buscar por nombre o código.'
            },
            {
                target: '[data-tour="bcv-rate-btn"]',
                title: 'Tasa BCV',
                text: 'Aquí ves la tasa del día en Bs. Tócalo para abrirlo y cambiar la configuración de la tasa.'
            },
            {
                target: '[data-tour="bcv-rate-config"]',
                title: 'Auto o Manual',
                text: 'Con "Auto Dólar BCV" activado el sistema usa siempre la tasa oficial actualizada. Si lo apgas, puedes escribir tu propia tasa manual y tocar "Aceptar" para guardarla.'
            },
            {
                target: '[data-tour="checkout-btn"]',
                title: 'Cobrar',
                text: 'Cuando el carrito esté listo, toca "Cobrar" para seleccionar los métodos de pago.'
            },
        ],
        CAJERO: [
            {
                target: null,
                title: 'Punto de Venta',
                text: 'Agrega productos al carrito. Puedes combinar múltiples métodos de pago en una sola venta.'
            },
            {
                target: '[data-tour="checkout-btn"]',
                title: 'Cobrar',
                text: 'Toca "Cobrar" para procesar el pago. El recibo se genera automáticamente.'
            },
        ],
        MESERO: [
            {
                target: null,
                title: 'Ventas Directas',
                text: 'Cobra productos directamente desde aquí cuando no están asociados a una mesa de pool.'
            },
        ],
        BARRA: [
            {
                target: null,
                title: 'Ventas Directas',
                text: 'Cobra productos directamente desde aquí cuando no están asociados a una mesa de pool.'
            },
        ],
    },

    catalogo: {
        ADMIN: [
            {
                target: null,
                title: 'Inventario',
                text: 'Gestiona todos tus productos. Filtra por categoría y usa la búsqueda para encontrar rápido.'
            },
            {
                target: '[data-tour="add-product"]',
                title: 'Agregar Producto',
                text: 'Toca el botón "+" para crear un nuevo producto con precio en USD y su equivalente en Bs.'
            },
        ],
    },

    clientes: {
        ADMIN: [
            {
                target: null,
                title: 'Gestión de Clientes',
                text: 'Registra clientes para gestionar fiados. Puedes ver el historial y cobrar deudas pendientes.'
            },
        ],
        CAJERO: [
            {
                target: null,
                title: 'Clientes',
                text: 'Busca un cliente para ver su saldo o registra uno nuevo. Los fiados se descuentan automáticamente.'
            },
        ],
    },

    reportes: {
        ADMIN: [
            {
                target: null,
                title: 'Reportes Completos',
                text: 'Historial de todas las ventas. Filtra por fecha y exporta a CSV para tu contabilidad.'
            },
        ],
    },

    ajustes: {
        ADMIN: [
            {
                target: null,
                title: 'Configuración',
                text: 'Gestiona usuarios, métodos de pago y los datos de tu negocio desde aquí.'
            },
        ],
    },
};
