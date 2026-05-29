# 🎱 Pool Imperial — Hoja de Ruta del Producto

> **Versión:** 3.0  
> **Proyecto:** Pool Imperial POS  
> **Stack:** React 19 + Vite + Supabase + LocalForage (PWA Offline-First)  
> **Hosting:** Vercel / Cloudflare Workers  
> **Última actualización:** Mayo 2026  

---

## 🎯 Visión General

Sistema de punto de venta especializado para salones de pool y billar, con gestión de mesas en tiempo real, facturación dual (horas + piñas), comandas, caja, inventario, contactos y reportes financieros. Diseñado para funcionar 100% offline con sincronización en la nube mediante Supabase. Preparado para replicarse en múltiples locales.

---

## 📊 Estado del Proyecto (Mayo 2026)

| Área | Estado | Notas |
|------|--------|-------|
| Plano Interactivo de Mesas | ✅ Producción | Layout fiel al local real |
| Panel Contextual Operativo | ✅ Producción | Quick actions, pre-cuenta, cobro |
| Transferencias y Fusiones | ✅ Producción | Mover sesión + consumos entre mesas |
| Hardening Operativo | ✅ Producción | Mutex anti-spam, safety gates de saldo |
| Motor de Ventas (POS) | ✅ Producción | RPC transaccional, cola offline |
| Inventario de Barra | ✅ Producción | Stock, lotes, escáner de barras |
| Caja Registradora | ✅ Producción | Apertura, cierre ciego, reportes |
| Sistema de Roles (PIN) | ✅ Producción | 4 roles, SHA-256, guards por ruta |
| Contactos / CRM | ✅ Producción | Clientes, proveedores, fiados |
| Deudas de Empleados | ✅ Producción | Fiado staff con abonos parciales |
| Facturación Dual | ✅ Producción | `hours_paid` + `seat.timeCharges[]` |
| Tickets Térmicos 58mm | ✅ Producción | ESC/POS + PDF, logo dinámico |
| PWA Offline-First | ✅ Producción | Instalable, Service Worker |
| Configuración Multi-local | ✅ Producción | `venueConfig.js` centralizado |

---

## ✅ Fases Completadas

### FASE 0 — Infraestructura Base ✅
- [x] Branding en toda la app
- [x] Motor de ventas con RPC `process_checkout`
- [x] Cola offline (`offlineQueueService.js`)
- [x] Sincronización P2P (`useCloudSync.js`)
- [x] Tickets térmicos 58mm con logo dinámico

### FASE 1 — Autenticación por PIN y Roles ✅
- [x] Tabla `staff_users` en Supabase
- [x] Store de autenticación con caché offline
- [x] Hashing SHA-256 vía Web Crypto API
- [x] `LoginScreen.jsx` + `PinPad.jsx`
- [x] Guards de ruta por rol (ADMIN / CAJERO / MESERO / BARRA)

### FASE 2 — Plano Interactivo de Mesas ✅
- [x] `FloorPlanView` con layout fiel al local real
- [x] `TableCard.jsx` con timer regresivo y precio
- [x] Modos: Prepagado por Horas / Piña
- [x] Mesas tipo NORMAL (bar) sin cobro por tiempo
- [x] Sincronización Supabase Realtime

### FASE 2.5 — Refinamiento Administrativo ✅
- [x] CRUD de mesas (añadir/editar/cambiar nombre)
- [x] Filtros combinados Tipo × Estado
- [x] UI optimizada para móviles (sticky filters)

### FASE 2C — Panel Contextual Operativo ✅
- [x] `TableContextPanel` como centro operativo por mesa
- [x] Quick actions: abrir mesa, sumar tiempo, agregar consumo
- [x] Consumo inline desde el plano (sin ir a otro módulo)
- [x] Pre-cuenta desde el contexto de la mesa
- [x] Diseño responsive (móvil, tablet, laptop, PC)

### FASE 3 — Cobro y Cierre desde el Plano ✅
- [x] Generar pre-cuenta desde `FloorPlanView`
- [x] Enviar mesa a cola de cobro
- [x] Procesamiento de pago con `CashierPaymentModal`
- [x] Cierre de sesión y liberación de mesa
- [x] Ticket de cierre con desglose de tiempo + consumo

### FASE 3.1 — Hardening Operativo ✅
- [x] Mutex `isMutating` en botones críticos (anti-double-tap)
- [x] Safety gate de saldo antes de liberar mesa
- [x] Efectos reactivos que cierran paneles cuando la sesión desaparece
- [x] Estados visuales: EXCEDIDO, checkout (color + borde + animación)
- [x] Sync remoto reactivo para cambios desde otros dispositivos

### FASE 4 — Transferencias y Fusiones ✅
- [x] Transferir sesión completa entre mesas (tiempo + consumo + seats)
- [x] Fusionar consumos de dos mesas en una
- [x] Protección contra transferencias a mesas ocupadas
- [x] Actualización de estados en tiempo real post-transferencia

### FASE 5 — Inventario de Barra ✅
- [x] Catálogo con precios COP
- [x] Lotes/bultos con precio unitario calculado
- [x] Alertas de stock bajo configurables
- [x] Escáner de código de barras

### FASE 6 — Refactorización de Código ✅
- [x] 7 vistas refactorizadas
- [x] 7+ hooks extraídos
- [x] 5+ componentes nuevos
- [x] Build verificado green

### FASE 7 — Onboarding ✅
- [x] SpotlightTour por rol y sección
- [x] Tours contextuales en formularios

### FASE 8 — Gestión Avanzada de Usuarios ✅
- [x] Activar/desactivar/eliminar usuarios
- [x] Permisos delegables

### FASE 9 — Gestión de Contactos ✅
- [x] CRM: Clientes / Proveedores / Empleados
- [x] Fiados con abonos parciales

### FASE 10 — Deudas de Empleados ✅
- [x] `staff_debts` + `staff_debt_payments`
- [x] Filtros: Todos / Pendientes / Pagadas
- [x] Badge de deuda en UsersManager

### FASE 11 — Motor de Facturación Dual ✅
- [x] `tableBillingEngine.js` con parámetro `seats`
- [x] Timer countdown usando `totalHoursPaid = hours_paid + seatHours`
- [x] Grand total incluye `seatTimeCost`
- [x] Restar horas: LIFO desde seat `timeCharges`, luego `hours_paid`

### FASE 12 — Consolidación de Producto ✅
- [x] `venueConfig.js` — configuración centralizada del local
- [x] README.md comercial + técnico
- [x] ROADMAP.md actualizado
- [x] SETUP_NUEVO_LOCAL.md — guía de replicación

---

## 🔮 Fases Futuras (Propuestas)

### FASE 13 — Reservas y Agenda
> **Impacto:** Alto · **Complejidad:** Media

- [ ] Calendario visual de reservas por mesa
- [ ] Bloqueo automático de mesa reservada 15 min antes
- [ ] Notificación al mesero cuando el cliente llega
- [ ] Historial de reservas por cliente
- [ ] Indicador visual en el plano: "Reservada a las 8:00pm"

### FASE 14 — Editor Visual de Layout
> **Impacto:** Alto · **Complejidad:** Alta

- [ ] Drag-and-drop para reposicionar mesas en el plano
- [ ] Agregar/quitar mesas desde el plano (sin tocar código)
- [ ] Guardar layout personalizado por local en Supabase
- [ ] Templates de layout predefinidos (L, U, rectangular)
- [ ] Exportar/importar layouts entre locales

### FASE 15 — Multi-Tenant Completo
> **Impacto:** Alto · **Complejidad:** Alta

- [ ] Cada local = un `tenant_id` en Supabase
- [ ] Admin Master puede ver métricas de todos los locales
- [ ] Catálogo de productos compartido o independiente por local
- [ ] Reportes consolidados multi-local
- [ ] Panel de administración central (web)

### FASE 16 — Reportes Avanzados y BI
> **Impacto:** Medio · **Complejidad:** Media

- [ ] Gráficas de venta por día/semana/mes (Chart.js o similar)
- [ ] Horas pico por mesa (heatmap)
- [ ] Ranking de productos más vendidos
- [ ] Margen de ganancia por categoría
- [ ] Exportar reportes a Excel/CSV

### FASE 17 — Fidelización de Clientes
> **Impacto:** Medio · **Complejidad:** Baja

- [ ] Sistema de puntos por visita
- [ ] Horas gratis después de N visitas
- [ ] Descuento automático para clientes frecuentes
- [ ] Registro por QR (el cliente escanea para acumular)
- [ ] Ranking "Mejores clientes del mes"

---

## 🏗️ Arquitectura Técnica

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

---

## 📐 Reglas Inamovibles del Sistema

1. **Offline-First**: Toda acción funciona sin internet. La sincronización es eventual.
2. **PIN Hasheado**: SHA-256 vía Web Crypto API. Nunca texto plano.
3. **Doble Partida**: Cada venta genera débito/crédito para integridad contable.
4. **Impresora 58mm**: Documentos optimizados para papel térmico 58mm.
5. **Moneda configurable**: La moneda base se define en `venueConfig.js`.
6. **RLS Permisivo**: Seguridad en Guards del cliente, no en políticas RLS.
7. **Solo horas prepagadas**: Modo libre deshabilitado; solo prepagado.
8. **venueConfig.js es la verdad**: Ningún parámetro del negocio se hardcodea fuera de este archivo.
