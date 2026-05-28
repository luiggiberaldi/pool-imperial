# 🎱 Pool Los Diaz — Sistema POS para Sala de Billar

**Pool Los Diaz** es un Sistema Integral de Punto de Venta (POS) diseñado específicamente para la gestión de una sala de pool y billar. Construido con arquitectura **Offline-First**, garantiza continuidad del negocio sin importar la conectividad, con sincronización en la nube mediante Supabase cuando la conexión está disponible.

Funciona como **Progressive Web App (PWA)** instalable en cualquier dispositivo (PC, Android, iOS) sin necesidad de una tienda de aplicaciones.

> 📋 Ver [ROADMAP.md](./ROADMAP.md) para las fases de desarrollo planificadas.
> 📓 Ver [BITACORA.md](./BITACORA.md) para el historial de avances y decisiones técnicas.

---

## 🚀 Características Actuales

### Gestión de Mesas de Pool
- Plano interactivo de mesas con estado en tiempo real (Libre / Activa / Piña)
- Modo **Prepagado por Horas** (cobro por tiempo) y modo **Piña** (precio fijo por partida)
- Timers regresivos por mesa con countdown en tiempo real
- Arquitectura dual de tiempo: horas a nivel de sesión (`hours_paid`) y a nivel de cliente/seat (`timeCharges`)
- Comandas por mesa — los meseros añaden productos directamente desde la mesa activa
- Ajuste manual de tiempo (sumar/restar horas) con soporte LIFO para timeCharges de seats
- Confirmación de Piña para meseros (evita errores de dedo al no poder anular)
- Tickets de cierre de mesa con desglose de tiempo + consumo
- Sistema de cola de espera (Queue Panel) con pendientes por mesa
- Mesas tipo NORMAL (bar/restaurante) sin cobro por tiempo

### Motor de Ventas
- Carrito con múltiples productos y descuento global
- Múltiples métodos de pago simultáneos: USD, Bolívares, Pago Móvil, Fiado
- Motor transaccional atómico vía RPC en Supabase (`process_checkout`)
- Cola de emergencia offline — las ventas nunca se pierden sin internet
- Contabilidad de doble partida para integridad financiera
- Anulación de ventas con reversión de stock y registros contables

### Gestión de Caja
- Apertura y cierre de turno con monto inicial y monto final
- Dashboard con métricas en tiempo real (ventas, tiempo de mesas, métodos de pago)
- Cierre ciego (arqueo sin ver totales del sistema)
- Reporte de cierre exportable como PDF térmico 58mm

### Inventario y Catálogo
- Productos con precio en USD (con conversión automática a Bs)
- Soporte para **Lotes/Bultos** — precio unitario calculado desde precio de compra por bulto
- Control de stock con alertas de bajo inventario configurables
- Margen de ganancia calculado automáticamente
- Filtrado por categoría, búsqueda y paginación
- Escáner de código de barras integrado

### Gestión de Contactos (Cuentas)
- **Clientes**: Registro con deuda (fiado), historial de compras, abonos parciales
- **Proveedores**: Directorio de proveedores con datos de contacto
- **Empleados (Deudas)**: Sistema de deudas de staff con historial de abonos
  - Registro manual de fiados (concepto, monto, empleado)
  - Abonos parciales/totales con historial de movimientos
  - Filtros: Todos / Pendientes / Pagadas
  - Conversión Bs en tiempo real

### Sincronización
- Sincronización P2P en tiempo real (`useCloudSync`) cuando hay internet
- Caché offline con `localforage` (IndexedDB) como fuente principal
- Reconciliación automática al recuperar conexión

### Tickets e Impresión
- Generación de tickets PDF con `jsPDF` — formato 58mm térmico
- Impresión directa en impresoras térmicas USB/Bluetooth vía **ESC/POS y Web Serial API**
- Panel de configuración Web Serial en Settings
- Logo con **aspect ratio dinámico** (sin distorsión)
- Ticket de pre-cuenta por mesa (cuenta parcial)
- Reporte de cierre del día exportable como PDF

### Tarifas y Monedas
- Tasa BCV en tiempo real como referencia base
- Conversiones USD ↔ Bs en tiempo real en toda la app
- Configuración de tarifas por modo de mesa (Hora / Piña)

### Gestión de Usuarios
- Cuatro roles: **Administrador**, **Cajero**, **Mesero**, **Barra**
- Acceso mediante PIN personal (SHA-256, nunca en texto plano)
- Activar / desactivar usuarios sin perder historial
- Eliminar usuario permanentemente
- Permisos de apertura/cierre delegables al Cajero
- Badge de deuda en perfil de empleados

### Centro de Notificaciones
- Campana de notificaciones en el Dashboard
- Alertas de stock bajo (agrupadas)
- Alertas de tiempo vencido en mesas (con nombre real de mesa)
- Aviso de caja abierta por más de 12 horas
- Deudas pendientes de clientes

### Seguridad y Licencias
- Sistema de licencias por dispositivo con validación en Supabase
- Pantalla de bloqueo automática por inactividad
- Bitácora de auditoría con registro de eventos por usuario
- Términos y Condiciones obligatorios al primer uso

### Onboarding
- Tour interactivo guiado por rol (Admin / Cajero / Mesero) al aceptar T&C
- Mini-tours por pestaña al visitarla por primera vez
- Tours contextuales en formularios clave

### Herramientas Adicionales
- Calculadora integrada
- Monitor de actividad en tiempo real
- Paleta de comandos (Command Palette)
- Búsqueda por voz
- Sonidos de interacción configurables

---

## 🗺️ Fases de Desarrollo (Roadmap)

| Fase | Descripción | Estado |
|------|-------------|--------|
| **0** | Infraestructura base, branding, motor de ventas | ✅ Completa |
| **1** | Login con PIN y roles (Admin/Cajero/Mesero/Barra) | ✅ Completa |
| **2** | Plano interactivo de mesas con timers | ✅ Completa |
| **2.5** | Refinamiento administrativo y UI móvil | ✅ Completa |
| **3** | Órdenes, consumo y cobro por mesa | ✅ Completa |
| **4** | Apertura y cierre de caja formal | ✅ Completa |
| **5** | Inventario con lotes, márgenes y stock | ✅ Completa |
| **6** | Refactorización y modularización del código | ✅ Completa |
| **7** | Onboarding con SpotlightTour por rol y por sección | ✅ Completa |
| **8** | Gestión avanzada de usuarios (activar/desactivar/eliminar) | ✅ Completa |
| **9** | Gestión de contactos (Clientes, Proveedores, Empleados) | ✅ Completa |
| **10** | Sistema de deudas de empleados | ✅ Completa |
| **11** | Motor de facturación dual (sesión + seats) y correcciones de totales | ✅ Completa |

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + Vite |
| Estilos | Tailwind CSS |
| Estado global | Zustand |
| Backend / DB | Supabase (PostgreSQL + Realtime) |
| Persistencia offline | LocalForage (IndexedDB) |
| PWA | Vite PWA Plugin |
| Documentos | jsPDF |
| Impresión térmica | Web Serial API + ESC/POS |
| Iconos UI | Lucide React |
| Package manager | Bun |
| Hosting | Cloudflare Workers |

---

## 📂 Estructura del Proyecto

```text
Pool_los_dias/
├── public/              # Estáticos, logo-ticket.png, íconos PWA
├── src/
│   ├── components/
│   │   ├── Sales/       # CheckoutModal, CartPanel, CustomerPickerSection
│   │   ├── Products/    # ProductFormModal, ProductCard
│   │   ├── tables/      # TableCard, TableGrid, OrderPanel, TableQueuePanel,
│   │   │                # TableCardInlineModals, TotalDetailsModal, OpenWizardModal
│   │   ├── Settings/    # Tabs de configuración, UsersManager, DebtsPanel, DebtModals
│   │   │   └── tabs/    # SettingsTabMesas, SettingsTabVentas, SettingsTabUsuarios, etc.
│   │   ├── Customers/   # CustomerCard, CustomerModals
│   │   ├── Suppliers/   # Componentes de proveedores
│   │   ├── Dashboard/   # OperatorDashboardPanel
│   │   ├── Reports/     # TransactionRow, PaymentBreakdownCard
│   │   ├── security/    # LoginScreen, PinPad, Guards de rol
│   │   ├── calculator/  # Componentes de calculadora
│   │   └── ui/          # Componentes base reutilizables
│   ├── config/          # supabaseCloud.js, paymentMethods.js, tourSteps.js
│   ├── hooks/
│   │   ├── store/       # useAuthStore, useCashStore, useTablesStore, useOrdersStore,
│   │   │                # useCustomersStore, useDebtsStore, tableBillingActions, etc.
│   │   ├── useNotificationCenter.js
│   │   ├── useCloudSync.js
│   │   ├── useDashboardMetrics.js
│   │   ├── useCheckoutPayments.js
│   │   └── ...          # 30+ hooks especializados
│   ├── utils/           # tableBillingEngine, ticketGenerator, thermalTicketGenerator,
│   │                    # tableTicketGenerator, checkoutProcessor, dailyCloseGenerator,
│   │                    # offlineQueueService, voidSaleProcessor, financialLogic
│   ├── views/           # DashboardView, SalesView, ProductsView, TablesView,
│   │                    # CustomersView, ReportsView, SettingsView, CashierCheckoutView,
│   │                    # MonitorView, CalculatorView, WalletView
│   ├── App.jsx          # Componente raíz, navegación y router de estado
│   └── main.jsx         # Punto de entrada
├── ROADMAP.md
├── BITACORA.md
├── TERMINOS_Y_CONDICIONES.md
├── package.json
├── tailwind.config.js
└── vite.config.js
```

---

## 💻 Desarrollo e Instalación

### Requisitos Previos
- [Bun](https://bun.sh/) v1.0+
- Proyecto activo en [Supabase](https://supabase.com/)

### Instrucciones

```bash
# 1. Instalar dependencias
bun install

# 2. Iniciar en modo desarrollo
bun run dev

# 3. Construir para producción
bun run build
```

### Deploy

```bash
# Desplegar a Cloudflare Workers
npx wrangler deploy --dispatch-namespace chiridion
```

### Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `bun run dev` | Servidor de desarrollo con HMR |
| `bun run build` | Build optimizado para producción |
| `bun run preview` | Previsualizar el build de producción |
| `bun run lint` | Ejecutar ESLint |

---

## 👥 Roles del Sistema

| Rol | Descripción | Permisos |
|-----|------------|----------|
| `ADMIN` | Dueño / Gerente | Acceso total. Configuración, reportes, caja, mesas, deudas |
| `CAJERO` | Cajero | Ventas, cobros, apertura/cierre de caja (delegable) |
| `MESERO` | Mesero / Operador | Asignar mesas, registrar órdenes, ver consumo |
| `BARRA` | Operador de barra | Preparar pedidos, ver órdenes asignadas |

---

## 🏗️ Arquitectura de Facturación de Mesas

El sistema maneja tiempo pagado en dos niveles:

1. **Nivel de Sesión** (`session.hours_paid`): Horas asignadas globalmente a la mesa
2. **Nivel de Seat/Cliente** (`seat.timeCharges[]`): Horas o piñas asignadas a clientes individuales

```
timeCharges: [
  { id: "uuid", type: "hora", amount: 1 },
  { id: "uuid", type: "pina", amount: 1 }
]
```

El `tableBillingEngine.js` calcula costos considerando ambos niveles. El timer de countdown usa `totalHoursPaid = session.hours_paid + seatHoursTotal`.

---

## 📐 Reglas del Sistema

1. **Offline-First** — Toda acción funciona sin internet.
2. **PIN Hasheado** — SHA-256 vía Web Crypto API. Nunca texto plano.
3. **Doble Partida** — Integridad contable garantizada.
4. **Papel 58mm** — Todos los documentos optimizados para impresora térmica 58mm.
5. **Moneda base USD** — Bolívares es conversión dinámica vía tasa BCV.
6. **Roles y Permisos** — Cada acción está gated por el rol del usuario en sesión.
7. **Solo horas prepagadas** — Modo libre deshabilitado; solo se permite abrir mesas con horas prepagadas.

---

## 🤝 Metodología

- Principios **SOLID** y **Clean Architecture**
- Componentes atómicos y reutilizables
- Hooks personalizados para separar lógica de negocio de la presentación
- Archivos de vista limitados a ~450 líneas máximo
- Manejo de errores con fallback offline en cada capa
