# Modo Libre - Codigo Archivado

> **Fecha de archivo**: 2026-04-18
> **Razon**: Eliminado del sistema por decision del negocio. Guardado para posible uso futuro.

## Descripcion
El "modo libre" permitia abrir una mesa de billar sin prepagar horas. El sistema media el tiempo jugado y calculaba el costo por minuto al momento de cobrar, usando la tarifa por hora configurada.

## Deteccion (tableBillingEngine.js)
```javascript
// Libre: game_mode NORMAL sin horas prepagadas y sin seat-level hours → cobro por minuto
let libreCost = 0;
const seatHasHours = (seats || []).some(s => (s.timeCharges || []).some(tc => tc.type === 'hora'));
const isLibre = gameMode === 'NORMAL' && hoursPaid === 0 && !seatHasHours;
if (isLibre && elapsedMinutes > 0) {
    const pricePerHour = config.pricePerHour || 0;
    libreCost = round2((elapsedMinutes / 60) * pricePerHour);
}
```

## Conversion a Bolivares (tableBillingEngine.js)
```javascript
if (libreCost > 0) {
    const priceBs = config.pricePerHourBs || parseFloat(localStorage.getItem('pool_price_per_hour_bs')) || 0;
    const priceUsd = config.pricePerHour || 0;
    if (priceBs > 0 && priceUsd > 0) {
        libreCostBs = round2(libreCost * (priceBs / priceUsd));
    } else {
        libreCostBs = round2(libreCost * (tasaBCV || 1));
    }
}
```

## Calculo por seat legacy (tableBillingEngine.js)
```javascript
if (seat.gameMode === 'LIBRE') {
    return calculateSessionCostBreakdown(elapsedMinutes, 'NORMAL', config, 0, 0);
}
```

## Items en carrito de checkout (useSalesCheckout.js)
```javascript
if (seatTimeCost.libreCost > 0) {
    syntheticCart.push({
        id: crypto.randomUUID(),
        name: `Tiempo libre ${tableName}`,
        priceUsdt: round2(seatTimeCost.libreCost),
        priceUsd: round2(seatTimeCost.libreCost),
        qty: 1, costUsd: 0, costBs: 0,
        category: 'servicios', unit: 'servicio', stock: 9999
    });
}
```

## UI: Boton en OpenWizardModal
```jsx
{/* Boton Libre temporalmente deshabilitado */}
<button
    onClick={() => setSelectedHours(0)}
    className={`w-full text-left p-3 rounded-xl border transition-all ${
        selectedHours === 0
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400 text-emerald-700 dark:text-emerald-400'
            : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 text-slate-600 dark:text-slate-300'
    }`}
>
    <div className="font-black text-sm">Abierta (Libre)</div>
    <div className="text-xs opacity-70">Sin limite, cobro al final</div>
</button>
```

## UI: Etiqueta en TableCard.jsx
```javascript
costBreakdown?.isLibre ? 'ABIERTA' : 'JUG.'
```

## UI: Ocultar boton "+ Hora" en modo libre (TableCardActions.jsx)
```javascript
{!hasHoursActive && !costBreakdown?.isLibre && (
    <button onClick={onAddHoursModal}>+ Hora</button>
)}
```

## UI: Resumen en wizard (OpenWizardModal.jsx)
```javascript
// Mostraba "Libre" cuando selectedHours === 0
{modeHora && <span>{selectedHours === 0 ? 'Libre' : ...}</span>}
```

## Flujo
1. Usuario abre mesa → selecciona "Por Hora" → NO elige tiempo → `selectedHours = 0`
2. Se abre con `game_mode = 'NORMAL'` y `hours_paid = 0`
3. `isLibre = true` en billing engine
4. Timer corre, calcula `libreCost = (elapsedMinutes / 60) * pricePerHour`
5. Al cobrar, se agrega "Tiempo libre" al carrito sintetico
