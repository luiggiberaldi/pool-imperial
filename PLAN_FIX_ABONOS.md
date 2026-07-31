# Plan de fixeo: Flujo de Abonos — errores, mitigaciones, guardarraíles y arneses

> **Estado**: ✅ IMPLEMENTADO (Fases 1-3) — arnés `scratch/verify_abonos_fix.js` 21 checks + 61 de regresión pasan
> **Fecha**: 27-Jul-2026
> **Origen**: Auditoría e2e del flujo completo de abonos (solicitud → cobro → historial → cierre final → reportes → anulación)

---

## 0. Mapa del flujo auditado

```
AbonoSelectorModal (mesero)            CashierPaymentModal / useSalesCheckout (caja)
  escribe |||ABONO:| o |||ABONO_MONTO:|  cobra el abono → venta "Abono Parcial…" o items
  + requestCheckout (status CHECKOUT)    → borra/reduce items de comanda (sin tocar stock ✓)
                                          → escribe HISTORIAL_ABONOS + limpia tags
                                          → sesión vuelve a ACTIVE
Cierre final (2 caminos)
  useCheckoutPayments (SalesView)  → netToPay = total − getDeductibleAbonoTotal
  CashierPaymentModal (caja)       → inyecta pagos isAbonoPrevio (motor los excluye)
Reportes  → ya corregidos (isNonProductSaleItem, computeIncomeBreakdown, netos)
Anulación → voidSaleProcessor (⚠️ ignora abonos)
```

---

## FASE 1 — Fixes quirúrgicos (pérdida directa de dinero)

### E1 🔴 Doble descuento de abonos en cobro por asiento desde caja

**Bug**: [CashierPaymentModal.jsx:177-186](src/views/CashierPaymentModal.jsx#L177-L186) calcula
`priorAbonoHistory` sin excluir `seatId`; [useCheckoutPayments.js:47](src/hooks/useCheckoutPayments.js#L47)
sí lo excluye. Mesa con abono monto-libre + cobro por asiento desde caja → el abono se
descuenta del primer asiento **y otra vez** en el siguiente o en el cierre final.

**Fix**:
```js
// CashierPaymentModal.jsx ~línea 178
const priorAbonoHistory = (() => {
    if (isAnyAbono || seatId) return [];   // ← agregar `|| seatId`
    ...
```

**Mitigación / guardarraíl**:
- El descuento de abonos queda EXCLUSIVO del cierre definitivo de mesa completa en ambos
  caminos — regla documentada en comentario junto al guard en ambos archivos, con referencia
  cruzada (`// mantener sincronizado con useCheckoutPayments.js:47`).
- **Guardarraíl estructural (FASE 3)**: helper único `getPriorAbonoContext(session, { seatId, isPartial })`
  en `tableBillingEngine.js` usado por ambos modales — elimina la divergencia por construcción.

**Arnés**: `scratch/verify_abono_seat_guard.js`
- Sesión con `HISTORIAL_ABONOS` deducible de $50.000 → contexto con `seatId` ⇒ descuento **0**;
  contexto de mesa completa ⇒ descuento **$50.000**; contexto `isPartial` ⇒ **0**.

---

### E3 🔴 `skipStockDeduction` no se persiste → anular ventas de mesa infla el stock

**Bug**: [checkoutProcessor.js:239-275](src/utils/checkoutProcessor.js#L239-L275) no guarda el
flag en la venta; [voidSaleProcessor.js:24](src/utils/voidSaleProcessor.js#L24) lo lee de
`sale.skipStockDeduction` (siempre `undefined`) → anular cualquier venta de mesa "restaura"
stock que la venta nunca descontó (el descuento fue en la comanda). Afecta items de asiento,
abonos por items y los compartidos itemizados.

**Fix**: persistir el flag en el objeto `sale`:
```js
// checkoutProcessor.js — dentro de const sale = { ... }
skipStockDeduction: !!skipStockDeduction,
```

**Mitigaciones**:
- **Ventas históricas** (sin el campo): `processVoidSale` debe tratar `undefined` de venta de
  mesa como skip: `const skipRestore = sale.skipStockDeduction ?? !!sale.tableSessionId;`
  (toda venta con `tableSessionId` descontó stock vía comanda, nunca vía venta).
- El campo debe sobrevivir el mapeo de persistencia y el sync (verificar que llegue al payload
  de `broadcastNewSale` y a la nube — mismo patrón que se usó con `gameMeta`).

**Arnés**: `scratch/verify_void_stock.js`
- Venta de mesa (con `tableSessionId`, flag true) → `processVoidSale` ⇒ stock **sin cambios**.
- Venta de mostrador normal (flag false) → anular ⇒ stock **restaurado** (comportamiento actual ✓).
- Venta de mesa legacy sin el campo pero con `tableSessionId` ⇒ stock **sin cambios** (fallback).

---

## FASE 2 — Anulación consciente de abonos

### E2 🔴 Anular una venta de abono no revierte el historial ni la comanda

**Bug**: [voidSaleProcessor.js](src/utils/voidSaleProcessor.js) no sabe de abonos:
1. Anular la venta del abono deja el `HISTORIAL_ABONOS` en la sesión → el cierre final sigue
   descontando un abono que ya no existe → pérdida para la casa.
2. En abono por items, los productos eliminados de la comanda no se restauran → nunca se cobran.

**Fix** (en `processVoidSale`, tras marcar ANULADA):
1. Detectar venta de abono: `sale.tableSessionId` + sesión aún ACTIVA + (item `abono-monto-libre`
   o match de entrada en el historial por monto+fecha ±5 min).
2. Si la sesión sigue activa:
   - Remover la entrada correspondiente del `HISTORIAL_ABONOS` (vía `parseSessionNotes` /
     `serializeSessionNotes` — ya existen).
   - Si `itemsRemoved: true`: reinsertar los items en la comanda (`addItemToSession`) **sin**
     re-descontar stock (el stock nunca se devolvió — coherente).
3. Si la sesión ya cerró: **no** tocar nada y registrar en bitácora que el abono anulado
   pertenece a una mesa cerrada (ajuste manual de caja).

**Mitigaciones / guardarraíles**:
- La reversión del historial es **best-effort con confirmación**: si no se puede identificar la
  entrada de forma inequívoca, mostrar diálogo al usuario listando las entradas del historial
  para elegir cuál revertir (nunca adivinar en silencio).
- Registrar SIEMPRE en `logEvent` la reversión (`ABONO_ANULADO`, con sessionId y monto) para
  auditoría.
- Idempotencia: si la entrada ya no está en el historial (otro dispositivo la quitó), no fallar.

**Arnés**: `scratch/verify_void_abono.js`
- Abono monto-libre $50.000 cobrado → anular la venta ⇒ historial sin la entrada ⇒
  `getDeductibleAbonoTotal` = 0 ⇒ cierre final cobra el total completo.
- Abono por items (2 cervezas) → anular ⇒ items de vuelta en la comanda con qty original,
  stock **sin cambios**.
- Anular con sesión ya cerrada ⇒ ventas/notas intactas, solo log.

### E5 🟠 Advertencia al anular una MESA con abonos cobrados

**Fix**: en los flujos de anulación de sesión (TableContextPanel / TableCard `ANULACION`),
si `parseSessionNotes(session.notes).historial.length > 0`, exigir confirmación explícita:
_"Esta mesa tiene $X en abonos ya cobrados en caja. Anularla NO devuelve ese dinero. ¿Continuar?"_

**Arnés**: manual (UI) — abrir mesa, abonar, intentar anular ⇒ debe aparecer el aviso con el monto.

---

## FASE 3 — Exactitud y robustez

### E4 🟠 Pagos `isAbonoPrevio` inyectados con monto bruto (incluye propina)

**Bug**: el descuento usa `netAmount`, pero la inyección usa `h.amount` / `h.methods` brutos —
[CashierPaymentModal.jsx:281](src/views/CashierPaymentModal.jsx#L281),
[useCheckoutPayments.js:232-248](src/hooks/useCheckoutPayments.js#L232-L248),
y `methods` se guarda bruto en [CashierPaymentModal.jsx:422](src/views/CashierPaymentModal.jsx#L422).
El neto de la venta final queda subestimado por la porción de propina de los abonos.

**Fix**: inyectar con `Number(h.netAmount ?? h.amount)` en los 3 puntos, y guardar en `methods`
montos netos (o proporcionales al neto cuando hay varios métodos).

**Invariante a preservar (guardarraíl matemático)**:
```
Σ(pagos no-abono) + fiado + Σ(isAbonoPrevio) == totalCop de la venta   (±$1)
```
El arnés lo valida — hoy se rompe justo cuando el abono llevó propina.

**Arnés**: extender `scratch/verify_abonos_reportes.js`
- Abono $50.000 + 10% svc (historial: amount 55.000 / netAmount 50.000) → cierre de mesa de
  $100.000 ⇒ pago inyectado = **50.000**, neto de la venta final = **50.000**,
  `computeIncomeBreakdown.totalCalculado` global = 105.000 (100 consumo + 5 propina).

### Helper unificado (guardarraíl estructural de E1)

`getPriorAbonoContext(session, { seatId = null, isPartial = false })` en `tableBillingEngine.js`:
retorna `{ deductibleTotal, entries, injectablePayments }` con las reglas centralizadas
(guard de seatId/isPartial, netAmount, filtro itemsRemoved). Ambos modales lo consumen;
los cálculos inline actuales se eliminan.

### M2 🟡 `itemsRemoved` optimista si falla el borrado de comanda

**Fix**: en ambos flujos de cobro de abono por items, acumular el resultado real del borrado y
escribir `itemsRemoved: <todosEliminados>`; si fue parcial, registrar en el historial los items
que quedaron (`pendingItems`) y avisar con toast. Evita que el cliente pague dos veces items
que no salieron de la comanda.

### M1/M3 🟡 Mejoras menores (sin urgencia)

- `getAbonoBreakdown`: mantener heurística solo como fallback legacy; las entradas nuevas ya
  llevan `netAmount` explícito — degradación natural.
- Concurrencia de `session.notes` (last-write-wins): riesgo aceptado y documentado; mitigación
  futura si se observa en producción: mover `HISTORIAL_ABONOS` a una columna/array propia de
  `table_sessions` con merge por entrada (id único por abono).

---

## Orden de ejecución y verificación global

| Fase | Fixes | Riesgo | Verificación |
|------|-------|--------|--------------|
| 1 | E1 (guard seatId) + E3 (persistir flag + fallback legacy) | Muy bajo (2 líneas + fallback) | Arneses nuevos + regresiones |
| 2 | E2 (reversión de abonos al anular) + E5 (warning) | Medio (toca anulación) | Arnés void + prueba manual |
| 3 | E4 (netos) + helper unificado + M2 | Bajo | Invariante de pagos + regresiones |

**Regresiones obligatorias tras cada fase** (todas ya existentes en `scratch/`):
- `verify_abonos_reportes.js` (22 checks)
- `verify_gamestats.js` (15 checks)
- `verify_offsets_fix.js` (6 checks)
- `verify_shared_items.js` (18 checks)
- `npm run build`

**Prueba manual e2e final** (con caja de prueba):
1. Abrir mesa POOL con 2 clientes, tiempo + productos.
2. Abonar $X monto-libre → cobrar en caja → verificar historial en pre-cuenta.
3. Cobrar un asiento desde caja → verificar que NO descuenta el abono (E1).
4. Cierre final de mesa → verificar descuento exacto del abono y pago inyectado neto (E4).
5. Anular la venta del abono ANTES del cierre → verificar historial revertido y recobro completo (E2).
6. Anular la venta final → verificar stock sin cambios (E3).
7. Cierre de caja → cuadre, desglose de ingresos y actividad de juego exactos.
