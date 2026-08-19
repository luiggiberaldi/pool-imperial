# Auditoría: doble transferencia de mesas Normal/Pool

**Fecha:** 18-Ago-2026
**Alcance:** transferencia de sesión completa (`ALL`) y fusión de consumo (`CONSUMPTION`) en secuencias repetidas Normal → Pool → Normal/Pool, incluyendo horas, jugadas/piñas, cargos por asiento, abonos, consumo, órdenes, pausas, offsets, offline y concurrencia.

## Veredicto ejecutivo

La primera transferencia de cada ruta está razonablemente protegida por validaciones, selector de modo, limpieza de offsets y metadata. Sin embargo, **la doble transferencia no está completamente correcta para producción**.

Se debe crear un plan de fixeo antes de confiar en secuencias como:

```text
Normal → Pool (+ horas/piñas) → Normal
Normal → Pool (+ horas/piñas) → otra Pool
Pool → Normal → Pool → Normal
```

El hallazgo principal es **P0 financiero**: un cargo congelado de tiempo se identifica por `frozen-time-${session.id}`. La sesión conserva el mismo ID durante todos los traslados, por lo que el segundo ciclo puede reutilizar el cargo del primer ciclo y omitir el nuevo tiempo Pool.

Las pruebas actuales pasan porque validan el motor puro y una fusión aislada, pero no ejecutan una secuencia persistente de dos o más transferencias sobre la misma sesión y orden.

---

## Flujo actual auditado

1. La UI determina el tipo de operación:
   - destino libre → `ALL`;
   - destino ocupado → `CONSUMPTION`.
2. `validateTableTransfer` bloquea:
   - origen inexistente, inactivo o en `CHECKOUT`;
   - destino en `CHECKOUT`;
   - múltiples sesiones activas en origen/destino;
   - `ALL` hacia destino ocupado;
   - `CONSUMPTION` hacia destino libre.
3. Se genera un `TRANSFER_OPERATION_ID` por confirmación.
4. En cruces de tipo:
   - Pool → Normal materializa tiempo pendiente como consumo fijo;
   - Normal → Pool reinicia el contexto de tiempo y exige modo si el destino está libre.
5. Los asientos y notas se fusionan en `buildConsumptionMergePayload`.
6. La sesión y la orden se actualizan mediante operaciones separadas, salvo la RPC atómica existente para Pool → Normal hacia destino Normal libre.

---

## Matriz de rutas

| Ruta | Destino libre (`ALL`) | Destino ocupado (`CONSUMPTION`) | Resultado de auditoría |
|---|---|---|---|
| Normal → Normal | Mueve sesión y orden | Copia consumo y cierra origen | Correcta en camino feliz; no atómica ante fallos |
| Normal → Pool | Reinicia reloj, aplica horas/piñas nuevas y conserva consumo | Incorpora consumo al reloj Pool existente | Correcta en camino feliz; política de cargos por asiento requiere atención |
| Pool → Pool | Mueve sesión conservando reloj y cargos | Congela tiempo fuente y fusiona consumo | Correcta en primer uso; falla al repetir si ya existe cargo congelado |
| Pool → Normal | RPC atómica si está instalada; fallback si no | Congela tiempo y fusiona consumo | Correcta en primer uso; falla al repetir con cargo congelado previo |
| Normal → Pool → Normal | El primer ciclo suele funcionar | El segundo Pool → Normal puede perder el nuevo tiempo | **P0: subcobro** |
| Normal → Pool → otra Pool | Primer modo se reinicia; luego se fusiona | Puede perder el tiempo nuevo si hay cargo congelado viejo | **P0 en fusión repetida** |
| Pool → Normal → Pool → Normal | El segundo Pool → Normal reutiliza el ID sintético anterior | Igual | **P0: el preview y el cierre divergen** |

---

## Hallazgos priorizados

### P0 — El segundo ciclo puede perder el tiempo Pool nuevo

**Evidencia:**

- `buildFrozenTimeCharge` usa:

```text
frozen-time-${session.id}
```

- El fallback de `transferSession` busca una línea existente con ese mismo `product_id` y, si existe, reutiliza su importe.
- La RPC `transfer_pool_to_normal_atomic` también busca esa misma línea y no la actualiza ni crea otra si ya existe.

**Secuencia afectada:**

```text
Normal → Pool (0.5 h) → Normal
      → Pool (1 h nueva) → Normal
```

El primer Pool → Normal puede crear una línea de `$X`. En el segundo Pool → Normal, el preview calcula `$Y` como tiempo nuevo, pero la persistencia encuentra la línea anterior y conserva `$X`. El nuevo `$Y` no queda cobrado.

**Impacto:** subcobro, divergencia entre preview, auditoría y orden, y pérdida de trazabilidad de cada traslado.

**Severidad:** crítica financiera.

---

### P0 — Las fusiones de consumo no son atómicas ni idempotentes en servidor

En `CONSUMPTION` el cliente hace, en orden:

1. copiar cada `order_item` al destino;
2. borrar la orden del origen;
3. insertar cargo congelado si corresponde;
4. actualizar notas/asientos del destino;
5. cerrar la sesión origen.

Si falla después de copiar algunos ítems, el reintento puede volver a copiarlos. Si la copia termina y falla el borrado de la orden origen, quedan dos órdenes con el mismo consumo.

El `TRANSFER_OPERATION_ID` en `notes` no protege los inserts de `order_items`. Tampoco hay una RPC transaccional para Pool → Pool, Normal → Pool, Normal → Normal ni fusiones hacia destinos ocupados.

**Impacto:** duplicación de productos, cantidades y cargos; posible doble cobro.

**Severidad:** crítica de integridad.

---

### P0 — Concurrencia incompleta entre dispositivos o pestañas

`transferInFlight` es un `Set` en memoria:

- solo protege la pestaña actual;
- la clave incluye origen y destino, por lo que dos destinos distintos pueden procesar el mismo origen simultáneamente;
- solo la RPC Pool → Normal libre bloquea filas con `FOR UPDATE`;
- las demás rutas dependen de lecturas frontend y updates separados.

**Impacto:** dos operadores pueden copiar/cerrar la misma comanda o mover la misma sesión a destinos distintos.

**Severidad:** crítica operativa.

---

### P1 — Modo “Libre (sin cargo de tiempo)” no coincide con el motor

La UI etiqueta `FREE` como:

```text
Libre (sin cargo de tiempo)
```

Pero el motor, con `game_mode = NORMAL`, `hours_paid = 0` y mesa Pool, entra en `isLibre` y calcula `libreCost` según el tiempo transcurrido y `pricePerHour`.

Si “Libre” significa “sin prepago, pero cobro por tiempo transcurrido”, el texto debe corregirse. Si significa realmente “sin cobro de tiempo”, el motor debe cambiar.

**Severidad:** alta de negocio/UX.

---

### P1 — Transferencias offline incompletas según la ruta

- `ALL` puede encolar el update de sesión y el movimiento de orden por separado.
- `CONSUMPTION` intenta crear/actualizar órdenes inmediatamente y no tiene una cola transaccional de copia de ítems.
- Pool → Normal con la RPC instalada lanza error ante fallo de red que no sea “RPC no disponible”; no siempre cae a una operación offline segura.

**Impacto:** una transferencia puede estar disponible offline según la ruta, generando comportamiento inconsistente.

**Severidad:** alta.

---

### P1 — Idempotencia de fallback depende de `notes`

El tag `TRANSFER_OPERATION_ID` se guarda en `notes`, pero otras operaciones pueden limpiar o reconstruir las notas. Por ejemplo, el reset posterior a un pago elimina tags estructurados. La tabla `table_transfer_operations` solo cubre la RPC Pool → Normal atómica, no todos los fallbacks ni fusiones.

**Severidad:** alta.

---

### P1 — Revalidación llega después de algunos efectos secundarios

En fallback Pool → Normal, el cargo congelado puede insertarse en la orden antes de la revalidación final de origen/destino. Si la sesión cambia a `CHECKOUT` o el destino se ocupa durante la espera de red, la transferencia se rechaza pero el cargo puede quedar en la orden origen.

**Severidad:** alta.

---

### P2 — Dependencia de caché para localizar la comanda

La transferencia consulta `ordersStore` local. Si la orden existe en Supabase pero aún no llegó al caché, la operación puede mover la sesión sin mover la orden. El sync posterior puede recuperar la orden con el `table_id` antiguo.

**Severidad:** media.

---

## Lo que sí funciona correctamente

- Rechazo de origen en `CHECKOUT`.
- Rechazo de destino en `CHECKOUT`.
- Rechazo de sesiones duplicadas en origen/destino.
- Prohibición de transferir a la misma mesa.
- Selector obligatorio para Normal → Pool con destino libre.
- Validación de horas en bloques de 30 minutos.
- Validación de jugadas enteras.
- Limpieza de `paid_at`, pausa y offsets en cambios de contexto.
- Reinicio de `started_at` al entrar a un nuevo contexto Normal/Pool.
- Remapeo de colisiones de `seat_id` en fusiones.
- Limpieza de `timeCharges` Pool al materializarlos como consumo.
- Conservación y combinación de historial de abonos en el camino feliz.
- Idempotencia de reintentos del mismo `operation_id` en la RPC atómica instalada.

---

## Cobertura actual de pruebas

Verificado:

```text
npm run test:table-transfers  ✅
npm run test:reports          ✅
```

Las pruebas actuales cubren:

- patches individuales;
- modos Pool;
- validaciones de origen/destino;
- colisión de asientos;
- una fusión aislada;
- preview Pool → Normal;
- cargos congelados aislados.

No cubren de forma persistente:

- Normal → Pool → Normal con dos cargos Pool;
- Normal → Pool → Pool → Normal;
- Pool → Normal → Pool → Normal;
- línea `frozen-time-*` ya existente;
- fallo entre copiar ítems y borrar origen;
- dos dispositivos ejecutando la misma fuente a destinos distintos;
- fusión offline con reintento;
- RPC atómica repetida después de un cargo congelado previo.

---

# Plan de fixeo recomendado

## Sprint P0 — Antes de habilitar doble transferencia en producción

1. **Separar cada cargo congelado por operación**
   - No reutilizar `frozen-time-${session.id}` como identidad única.
   - Usar un identificador durable por `operation_id`.
   - Reintento de la misma operación: devuelve el mismo cargo.
   - Nueva transferencia posterior: crea un nuevo cargo o actualiza un ledger acumulativo explícito.

2. **Crear una RPC única para toda transferencia/fusión**
   - Bloquear origen, destino, sesión y orden con `FOR UPDATE`.
   - Validar estados dentro de la transacción.
   - Copiar/mover ítems, metadata, asientos y sesión en una sola transacción.
   - Registrar `table_transfer_operations` para `ALL` y `CONSUMPTION`.
   - Devolver el estado final autoritativo.

3. **Eliminar efectos definitivos del cliente antes de la respuesta RPC**
   - El cliente debe construir preview y request.
   - No insertar cargos ni copiar ítems localmente como operación confirmada.
   - Tras la respuesta, reemplazar el estado local por el resultado del servidor.

4. **Agregar ledger de cargos de tiempo/traslados**
   - Guardar importe, operación, sesión, origen, destino y timestamp.
   - El saldo debe ser `generado - pagado - congelado`, no una inferencia por una línea sintética.

5. **Política offline única**
   - Si no hay RPC/servidor, encolar la intención con el mismo `operation_id`.
   - No marcar fusión como completada antes de confirmación.
   - Reintentar la misma operación, nunca crear otra clave automáticamente.

## Sprint P1 — Consistencia y UX

1. Resolver la semántica de `FREE` y corregir etiqueta o motor.
2. Reemplazar tags financieros de `notes` por columnas/JSONB durable.
3. Reconsultar órdenes y sesiones desde servidor antes de confirmar una transferencia.
4. Añadir conflictos visibles cuando otro dispositivo ganó la operación.
5. Añadir auditoría de `preview_total`, `committed_total` y diferencia.
6. Añadir cleanup/retry de operaciones `STARTED`.

---

## Matriz de pruebas obligatoria para el fix

| Secuencia | Validación principal |
|---|---|
| Normal → Pool + 30 min → Normal | Un cargo fijo de 30 min |
| Normal → Pool + 1 h → Pool + 1 h → Normal | Dos cargos/ledger por 2 h, no solo 1 h |
| Normal → Pool + 2 piñas → Normal | Dos jugadas una sola vez |
| Pool → Normal → Pool + horas → Normal | Segundo cargo no reemplaza al primero |
| Pool → Pool libre → Normal | Tiempo total actual se congela una vez |
| Pool → Normal → Pool → Pool ocupado | Cargo anterior y tiempo nuevo conservados |
| Normal → Pool con productos → Normal | Productos una sola vez y tiempo separado |
| Con asientos y `timeCharges` | Pagados/no pagados no se duplican |
| Con abonos e historial | Saldo y notas no se duplican |
| Fallo tras copiar primer ítem | Rollback completo o reanudación idempotente |
| Dos dispositivos, mismo origen | Una sola operación autoritativa |
| Reintento offline | Mismo `operation_id`, sin segunda orden |
| Destino en `CHECKOUT` durante la operación | Abortado sin efectos parciales |

## Conclusión

La lógica actual es aceptable para un único traslado en camino feliz, pero **no debe considerarse cerrada para doble transferencia**. El plan de fixeo es necesario, con prioridad inmediata en:

1. cargos congelados por operación;
2. RPC transaccional para todas las rutas;
3. idempotencia durable de fusiones;
4. pruebas secuenciales de dos o más traslados.
