# Plan de fixeo: auditoría de reportes, filtros y rangos

> **Estado:** IMPLEMENTACIÓN PRINCIPAL APLICADA — incluye blindaje de rangos, scopes, purga visible, cierres vinculados, totales y exportaciones.
> **Fecha:** 18-Ago-2026 (auditoría e implementación)
> **Alcance:** `ReportsView`, `useReportsData`, `reportsProcessor`, `dateHelpers`, `FinancialEngine`, sincronización de ventas, historial de cierres y exportaciones PDF.

## 1. Resumen ejecutivo

Los reportes actualmente funcionan para los casos simples, pero mezclan cuatro responsabilidades en una misma colección local:

- ventas y ventas fiadas;
- cobros de deuda;
- egresos y ajustes;
- aperturas y cierres de caja.

Además, cada parte usa reglas distintas para fechas, totales y estados. El mayor riesgo es que la pantalla, el PDF y el cuadre de caja presenten cifras diferentes para el mismo filtro.

### Prioridad inmediata

1. Corregir el rango **Turno Actual** y su actualización en tiempo real.
2. Definir un huso horario comercial único y validar rangos personalizados.
3. Impedir que **Purgar anuladas** elimine operaciones fuera del filtro visible.
4. Reemplazar la heurística de reapertura de caja por un vínculo durable con el cierre seleccionado.
5. Separar transacciones de ventas, movimientos de caja, inventario y cierres.

---

## 2. Hallazgos de la auditoría

### P0 — Integridad de datos y dinero

#### R-01 — `Turno Actual` puede quedar obsoleto y acepta ventas futuras

**Ubicación:** `src/hooks/useReportsData.js`, `src/utils/reportsProcessor.js`.

- El hook lee `useCashStore.getState().activeCashSession`, pero `activeCashSession` no está en las dependencias del `useMemo`.
- Si la caja se abre o se cierra mientras Reportes está montado, el cálculo puede conservar el turno anterior.
- El filtro compara timestamps como strings (`s.timestamp >= sessionOpenedAt`) en vez de comparar milisegundos.
- No existe límite superior; una venta con timestamp futuro podría entrar al turno.
- Timestamps legacy con distintos offsets pueden ordenarse mal por comparación lexicográfica.

**Riesgo:** métricas y cuadre de turno incorrectos, especialmente después de abrir/cerrar caja desde otro dispositivo.

**Fix:** pasar `activeCashSession` como dependencia explícita y usar un predicado temporal por epoch:

```text
opened_at <= sale.timestamp < closed_at || ahora
```

Validar también cuenta, estado y `cash_session_id` cuando exista.

---

#### R-02 — Fechas dependientes del dispositivo y rangos ambiguos

**Ubicación:** `src/utils/dateHelpers.js`, `src/utils/reportsProcessor.js`.

- `getLocalISODate()` usa la zona horaria del dispositivo.
- Dos dispositivos del mismo negocio pueden asignar una venta a días distintos.
- `Hoy`, `Ayer`, `Esta Semana`, `Este Mes` y `Mes Anterior` no tienen una zona comercial explícita.
- `Esta Semana` comienza el domingo; debe confirmarse si el negocio espera lunes.
- El rango personalizado permite fechas vacías, invertidas y futuras sin mostrar error.
- Un campo personalizado vacío se sustituye silenciosamente por el día actual.

**Riesgo:** ventas en los límites de medianoche desaparecen o aparecen en otro día; cierres y gráficos no coinciden entre dispositivos.

**Fix:** definir una política única, recomendada:

- zona comercial: `America/Bogota`;
- semana: lunes–domingo;
- rangos de calendario: intervalo semiabierto `[inicio, fin del día siguiente)`;
- rango personalizado inclusivo para el usuario;
- rechazar `desde > hasta`;
- limitar `hasta` al día actual o mostrar una advertencia explícita;
- conservar `fromInstant`, `toInstant`, `timezone` y `label` en un objeto normalizado.

---

#### R-03 — `Purgar anuladas` ignora el rango y el resultado visible

**Ubicación:** `src/views/ReportsView.jsx`, `src/utils/voidSaleProcessor.js`.

La pantalla muestra el botón con el número de anuladas encontradas en el filtro actual, pero `purgeAllAnnulledSales()` elimina **todas** las ventas anuladas del almacenamiento local y de la nube del usuario, incluso las de otros meses o cierres.

**Riesgo:** pérdida irreversible de historial fuera del rango mostrado.

**Fix recomendado:** cambiar el flujo a una de estas opciones:

1. `Purgar solo las anuladas visibles`, enviando explícitamente los IDs seleccionados; o
2. mantener purga global, pero cambiar el texto, pedir confirmación con el total global y exigir permiso administrativo reforzado.

La opción preferida es la primera, con auditoría de IDs eliminados y confirmación de cantidad.

---

#### R-04 — Reapertura de cierre puede abrir otra sesión de caja

**Ubicación:** `src/views/ReportsView.jsx`, `handleDeleteCierre`.

- Consulta el último `cash_sessions` cerrado sin filtrar por `user_id`.
- Compara `closed_at` con `cierreId` usando una tolerancia de cinco minutos.
- `cierreId` es un `Date.now()` generado por la UI, no una FK hacia `cash_sessions`.
- Si existen varias cuentas, dispositivos o cierres cercanos, puede reabrir una caja distinta a la seleccionada.
- Si falla la sincronización de las marcas, no queda una cola durable de reintento.

**Riesgo:** reapertura de turno equivocado y divergencia entre reportes locales y nube.

**Fix:** al abrir/cerrar caja guardar `cash_session_id` en el registro `CIERRE_CAJA` y en cada operación marcada. Al eliminar/reabrir, actualizar únicamente esa sesión, filtrada por cuenta y por ID exacto. Registrar la acción en auditoría y encolar el cambio si no hay conexión.

---

### P1 — Semántica inconsistente de filtros y reportes

#### R-05 — La pestaña “Ventas” mezcla ventas con operaciones de caja

`historySales` excluye ajustes, pero conserva aperturas, cierres, pagos a proveedores y otras operaciones. Después, el filtro `Completadas` significa simplemente `status !== 'ANULADA'`.

**Resultado:** el historial titulado “Historial de Ventas” puede contar y mostrar aperturas, cierres o egresos como ventas completadas.

**Fix:** definir scopes separados:

- `saleTransactions`: `VENTA`, `VENTA_FIADA`;
- `debtCollections`: `COBRO_DEUDA`;
- `cashFlow`: ventas, cobros y egresos;
- `inventoryMovements`: ajustes y productos vendidos;
- `closingOperations`: apertura y cierre;
- `allOperations`: vista administrativa explícita.

La pestaña Ventas debe usar `saleTransactions`; el filtro `Completadas/Anuladas` solo debe aplicarse a ventas.

---

#### R-06 — El historial de cierres no respeta completamente `Turno Actual`

`groupSalesByCierreId()` solo recibe `from` y `to`, por lo que `current_shift` termina comportándose como el día actual. No recibe la sesión de caja ni el predicado de turno.

**Fix:** el agrupador debe recibir el rango normalizado completo o un `isInRange` común. Para `Turno Actual`, filtrar por `cash_session_id`; para rangos calendario, filtrar por fecha de cierre del cierre.

---

#### R-07 — `cierreId` se usa como fecha y como identificador

Se convierte `cierreId` directamente con `new Date(cierreId)`. Funciona si siempre es un número epoch, pero es frágil para datos legacy string, IDs importados o cierres futuros con otro formato.

Además, `cierreNumbers` renumera cierres según los IDs presentes localmente; el número mostrado puede cambiar si se sincroniza historial antiguo o se elimina un cierre.

**Fix:** persistir campos separados:

```text
closure_id: UUID/TEXT estable
cash_session_id: UUID
closed_at: TIMESTAMPTZ
closure_number: INTEGER o folio persistente
```

Usar `closed_at` para filtros y presentación; usar `closure_id` para identidad.

---

#### R-08 — Total de resumen del historial no coincide con el PDF ni con el detalle

En `ReportsView`, `sumUsd` suma `s.totalUsd` directamente. El PDF usa `FinancialEngine.calculateSaleNetTotal(s)`, que descuenta pagos previos marcados como `isAbonoPrevio`. `TransactionRow` también muestra el total bruto.

**Riesgo:** la misma lista muestra un total en la franja superior y otro al descargar PDF.

**Fix:** crear una única función `getReportSaleNetTotal()` y usarla en:

- resumen de la pantalla;
- fila de transacción;
- PDF;
- cierres;
- pagos y exportaciones.

Agregar pruebas con abonos previos, descuentos, ventas fiadas y anulaciones.

---

#### R-09 — El filtro por usuario mezcla mesero y vendedor por nombre

La condición usa `(meseroNombre || vendedorNombre)` como una sola identidad. Si existe mesero, el vendedor no aparece como opción; personas con el mismo nombre se agrupan; cambios de nombre rompen el filtro.

**Fix:** filtrar por IDs (`meseroId`, `vendedorId`) y mostrar el rol. Permitir filtros independientes:

- Atendió — mesero;
- Facturó — vendedor;
- Todos.

Las comisiones deben basarse en el ID seleccionado, no en el texto del nombre.

---

### P2 — Totales de productos, impuestos y cantidades

#### R-10 — “Por Artículo” depende del catálogo actual

`allProductsSold` solo incluye items cuyo ID o nombre existe actualmente en `products`. Si un producto fue eliminado o renombrado, desaparece del reporte histórico aunque exista en la venta.

Además, agrupa por nombre, mientras otras partes agrupan por ID.

**Fix:** usar el snapshot de la venta como fuente histórica; agrupar por `productId` y conservar el nombre vendido. Si el ID no existe en catálogo, mostrar `Producto histórico` sin ocultarlo.

---

#### R-11 — Productos agrupados por nombre y descuentos no asignados

`topProducts` y `allProductsSold` suman `price * qty` bruto. No distribuyen descuentos de la venta entre sus artículos, por lo que el ingreso por artículo puede superar el total neto de la venta.

**Fix:** asignar el descuento proporcionalmente a cada línea, respetar propinas/servicios no-producto y documentar si el reporte muestra ingreso bruto o neto. La etiqueta debe ser explícita.

---

#### R-12 — Cantidades legacy/string y pesables

Varios acumuladores suman `item.qty` sin normalizar a número. Un `qty` string puede producir concatenación. En la franja de artículos se usa `.toFixed(0)`, ocultando fracciones de productos pesables.

**Fix:** normalizar cantidades con una función común:

```text
qty = Number.isFinite(Number(rawQty)) ? Number(rawQty) : 0
```

Mostrar unidades pesables con precisión configurada y totales separados por unidad/kg, no redondear todo a unidades enteras.

---

#### R-13 — Impuestos incompletos o inconsistentes

`totalTax` depende de `sale.ivaAmount`, mientras el desglose usa `sale.taxBreakdown`. Una venta que solo tenga desglose puede mostrar categorías de impuesto pero total general en cero.

**Fix:** normalizar impuestos al guardar o calcular un fallback:

```text
saleTax = ivaAmount ?? sum(taxBreakdown)
```

Usar el snapshot de tasa/tipo de impuesto de la venta para etiquetas históricas, no la configuración actual de mesas.

---

### P3 — Sincronización, UX y exportación

#### R-14 — No hay estado de frescura ni error de sincronización

Reportes marca `isLoading` como falso después de leer IndexedDB, pero el pull cloud ocurre después y no expone:

- sincronización en curso;
- última actualización exitosa;
- error de nube;
- datos locales potencialmente incompletos.

**Fix:** exponer `isSyncing`, `syncError`, `lastSyncedAt` y un botón `Actualizar`. No presentar el reporte como definitivo mientras el pull esté pendiente si la cuenta requiere datos multi-dispositivo.

---

#### R-15 — Cursor incremental de ventas puede dejar huecos

`pullNewSales()` filtra por `updated_at > last_pull` y luego guarda como cursor la hora local actual, no el máximo `updated_at` recibido. Con relojes desfasados o documentos que llegan tarde, puede saltarse filas. Las ventas existentes solo actualizan estado y marcas de cierre, no todos los campos mutables.

**Fix:** usar cursor por `(updated_at, doc_id)` o consultar desde `max(updated_at)` recibido con solapamiento seguro. Ejecutar reconciliación periódica por ventana reciente y actualizar el snapshot completo de ventas modificadas.

---

#### R-16 — Paginación no se reinicia al cambiar de rango

`currentPage` se reinicia para búsqueda, estado y usuario, pero no al cambiar rango, fecha personalizada o algunas pestañas. La página se corrige visualmente con `Math.min`, aunque el estado queda apuntando a una página antigua.

**Fix:** resetear página, venta expandida y selección dependiente al cambiar rango, `customFrom`, `customTo` o pestaña.

---

#### R-17 — Exportación de métricas usa generador de cierre diario para cualquier rango

El export de métricas llama `generateDailyClosePDF`, aunque el usuario pueda seleccionar semana, mes o rango personalizado. El PDF conserva lenguaje de “cierre de caja” y no muestra de forma consistente el rango seleccionado.

**Fix:** separar `generateMetricsReportPDF` de `generateDailyClosePDF`, o hacer que el generador reciba `rangeLabel`, `from`, `to`, tipo de reporte y fuente de datos explícita.

---

## 3. Contrato de datos propuesto

### 3.1 Rango normalizado

Crear una utilidad pura, por ejemplo `reportRangeEngine.js`:

```js
{
  kind: 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'custom' | 'current_shift',
  timezone: 'America/Bogota',
  fromDate: '2026-08-17',
  toDate: '2026-08-18',
  fromInstant: '2026-08-17T05:00:00.000Z',
  toInstantExclusive: '2026-08-19T05:00:00.000Z',
  cashSessionId: null,
  isValid: true,
  error: null,
  label: 'Esta Semana'
}
```

Todos los reportes y PDFs deben recibir este objeto, no `from`, `to` y `selectedRange` por separado.

### 3.2 Venta normalizada

Antes de calcular, normalizar legacy y nuevos formatos:

```js
{
  id,
  timestampMs,
  type,
  status,
  netTotalCop,
  grossTotalCop,
  taxesCop,
  discountCop,
  items: [{ productId, soldName, qty, unitPriceCop, netRevenueCop, isProduct }],
  cashierId,
  cashierName,
  serverId,
  serverName,
  cashSessionId,
  closureId
}
```

Esto evita que cada componente interprete `totalUsd`, `totalCop`, `amountUsd` y nombres legacy de forma distinta.

### 3.3 Scopes de reporte

El procesador debe devolver explícitamente:

```text
saleTransactions
cashFlowEntries
inventoryMovements
closingOperations
allOperations
```

Cada pestaña debe consumir solo el scope que corresponde.

---

## 4. Fases de implementación

### Fase 0 — Decisiones de negocio y seguridad

- [x] Zona horaria comercial definida como `America/Bogota`.
- [x] Semana definida de lunes a domingo.
- [x] “Turno Actual” muestra únicamente la caja abierta vinculada.
- [x] “Ventas” separa cobros de deuda del scope de ventas.
- [x] Ingreso por artículo conserva bruto y calcula ingreso neto proporcional al descuento.
- [x] Purgar anuladas se limita a los IDs visibles confirmados.

### Fase 1 — Motor puro de rangos y normalización

- [x] Implementar rango con timezone, límites semiabiertos y validación.
- [x] Implementar comparación por epoch.
- [x] Excluir timestamps inválidos y soportar formatos legacy.
- [x] Centralizar la normalización de scopes, impuestos, cantidades y líneas históricas en el procesador.
- [x] Agregar pruebas de medianoche, límites exactos, rango invertido, fechas futuras y turno.

### Fase 2 — Procesador único de reportes

- [x] Reemplazar filtros duplicados por scopes centralizados.
- [x] Separar ventas, cobros, egresos, ajustes, aperturas y cierres.
- [x] Corregir `Turno Actual` con `activeCashSession` reactivo y límite superior.
- [x] Hacer que cierres reciban el rango completo, incluida la sesión de caja.
- [x] Usar un total neto único en resumen, filas y PDFs de ventas.

### Fase 3 — Modelo durable de caja y cierres

- [x] Persistir y propagar `cash_session_id` y `closed_at`, conservando `cierreId` legacy.
- [ ] Migrar cierres legacy a un `closure_id`/`closure_number` durable en base de datos.
- [x] Reemplazar la reapertura heurística por actualización del ID exacto y estado `CLOSED`.
- [x] Filtrar la reapertura cloud por `user_id` y sesión exacta.
- [ ] Crear cola offline dedicada para marcas de cierre, reapertura y eliminación; mientras tanto las acciones destructivas offline se rechazan de forma segura.
- [x] Auditar purgas con IDs y alcance; la reapertura queda registrada por el evento de aplicación existente.

### Fase 4 — Productos, descuentos, impuestos y pagos

- [x] Agregar productos históricos aunque ya no existan en catálogo.
- [x] Agrupar por ID y conservar el snapshot de nombre/precio de la venta.
- [x] Asignar descuentos proporcionalmente a líneas.
- [x] Normalizar cantidades fraccionarias.
- [x] Unificar impuestos desde `ivaAmount`/`taxAmount` y `taxBreakdown`.
- [x] Mantener conversión COP/USD y descuentos de abonos previos en el motor financiero único.

### Fase 5 — UX y exportaciones

- [x] Validar y bloquear rangos personalizados inválidos.
- [x] Mostrar rango efectivo, estado de sincronización y última actualización.
- [x] Resetear paginación al cambiar rango/tab/filtros.
- [x] Separar export de métricas de export de cierre de caja.
- [x] Hacer que el PDF incluya los filtros y scopes visibles.
- [x] Mostrar advertencia si los datos están solo en caché local o pendientes.

### Fase 6 — Pruebas, migración y despliegue

- [x] Ejecutar matriz automatizada pura de rangos y procesador.
- [ ] Probar manualmente con dos dispositivos y zona horaria distinta.
- [ ] Comparar pantalla, PDF y cierre para el mismo dataset en un turno piloto.
- [x] Mantener compatibilidad con datos legacy en modo lectura.
- [ ] Activar los fixes detrás de una bandera si es posible.
- [ ] Revisar diferencias de totales durante un turno piloto.

---

## 5. Matriz de pruebas obligatoria

### Rangos y timezone

| Caso | Resultado esperado |
|---|---|
| Venta exactamente al inicio del día | Incluida |
| Venta exactamente al inicio del día siguiente | Excluida |
| Venta 23:59:59 en Colombia | Incluida en el día correcto |
| Dispositivo configurado en otra zona | Mismo resultado comercial |
| Hoy/Ayer alrededor de medianoche | Sin desplazamiento de día |
| Semana | Respeta el día inicial definido |
| Mes anterior en enero | Diciembre del año anterior |
| Custom vacío | Validación visible, no fallback silencioso |
| Custom `desde > hasta` | Bloqueado |
| Custom futuro | Bloqueado o advertido según política |
| Timestamp inválido | Se excluye y se reporta como dato corrupto |

### Turno y cierres

| Caso | Resultado esperado |
|---|---|
| Abrir caja mientras Reportes está abierto | El turno se recalcula inmediatamente |
| Cerrar caja mientras Reportes está abierto | Desaparece del turno actual sin recargar |
| Venta antes de abrir caja | Excluida del turno |
| Venta exactamente al abrir caja | Incluida según tolerancia definida |
| Venta futura | Excluida |
| Cierre seleccionado con varias cajas cercanas | Solo reabre su `cash_session_id` |
| Dos cuentas con cierres cercanos | No hay acceso cruzado |
| Cierre sin ventas | Se muestra u oculta según regla explícita, no por accidente |

### Estados y tipos

| Caso | Resultado esperado |
|---|---|
| Venta completada | Aparece en Ventas y métricas |
| Venta anulada | Aparece solo en filtro Anuladas y no suma |
| Cobro de deuda | Aparece en Cobros, no como venta si se separan scopes |
| Pago a proveedor | Aparece en Flujo de Caja, no en Ventas |
| Apertura/cierre | Aparece en Operaciones/Cierres, no en Ventas |
| Ajuste de inventario | Aparece en Inventario, no en Ventas |
| Purga visible | Solo elimina IDs confirmados |
| Purga global | Requiere confirmación y etiqueta explícita |

### Totales

| Caso | Resultado esperado |
|---|---|
| Venta con abono previo | Pantalla, detalle y PDF muestran el mismo neto |
| Venta con descuento | Ingreso por artículo documenta bruto/neto |
| Venta fiada mixta | Crédito y efectivo no se duplican |
| Propina/servicio | No se cuenta como producto ni inventario |
| Producto eliminado del catálogo | Sigue apareciendo por snapshot histórico |
| Producto renombrado | Agrupación por ID, nombre histórico visible |
| Cantidad `"2"` | Se interpreta como 2, no concatenación |
| Producto pesable | Conserva decimales |
| IVA solo en `taxBreakdown` | Total de impuestos coincide con desglose |
| Método USD/COP mixto | Totales se muestran en su moneda y conversión correcta |

### Sincronización y exportación

| Caso | Resultado esperado |
|---|---|
| Pull cloud pendiente | Se muestra estado de sincronización |
| Pull cloud fallido | Se conserva caché y se muestra advertencia |
| Documento con mismo timestamp | No se pierde por el cursor incremental |
| Venta anulada en otro dispositivo | Reporte se actualiza sin recargar |
| PDF con búsqueda/usuario/estado/rango | Refleja exactamente la lista visible |
| Cambio de rango en página 5 | Vuelve a página 1 |
| Sin datos | Botón de exportación deshabilitado correctamente |

---

## 6. Criterios de aceptación

1. Un mismo dataset produce los mismos totales en pantalla, PDF y cierre.
2. `Turno Actual` cambia al abrir/cerrar caja sin recargar la vista.
3. Todos los rangos usan la zona comercial definida y límites reproducibles.
4. Un rango personalizado inválido nunca ejecuta un filtro silencioso.
5. Purgar anuladas no elimina datos fuera de la selección confirmada.
6. Reabrir un cierre solo toca la caja vinculada a ese cierre.
7. La pestaña Ventas no cuenta aperturas, cierres, ajustes ni proveedores como ventas.
8. Productos eliminados, renombrados y pesables conservan su trazabilidad histórica.
9. Pantalla, detalle, pagos y PDF usan el mismo total neto.
10. La interfaz informa si el dato mostrado todavía depende de caché local.
11. Los errores de sincronización son reintentables y auditables.
12. La matriz automatizada cubre límites, estados, divisas, anulaciones y concurrencia.

---

## 7. Orden recomendado de entrega

### Sprint 1 — Blindaje P0

- R-01, R-02, R-03 y R-04.
- Tests de rangos, turno, purga y reapertura.
- No cambiar todavía el diseño visual general.

### Sprint 2 — Consistencia de reportes

- R-05 a R-13.
- Procesador central de scopes y total neto único.
- Tests de ventas, deuda, proveedores, descuentos, impuestos y productos históricos.

### Sprint 3 — Sincronización y UX

- R-14 a R-17.
- Indicador de frescura, cursor robusto, paginación y exportaciones.
- Prueba con dos dispositivos.

### Sprint 4 — Migración y despliegue

- Migrar cierres legacy.
- Activar por cuenta piloto.
- Comparar un turno completo contra el cierre manual.
- Habilitar para el resto solo después de cuadrar totales.

## 8. Rollback y observabilidad

- Mantener los campos legacy durante la migración.
- No borrar `cierreId` antiguo hasta validar `closure_id` y `cash_session_id`.
- Registrar cada diferencia entre cálculo legacy y cálculo normalizado.
- Permitir exportar un diagnóstico con rango, timezone, filtros, última sincronización y conteos por scope.
- Si aparecen diferencias de dinero, desactivar primero las acciones destructivas —purga/reapertura— sin ocultar el reporte de solo lectura.
