# 🎱 Pool Los Diaz — Hoja de Ruta del Sistema

> **Versión:** 2.0
> **Proyecto:** Pool Los Diaz POS
> **Supabase Ref:** `raxcxddreghynthyvllh`
> **Stack:** React 19 + Vite + Supabase + LocalForage (PWA Offline-First)
> **Hosting:** Cloudflare Workers
> **Última actualización:** 18 Abril 2026

---

## 🎯 Visión General

Sistema de punto de venta especializado para un salón de billar, con gestión de mesas, órdenes de consumo, control de caja, inventario, contactos y reportes financieros. Diseñado para funcionar 100% offline con sincronización en la nube mediante Supabase.

---

## FASE 0 — Infraestructura Base ✅ (COMPLETADA)

**Objetivo:** Establecer la base técnica del proyecto — branding, motor de ventas, tickets y sincronización.

- [x] Branding "Pool Los Diaz" en toda la app
- [x] Motor de ventas con RPC `process_checkout`
- [x] Cola offline (`offlineQueueService.js`)
- [x] Sincronización P2P (`useCloudSync.js`)
- [x] Tickets térmicos 58mm con logo dinámico

---

## FASE 1 — Autenticación por PIN y Roles ✅ (COMPLETADA)

**Objetivo:** Control de acceso por rol con PIN de 4 dígitos.

- [x] Tabla `staff_users` en Supabase
- [x] Store de autenticación con caché offline
- [x] Hashing SHA-256 vía Web Crypto API
- [x] `LoginScreen.jsx` + `PinPad.jsx`
- [x] Guards de ruta por rol

### Roles del sistema
| Rol | Descripción | Permisos |
|-----|------------|----------|
| `ADMIN` | Dueño / Gerente | Acceso total. Configuración, reportes, caja, mesas, deudas |
| `CAJERO` | Cajero | Ventas, cobros, apertura/cierre de caja (delegable) |
| `MESERO` | Mesero / Operador | Asignar mesas, registrar órdenes, ver consumo |
| `BARRA` | Operador de barra | Preparar pedidos, ver órdenes asignadas |

---

## FASE 2 — Plano Interactivo de Mesas ✅ (COMPLETADA)

**Objetivo:** Vista principal de operación con estado en tiempo real de cada mesa.

- [x] Tablas `tables` y `table_sessions`
- [x] `TablesView.jsx` con plano visual
- [x] `TableCard.jsx` con timer regresivo y precio
- [x] Modos: Prepagado por Horas / Piña
- [x] Mesas tipo NORMAL (bar) sin cobro por tiempo
- [x] Filtros por tipo y estado
- [x] CRUD administrativo de mesas
- [x] Sincronización Supabase Realtime

---

## FASE 2.5 — Refinamiento Administrativo y UI Móvil ✅ (COMPLETADA)

- [x] CRUD de mesas (añadir/editar/cambiar nombre)
- [x] Tipos: Mesa Pool (timer) vs Mesa Normal (solo consumo)
- [x] Filtros combinados Tipo × Estado
- [x] UI optimizada para móviles (sticky filters)

---

## FASE 3 — Órdenes, Consumo y Cobro ✅ (COMPLETADA)

**Objetivo:** Vincular consumo de barra a cada mesa con checkout unificado.

- [x] Tablas `orders`, `order_items`, `payments`
- [x] `OrderPanel.jsx` — Panel de consumo por mesa
- [x] Modal "Detalle de Cuenta" con desglose dual ($/Bs)
- [x] Ticket parcial (pre-cuenta)
- [x] Flujo de cobro integrado con `checkoutProcessor.js`

---

## FASE 4 — Apertura y Cierre de Caja ✅ (COMPLETADA)

**Objetivo:** Control formal del dinero físico con arqueo y cierre de turno.

- [x] Apertura de caja con fondo inicial
- [x] Bloqueo si no hay caja abierta
- [x] Cierre ciego (arqueo sin ver totales del sistema)
- [x] Ticket térmico de cierre
- [x] Historial en Reportes

---

## FASE 5 — Inventario de Barra ✅ (COMPLETADA)

**Objetivo:** Control de stock con descuento automático al vender.

- [x] Catálogo con precios USD y conversión Bs
- [x] Lotes/bultos con precio unitario calculado
- [x] Alertas de stock bajo configurables
- [x] Escáner de código de barras
- [x] Filtros, búsqueda y paginación

---

## FASE 6 — Refactorización de Código ✅ (COMPLETADA — 05/04/2026)

**Objetivo:** Modularizar archivos >600 líneas sin romper funcionalidad.

- [x] 7 vistas refactorizadas
- [x] 7+ hooks extraídos
- [x] 5+ componentes nuevos
- [x] Build verificado green

---

## FASE 7 — Onboarding ✅ (COMPLETADA)

- [x] SpotlightTour por rol y sección
- [x] Tours contextuales en formularios

---

## FASE 8 — Gestión Avanzada de Usuarios ✅ (COMPLETADA)

- [x] Activar/desactivar/eliminar usuarios
- [x] 4 roles: ADMIN, CAJERO, MESERO, BARRA
- [x] Permisos delegables

---

## FASE 9 — Gestión de Contactos ✅ (COMPLETADA)

**Objetivo:** CRM básico con clientes, proveedores y empleados.

- [x] `CustomersView.jsx` con tabs: Clientes / Proveedores / Empleados
- [x] Sistema de fiado con abonos parciales
- [x] Directorio de proveedores
- [x] UI responsive para móviles

---

## FASE 10 — Sistema de Deudas de Empleados ✅ (COMPLETADA — 17/04/2026)

**Objetivo:** Registro y seguimiento de fiados de empleados con historial de pagos.

- [x] Tablas `staff_debts` y `staff_debt_payments`
- [x] `useDebtsStore.js` — Store Zustand
- [x] `DebtsPanel.jsx` + `DebtModals.jsx`
- [x] Filtros: Todos / Pendientes / Pagadas
- [x] Conversión Bs en tiempo real
- [x] Badge de deuda en UsersManager
- [x] Tab "Deudas" en Settings (adminOnly)

---

## FASE 11 — Motor de Facturación Dual ✅ (COMPLETADA — 18/04/2026)

**Objetivo:** Corregir el sistema de facturación para soportar la arquitectura dual de tiempo (sesión + seats).

- [x] `tableBillingEngine.js` — parámetro `seats` para detección correcta de `isLibre`
- [x] Timer countdown usa `totalHoursPaid = hours_paid + seatHours`
- [x] grandTotal incluye `seatTimeCost` en todas las vistas (Card, Queue, Checkout, Dashboard)
- [x] TotalDetailsModal con sección "Horas Prepagadas"
- [x] Restar horas: LIFO desde seat timeCharges, luego hours_paid
- [x] Modo libre deshabilitado; solo horas prepagadas
- [x] Notificaciones con nombres reales de mesas
- [x] Texto "acumulado" eliminado

---

## 🏗️ Arquitectura Técnica

```
┌─────────────────────────────────────────────┐
│               Pool Los Diaz PWA              │
├─────────────────┬───────────────────────────┤
│   Capa de UI    │  React 19 + Tailwind CSS  │
├─────────────────┼───────────────────────────┤
│ Estado / Lógica │  Zustand + React Hooks    │
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
│                 │  jsPDF (tickets PDF)       │
├─────────────────┼───────────────────────────┤
│  Hosting        │  Cloudflare Workers       │
└─────────────────┴───────────────────────────┘
```

---

## 📐 Reglas Inamovibles del Sistema

1. **Offline-First**: Toda acción funciona sin internet. La sincronización es eventual.
2. **PIN Hasheado**: SHA-256 vía Web Crypto API. Nunca texto plano.
3. **Doble Partida**: Cada venta genera débito/crédito para integridad contable.
4. **Impresora 58mm**: Documentos optimizados para papel térmico 58mm.
5. **Moneda base USD**: Bs son conversiones dinámicas vía tasa BCV.
6. **RLS Permisivo**: Seguridad en Guards del cliente, no en políticas RLS.
7. **Solo horas prepagadas**: Modo libre deshabilitado temporalmente.

---

## 🔧 Estado Actual del Proyecto (Abril 2026)

| Tema | Estado |
|-----------|--------|
| Branding "Pool Los Diaz" | ✅ Completo |
| Motor de ventas | ✅ Operativo |
| Cola offline | ✅ Operativa |
| Sincronización P2P | ✅ Operativa |
| RPCs Supabase | ✅ Desplegadas |
| Tickets térmicos 58mm | ✅ Calibrado |
| Impresión Web Serial | ✅ Operativa |
| Login por PIN (4 roles) | ✅ Completo |
| Plano de Mesas con Timers | ✅ Completo |
| Órdenes y Comandas | ✅ Completo |
| Apertura / Cierre de Caja | ✅ Completo |
| Inventario de Barra | ✅ Completo |
| Refactorización de Código | ✅ Completo |
| Onboarding Tours | ✅ Completo |
| Gestión de Usuarios | ✅ Completo |
| Gestión de Contactos | ✅ Completo |
| Deudas de Empleados | ✅ Completo |
| Motor de Facturación Dual | ✅ Completo |
| Centro de Notificaciones | ✅ Completo |
