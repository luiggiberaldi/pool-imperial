# 🎱 Pool Imperial

**El sistema de gestión que tu sala de billar necesita.**

Pool Imperial es un punto de venta (POS) diseñado exclusivamente para salones de pool y billar. Controla tus mesas en tiempo real, cobra por horas o piñas, gestiona consumo de barra, imprime tickets y mantiene todo sincronizado — **incluso sin internet**.

Funciona como **Progressive Web App (PWA)**: instálalo desde el navegador en cualquier celular, tablet o computador. Sin tiendas de aplicaciones. Sin actualizaciones manuales.

> 📋 Ver [ROADMAP.md](./ROADMAP.md) para el historial de desarrollo y fases futuras  
> 🚀 Ver [SETUP_NUEVO_LOCAL.md](./SETUP_NUEVO_LOCAL.md) para replicar la instalación en otro local

---

## 🏪 Para Dueños de Local — ¿Qué puede hacer Pool Imperial?

### 🎱 Control Total de Mesas
- **Plano visual del local** — Ve el estado de todas las mesas en un solo vistazo
- **Timers automáticos** — El sistema cuenta el tiempo y te avisa cuando se vence
- **Dos modos de cobro**: por hora (prepagado) o por piña (partida)
- **Mesas normales** (bar/restaurante) sin cobro por tiempo
- **Cola de espera** — Gestiona las mesas pendientes de cobro
- **Transferencias** — Mueve una sesión completa de una mesa a otra sin perder datos

### 💰 Punto de Venta Rápido
- Vende productos de barra directo desde la mesa
- Múltiples métodos de pago: Efectivo, Nequi, Daviplata, Transferencia, Datáfono
- Pre-cuenta para que el cliente vea lo que debe antes de pagar
- Ticket de cierre con desglose completo (tiempo + consumo)
- Fiado con historial de abonos por cliente

### 📦 Inventario Inteligente
- Catálogo de productos con precios en pesos colombianos (COP)
- Control de stock automático (se descuenta al vender)
- Alertas cuando un producto está por agotarse
- Soporte para lotes/bultos (precio unitario calculado)
- Escáner de código de barras integrado

### 🧾 Caja Registradora
- Apertura de caja con fondo inicial
- Cierre ciego (el cajero arquea sin ver los totales del sistema)
- Reporte de cierre en papel térmico o PDF
- Dashboard con métricas en tiempo real

### 👥 Equipo y Roles
- 4 roles: **Administrador**, **Cajero**, **Mesero**, **Barra**
- Cada operador entra con su propio PIN (4 dígitos)
- El sistema solo muestra las funciones que cada rol necesita
- Registro de quién hizo qué (auditoría)

### 📱 Funciona Offline
- **Sin internet, sigue funcionando.** Todas las ventas, mesas y comandas se guardan localmente
- Cuando vuelve la conexión, todo se sincroniza automáticamente
- Instalable en celulares y tablets como app nativa
- Funciona en Android, iOS, Windows, Mac y Linux

### 🖨️ Tickets Térmicos
- Impresión directa en impresoras térmicas USB vía Web Serial API
- Formato optimizado para papel de 58mm
- Tickets de venta, pre-cuenta, cierre de mesa y cierre de caja
- Logo del negocio en cada ticket

### 🔒 Seguridad
- PIN con cifrado SHA-256 (nunca se guarda en texto plano)
- Bloqueo automático por inactividad
- Sistema de licencias por dispositivo
- Auditoría de acciones por usuario

---

## 🛠️ Para Desarrolladores — Documentación Técnica

### Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + Vite 7 |
| Estilos | Tailwind CSS 3.4 |
| Estado global | Zustand 5 |
| Backend / DB | Supabase (PostgreSQL + Realtime) |
| Persistencia offline | LocalForage (IndexedDB) |
| PWA | Vite PWA Plugin 1.2 |
| Documentos | jsPDF 4 |
| Impresión térmica | Web Serial API + ESC/POS |
| Iconos UI | Lucide React |
| Package manager | Bun / npm |
| Hosting | Vercel / Cloudflare Workers |

### Requisitos Previos

- Node.js 18+ o [Bun](https://bun.sh/) v1.0+
- Proyecto activo en [Supabase](https://supabase.com/)
- Archivo `.env` con las credenciales (ver `.env.example`)

### Instalación Rápida

```bash
# 1. Clonar el repositorio
git clone <url-del-repo>
cd pool-imperial

# 2. Instalar dependencias
npm install   # o bun install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con las credenciales de Supabase

# 4. Iniciar en modo desarrollo
npm run dev   # o bun run dev
```

### Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Servidor de desarrollo con HMR |
| `npm run build` | Build optimizado para producción |
| `npm run preview` | Previsualizar el build de producción |
| `npm run lint` | Ejecutar ESLint |

### Deploy

```bash
# Vercel (recomendado)
npx vercel --prod

# Cloudflare Workers (alternativo)
npm run build && npx wrangler deploy --dispatch-namespace <tu-namespace>
```

### Estructura del Proyecto

```text
pool-imperial/
├── public/                    # Estáticos: logos, íconos PWA
├── src/
│   ├── config/
│   │   ├── venueConfig.js     # 🔑 Identidad del negocio (centralizado)
│   │   ├── supabaseCloud.js   # Singleton de Supabase
│   │   ├── paymentMethods.js  # Métodos de pago de fábrica
│   │   ├── categories.js      # Categorías de productos
│   │   └── tourSteps.js       # Steps de onboarding
│   ├── components/
│   │   ├── tables/            # TableCard, FloorPlanView, TableContextPanel,
│   │   │                      # OrderPanel, TableBillModal, TotalDetailsModal
│   │   ├── Sales/             # CheckoutModal, CartPanel, PaymentUI
│   │   ├── Products/          # ProductFormModal, ProductCard
│   │   ├── Settings/          # Tabs de configuración, UsersManager, Debts
│   │   ├── Customers/         # CRM: Clientes, Proveedores
│   │   ├── Dashboard/         # OperatorDashboardPanel
│   │   ├── Reports/           # TransactionRow, PaymentBreakdownCard
│   │   ├── security/          # LoginScreen, PinPad, Guards
│   │   └── ui/                # Componentes base reutilizables
│   ├── hooks/
│   │   ├── store/             # Zustand stores: auth, cash, tables, orders
│   │   │                      # + action slices (sync, session, billing, realtime)
│   │   ├── useCloudSync.js    # Motor de sincronización P2P
│   │   └── ...                # 30+ hooks especializados
│   ├── services/              # CurrencyService, RateService, webSerialPrinter
│   ├── utils/                 # tableBillingEngine, ticketGenerator, checkoutProcessor
│   ├── data/                  # floorPlanData.js (layout del local)
│   ├── views/                 # Vistas principales de la app
│   ├── App.jsx                # Componente raíz + router de estado
│   └── main.jsx               # Punto de entrada
├── ROADMAP.md                 # Hoja de ruta del producto
├── SETUP_NUEVO_LOCAL.md       # Guía para replicar en otro local
├── database/                  # Carpeta de base de datos (esquemas y scripts SQL)
├── .env.example               # Variables de entorno requeridas
├── vite.config.js             # Configuración de Vite + PWA
└── tailwind.config.js         # Configuración de Tailwind CSS
```

### Arquitectura de Datos

```
┌─────────────────────────────────────────────┐
│           Pool Imperial PWA v3.0            │
├─────────────────┬───────────────────────────┤
│   Capa de UI    │  React 19 + Tailwind CSS  │
├─────────────────┼───────────────────────────┤
│ Estado / Lógica │  Zustand + React Hooks    │
├─────────────────┼───────────────────────────┤
│  Configuración  │  venueConfig.js (central) │
├─────────────────┼───────────────────────────┤
│  Persistencia   │  LocalForage (IndexedDB)  │
│  Local          │  Offline-First            │
├─────────────────┼───────────────────────────┤
│  Sincronización │  useCloudSync.js (P2P)    │
│  en Tiempo Real │  Supabase Realtime        │
├─────────────────┼───────────────────────────┤
│  Base de Datos  │  Supabase PostgreSQL      │
│  Remota         │  RPCs transaccionales     │
├─────────────────┼───────────────────────────┤
│  Impresión      │  Web Serial API + ESC/POS │
│                 │  jsPDF (tickets PDF)      │
├─────────────────┼───────────────────────────┤
│  Hosting        │  Vercel / Cloudflare      │
└─────────────────┴───────────────────────────┘
```

### Facturación de Mesas

El sistema maneja tiempo pagado en dos niveles:

1. **Nivel de Sesión** (`session.hours_paid`): Horas asignadas globalmente a la mesa
2. **Nivel de Seat/Cliente** (`seat.timeCharges[]`): Horas o piñas asignadas a clientes individuales

```js
timeCharges: [
  { id: "uuid", type: "hora", amount: 1 },
  { id: "uuid", type: "pina", amount: 1 }
]
```

El `tableBillingEngine.js` calcula costos considerando ambos niveles. El timer de countdown usa `totalHoursPaid = session.hours_paid + seatHoursTotal`.

### Configuración del Local

Todos los parámetros del negocio están centralizados en [`src/config/venueConfig.js`](./src/config/venueConfig.js):

| Parámetro | Descripción |
|-----------|-------------|
| `VENUE_NAME` | Nombre del negocio ("Pool Imperial") |
| `CURRENCY_CODE` | Moneda base ("COP") |
| `SUPPORT_WHATSAPP` | Número de WhatsApp para soporte |
| `TICKET_WIDTH_MM` | Ancho del papel térmico (58mm) |
| `DEFAULT_PRICE_PER_HOUR` | Tarifa default por hora |
| `DEFAULT_PRICE_PINA` | Tarifa default por piña |
| `STORAGE_DB_NAME` | Nombre de la base IndexedDB |

Para replicar en otro local, modifica **solo este archivo**. Ver [SETUP_NUEVO_LOCAL.md](./SETUP_NUEVO_LOCAL.md).

### Roles del Sistema

| Rol | Permisos |
|-----|----------|
| `ADMIN` | Acceso total: configuración, reportes, caja, mesas, deudas |
| `CAJERO` | Ventas, cobros, apertura/cierre de caja (delegable) |
| `MESERO` | Asignar mesas, registrar órdenes, ver consumo |
| `BARRA` | Preparar pedidos, ver órdenes asignadas |

### Reglas del Sistema

1. **Offline-First** — Toda acción funciona sin internet
2. **PIN Hasheado** — SHA-256 vía Web Crypto API, nunca texto plano
3. **Doble Partida** — Integridad contable garantizada
4. **Papel 58mm** — Todos los documentos para impresora térmica 58mm
5. **Moneda configurable** — Definida en `venueConfig.js`
6. **Roles y Permisos** — Cada acción está gated por el rol del usuario
7. **Solo horas prepagadas** — Modo libre deshabilitado

---

## 🤝 Metodología

- Principios **SOLID** y **Clean Architecture**
- Componentes atómicos y reutilizables
- Hooks personalizados para separar lógica de negocio de presentación
- Archivos de vista limitados a ~450 líneas máximo
- Manejo de errores con fallback offline en cada capa
- `venueConfig.js` como fuente única de verdad para parámetros del negocio
