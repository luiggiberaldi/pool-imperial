# Plan optimizado: Itemizar productos compartidos al dividir cuenta de mesa (÷N)

> **Estado**: ✅ IMPLEMENTADO y verificado (18 checks nuevos + 43 de regresión pasan)
> **Fecha**: 26-Jul-2026
> **Auditado contra**: venta real #905 (Pool 2 ÷2) y venta #852 (B13 ÷2, cierre #45)

---

## 1. Problema

Al cobrar una mesa con **"Cobrar todo dividido"** (`!seatId && seats.length > 0` en
`buildTableSyntheticCart`, [src/utils/tableBillingEngine.js](src/utils/tableBillingEngine.js#L503)),
los productos consumidos **sin asiento asignado** (`seat_id: null`) se funden dentro del precio
de las N líneas `Compartido Mesa (÷N)` junto con el tiempo de juego.

**Consecuencias confirmadas:**

| Síntoma | Estado | Evidencia |
|---------|--------|-----------|
| Productos invisibles en ticket / venta guardada | ✅ Real | Venta #905: $158.000 de productos ocultos en 2× "Compartido Pool 2 (÷2)" @ $102.750 |
| No aparecen en "Movimiento de Productos" del cierre ni Top Productos | ✅ Real | Esos reportes leen `sale.items` |
| ~~No se descuenta el inventario~~ | ❌ **FALSO** | El stock se descuenta al **agregar a la comanda** ([OrderPanel.jsx:166-168](src/components/tables/OrderPanel.jsx#L166-L168)), con reversión al eliminar |

**Ejemplo (venta #905):** total $205.500 = $47.500 tiempo + $158.000 productos.
Items guardados: solo `2× Compartido Pool 2 (÷2) @ $102.750`. Debió verse: tiempo ÷2 + cada producto.

---

## 2. Cambios a implementar

### Cambio 1 — Línea "Compartido" solo con la porción de tiempo

En la rama "cobrar todo dividido" (~[tableBillingEngine.js:571-579](src/utils/tableBillingEngine.js#L571-L579)),
el precio de cada línea `Compartido (÷N)` pasa a representar **solo tiempo**:

```js
if (seatBd.sharedPortion > 0) {
    const timeRatio = (fullBreakdown.sharedTotal > 0)
        ? Math.min(1, fullBreakdown.sharedTimeTotal / fullBreakdown.sharedTotal)
        : 1;
    const timePortion = round2(seatBd.sharedPortion * timeRatio);
    if (timePortion > 0) {
        syntheticCart.push({
            id: crypto.randomUUID(),
            name: `Compartido ${tableName} (÷${divisorLabel})`,
            priceUsdt: timePortion, priceUsd: timePortion,
            qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999,
            gameMeta: buildSharedGameMeta(fullBreakdown, divisorLabel, seatBd.sharedPortion)
        });
    }
}
```

Nota: el precio de la línea queda igual a `gameMeta.hoursRevenue + roundsRevenue`,
lo que simplifica los reportes de actividad de juego (ya usan `gameMeta`).

### Cambio 2 — Itemizar los productos compartidos UNA sola vez

Después del `unpaidSeatBds.forEach(...)` (~línea 581), agregar los `fullBreakdown.sharedItems`
con su precio completo y su `product_id` real (mismo patrón que ya usa `seatBd.items` en
las líneas 564-570):

```js
if (fullBreakdown.sharedItems?.length > 0) {
    fullBreakdown.sharedItems.forEach(item => {
        const p = products.find(prod => prod.id === item.product_id);
        syntheticCart.push(p
            ? { ...p, priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd),
                qty: Number(item.qty), costBs: 0, costUsd: p.costUsd || 0, exactBs: 0 }
            : { id: item.product_id, name: item.product_name || 'Producto',
                priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd),
                qty: Number(item.qty), costBs: 0, costUsd: 0, unit: 'unidad', category: 'otros', stock: 9999 }
        );
    });
}
```

**Verificación matemática**: `N × timePortion = sharedTimeTotal` ✓ + `Σ sharedItems = sharedConsumptionTotal` ✓
→ total idéntico al actual (± centavos de redondeo, cubiertos por la tolerancia de ±$5 de
[useSalesCheckout.js:179](src/hooks/useSalesCheckout.js#L179)).

### Cambio 3 — Guard para pots compartidos parcialmente pagados ⚠️ (agregado en auditoría)

Si un asiento **ya pagó su parte** del compartido (flujo "retirar cliente" → `RETIRED_PAID_SHARED`
en las notas de sesión, o `seat.paid: true` por pago individual), ese pago incluyó su porción de
productos de forma fusionada. Itemizar después los productos a precio completo los **cobraría dos veces**.

```js
const sharedFullyUnpaid = (fullBreakdown.retiredPaidShared || 0) === 0
    && fullBreakdown.seats.every(sb => !sb.seat.paid);
```

- `sharedFullyUnpaid === true` → aplicar Cambios 1 y 2 (caso normal, el más común).
- `sharedFullyUnpaid === false` → mantener el comportamiento actual (líneas Compartido
  fusionadas con `remainingSharedTotal`), que ya descuenta lo pagado correctamente.

---

## 3. Lo que NO se debe hacer (descartado en auditoría)

### ❌ NO quitar `skipStockDeduction: true`

El plan original proponía eliminarlo de [useSalesCheckout.js:192](src/hooks/useSalesCheckout.js#L192).
**Esto causaría doble descuento de inventario**:

1. El stock de mesas se descuenta al **agregar el producto a la comanda**
   ([OrderPanel.jsx:168](src/components/tables/OrderPanel.jsx#L168) → `adjustStockForProduct(id, -1)`),
   se revierte al eliminar el item, y valida stock disponible al agregar.
2. `skipStockDeduction: true` en el checkout existe precisamente para no descontar dos veces.
3. Si se quitara, **también** los productos por asiento (ya itemizados hoy) se descontarían doble
   en todos los cobros de mesa.
4. [CashierPaymentModal.jsx:371](src/views/CashierPaymentModal.jsx#L371) es otro camino de cobro de
   mesas con el mismo flag — tampoco se toca.

El objetivo del plan (visibilidad en Kardex/reportes del cierre) **se logra solo con el Cambio 2**:
los reportes leen `sale.items`, no tocan el stock.

### 🔜 Rama per-seat individual (PR futuro)

El cobro por asiento individual (`seatId && seats.length > 0`, línea ~490) tiene el mismo bug
(su `Compartido` fusiona tiempo + productos). Se aborda en un segundo PR. El Cambio 3 evita
inconsistencias cruzadas entre ambas ramas mientras tanto.

---

## 4. Archivos afectados

| Archivo | Acción |
|---------|--------|
| `src/utils/tableBillingEngine.js` | Cambios 1, 2 y 3 (solo rama "cobrar todo dividido") |
| `src/hooks/useSalesCheckout.js` | **Sin cambios** (el flag se queda) |
| `src/utils/checkoutProcessor.js` | Sin cambios |
| `src/views/CashierPaymentModal.jsx` | Sin cambios (usa el mismo motor, hereda el fix) |
| Generadores de tickets / reportes | Sin cambios (leen `sale.items`) |

---

## 5. Plan de verificación

### Script automatizado (`scratch/verify_shared_items.js`, patrón Vite SSR existente)

1. **Caso #905**: sesión POOL 2 asientos, tiempo compartido $47.500 + productos sin asiento $158.000
   → carrito debe tener 2× Compartido @ $23.750 + productos itemizados; subtotal = $205.500 exacto.
2. **Solo tiempo, sin consumo** → idéntico al comportamiento actual.
3. **Solo consumo, sin tiempo** (mesa NORMAL) → sin línea "Compartido"; solo productos.
4. **Pot parcialmente pagado** (`retiredPaidShared > 0` o un `seat.paid`) → comportamiento
   fusionado actual; total = `remainingSharedTotal` + porciones, sin duplicar.
5. **Con descuento** → total con descuento idéntico al previo al fix.
6. **Regresiones**: `scratch/verify_offsets_fix.js` (6 checks) y `scratch/verify_gamestats.js`
   (15 checks) deben seguir pasando.

### Verificación manual en la app

1. Mesa de pool con tiempo + 1 Poker + 1 LIKE **sin asignar asiento** → cobrar ÷2.
2. Ticket: 2× "Compartido (÷2)" (solo tiempo) + "1u Poker" + "1u LIKE"; total idéntico al de pantalla.
3. Kardex: el stock NO debe moverse al cobrar (ya se descontó al agregar a la comanda) — comparar
   stock antes de agregar vs después de cobrar: exactamente −1 por producto, no −2.
4. Reporte de cierre: Poker y LIKE aparecen en "Movimiento de Productos" y Top Productos.
5. Retirar un cliente pagando su parte y luego cerrar la mesa → el total combinado de ambas
   ventas = total original de la mesa (sin duplicados).
