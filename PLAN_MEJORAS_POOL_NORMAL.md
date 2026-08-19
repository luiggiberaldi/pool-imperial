# Plan de mejoras: Transferencia Pool → Normal

> **Estado:** IMPLEMENTADO PARCIALMENTE — preview económico, reloj visual separado, metadata compatible e intento de RPC atómica ya están integrados; las migraciones SQL deben ejecutarse en Supabase para activar la ruta transaccional.
> **Fecha:** 18-Ago-2026
> **Relacionado:** `PLAN_TRANSFERENCIA_NORMAL_POOL.md`

## 1. Objetivo

Perfeccionar `POOL → NORMAL` para que:

1. El tiempo de Pool no se cobre más de una vez.
2. El reloj visual de la mesa Normal no reutilice el tiempo facturado de Pool.
3. El operador vea exactamente qué importe se congela como consumo.
4. Sesión, comanda, cargo fijo y auditoría se guarden como una sola operación autoritativa.
5. Un reintento, fallo de red o doble dispositivo no duplique cargos ni productos.

La regla de negocio que se conserva es:

> El tiempo Pool pendiente se materializa una sola vez como consumo fijo. Desde que la cuenta llega a Normal, el tiempo de barra no genera cargo de mesa.

---

## 2. Estado actual y alcance

### Ya implementado

- Cálculo de tiempo efectivo respetando pausas y offsets.
- Conversión del tiempo Pool pendiente a una línea sintética de consumo.
- Limpieza de `hours_paid`, `extended_times`, `paused_at`, offsets y cargos de tiempo por asiento.
- Movimiento de `orders.table_id` al destino.
- Preservación de productos, cantidades, clientes, notas y abonos.
- Validación de sesiones `ACTIVE`/`CHECKOUT`.
- Idempotencia local mediante `TRANSFER_OPERATION_ID` y cola offline.

### A mejorar

- El `started_at` original puede seguir mostrándose como tiempo acumulado en la mesa Normal.
- El modal muestra el cruce de tipo, pero no un desglose completo de tiempo pendiente, tiempo ya pagado y cargo fijo.
- La sesión y la orden todavía se actualizan mediante operaciones separadas.
- La RPC definitiva debe considerar que los offsets de pagos parciales hoy viven principalmente en runtime/cache local.

### Fuera de alcance inicial

- Cambiar las tarifas de Pool o Normal.
- Cambiar la política comercial de prepago/jugada.
- Rediseñar el cierre de caja completo.
- Migrar inmediatamente todo el historial antiguo.

---

## 3. Decisiones de negocio que deben cerrarse

Antes de activar la fase transaccional en producción, confirmar:

- [ ] Si el tiempo congelado se muestra como `Tiempo de Pool`, `Tiempo de juego` o `Servicio de mesa`.
- [ ] Si el importe congelado conserva impuestos incluidos exactamente como fue calculado.
- [ ] Si los cargos manuales de asientos ya pagados se consideran históricos y no deben reaparecer.
- [ ] Si una fusión Pool→Normal ocupada puede ejecutarse automáticamente o requiere autorización de administrador.
- [ ] Si el reloj de Normal debe mostrar `Tiempo en barra` desde cero o permanecer oculto.

**Recomendación:** usar `Tiempo de juego Pool` para el cargo fijo y reiniciar el reloj visual con la etiqueta `Tiempo en barra`.

---

## 4. Fase 1 — Separar contexto visual y contexto facturable

### 4.1 Contrato de timestamps

Definir `started_at` como el inicio del **contexto actual** de la sesión, no como el inicio histórico de la cuenta.

Al confirmar `POOL → NORMAL`:

```js
{
  table_id: targetNormalTableId,
  started_at: serverNow,              // nuevo contexto visual: barra
  game_mode: 'NORMAL',
  hours_paid: 0,
  extended_times: 0,
  paid_at: null,
  paused_at: null,
  seats: seatsWithoutTimeCharges,
  transfer_metadata: {
    operation_id,
    source_type: 'POOL',
    target_type: 'NORMAL',
    source_started_at,
    transferred_at: serverNow,
    frozen_time_usd,
    source_elapsed_minutes
  }
}
```

El historial de Pool se conserva en el cargo fijo, auditoría y metadata; no debe depender de seguir usando el mismo `started_at`.

### 4.2 Persistencia recomendada

Agregar una columna JSONB para metadata de contexto:

```sql
ALTER TABLE public.table_sessions
  ADD COLUMN IF NOT EXISTS transfer_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
```

Si el equipo prefiere columnas consultables, usar además:

```sql
ALTER TABLE public.table_sessions
  ADD COLUMN IF NOT EXISTS context_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_transfer_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_transfer_operation_id TEXT;
```

`started_at` puede seguir siendo la columna compatible con la aplicación actual; `transfer_metadata` evita sobrecargar `notes` con información contable estructurada.

### 4.3 UI

- En mesa Normal mostrar `Tiempo en barra` desde el nuevo `started_at`.
- No mostrar el tiempo Pool anterior como si siguiera corriendo.
- En detalle de cuenta mostrar por separado:
  - `Tiempo Pool congelado`.
  - `Tiempo en barra`.
  - `Tiempo facturable actual: $0`.
- Si la mesa Normal solo acumula consumo, no mostrar controles de pausa de Pool.

### 4.4 Guardrails

- Nunca cambiar el reloj visual antes de haber calculado el cargo fijo.
- Si no se puede calcular el importe con una configuración válida, cancelar sin cambiar la sesión.
- Conservar `source_started_at` antes de sobreescribir `started_at`.
- Si el cargo fijo es `$0`, registrar explícitamente `frozen_time_usd: 0`; no inferirlo por ausencia de una línea.

---

## 5. Fase 2 — Resumen económico previo a confirmar

### 5.1 Nuevo cálculo puro de preview

Crear una función sin efectos secundarios, por ejemplo `buildPoolToNormalPreview`, que devuelva:

```js
{
  sourceElapsedMinutes,
  sourceTimeTotal,
  sourceSeatTimeTotal,
  previouslyPaidTotal,
  frozenTimeTotal,
  currentConsumptionTotal,
  targetWillChargeTime: false,
  hasOrder,
  hasUnpaidSeatCharges,
  warnings: []
}
```

Debe usar las mismas reglas que el motor real de congelamiento para evitar que el modal muestre un valor diferente al que finalmente se guarda.

### 5.2 Modal requerido

Mostrar antes de confirmar:

```text
Pool → Normal

Tiempo Pool pendiente       $X
Tiempo Pool ya abonado      $Y
Cargo fijo que se agregará  $X
Consumo conservado          $Z
Tiempo futuro en Normal     $0

El cargo fijo se agregará una sola vez y el tiempo en barra no se cobrará.
```

Si existen cargos por asiento:

```text
Incluye cargos pendientes por asiento: $N
Al confirmar, se limpiarán de los asientos para evitar doble cobro.
```

### 5.3 Confirmación

- Botón `Confirmar traslado` deshabilitado mientras el preview esté calculándose.
- Mostrar `Recalcular` si cambia la sesión mientras el modal está abierto.
- Si cambia el destino, recalcular desde el estado actual.
- Si la sesión pasa a `CHECKOUT`, cerrar el modal y mostrar el motivo.
- Si el resultado queda en cola offline, mostrar advertencia diferenciada.

### 5.4 Casos especiales del preview

- `paid_at` activo: no volver a incluir tiempo de sesión ya pagado.
- Asiento pagado: no incluir su cargo otra vez.
- Asiento no pagado con `timeCharges`: incluirlo una sola vez y después limpiarlo.
- Sesión pausada: usar el tiempo efectivo hasta la pausa.
- Sin comanda y con tiempo pendiente: crear una comanda controlada para el cargo fijo.
- Sin tiempo pendiente ni consumo: permitir el traslado sin crear una orden.

---

## 6. Fase 3 — Modelo de operación idempotente

### 6.1 Tabla de operaciones

Crear una tabla de idempotencia separada de `notes`:

```sql
CREATE TABLE IF NOT EXISTS public.table_transfer_operations (
  operation_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_session_id UUID NOT NULL REFERENCES public.table_sessions(id),
  source_table_id UUID NOT NULL REFERENCES public.tables(id),
  target_table_id UUID NOT NULL REFERENCES public.tables(id),
  transfer_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'STARTED',
  frozen_time_usd NUMERIC NOT NULL DEFAULT 0,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

Crear índices por `user_id`, `source_session_id` y `status`. La política RLS debe aislar las operaciones por cuenta, igual que `table_sessions`.

### 6.2 RPC transaccional

Crear una función como:

```text
transfer_pool_session_to_normal(
  p_operation_id,
  p_source_session_id,
  p_target_table_id,
  p_operator_id
)
```

La RPC debe:

1. Validar autenticación y cuenta.
2. Crear o recuperar `table_transfer_operations` por `operation_id`.
3. Si la operación ya está `COMPLETED`, devolver el mismo `result_payload` sin repetir nada.
4. Bloquear la sesión origen con `FOR UPDATE`.
5. Bloquear la mesa destino y cualquier sesión activa destino.
6. Confirmar que origen es Pool y está `ACTIVE`.
7. Rechazar origen o destino en `CHECKOUT`.
8. Calcular el tiempo pendiente usando una fuente autoritativa.
9. Crear la línea de cargo fijo una sola vez si el total es mayor que cero.
10. Actualizar sesión, `started_at`, metadata, asientos y `table_id`.
11. Mover la orden con su mismo `table_session_id`.
12. Marcar operación `COMPLETED` y devolver el estado final.
13. Ante error, hacer rollback completo y marcar la operación como `FAILED` solo si el rollback fue confirmado.

### 6.3 Offsets y pagos parciales

La RPC no debe confiar exclusivamente en `localStorage`/localforage para saber qué tiempo ya fue pagado. Elegir una de estas estrategias:

- **Preferida:** crear un ledger durable de cargos/pagos de mesa y calcular el saldo como `generado - pagado`.
- **Transición:** persistir en `table_sessions` los offsets actuales:

```sql
ALTER TABLE public.table_sessions
  ADD COLUMN IF NOT EXISTS paid_hours_offset NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_rounds_offset INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_elapsed_offset NUMERIC NOT NULL DEFAULT 0;
```

Durante la migración, el cliente debe enviar sus offsets solo como preview; la RPC debe compararlos contra el estado durable y rechazar si hay conflicto.

### 6.4 Cargo fijo y fiscalidad

- El importe devuelto por la RPC debe ser el importe final que se inserta en `order_items`.
- Marcarlo como cargo de servicio/tiempo congelado para no aplicarle impuestos por segunda vez.
- Conservar `unit_price_usd`, `qty`, `product_name` y `operation_id`.
- Evitar que el mismo `operation_id` cree dos líneas sintéticas.

---

## 7. Fase 4 — Cliente y modo offline

### Antes de llamar la RPC

- Construir y mostrar preview.
- Generar `operation_id` estable para el intento.
- No mutar sesión ni orden de forma definitiva antes de la respuesta autoritativa.

### Si no hay red

- Guardar la solicitud completa en la cola offline.
- Mostrar `Pendiente de sincronización`, no `Transferencia completada`.
- No crear el cargo fijo localmente si no existe una estrategia de reconciliación segura.
- Reintentar con el mismo `operation_id`.

### Al recibir respuesta

- Reemplazar el estado local por la sesión y orden devueltos por Supabase.
- Invalidar offsets/pausas locales del contexto anterior.
- Emitir broadcast con el resultado autoritativo.
- Si otro dispositivo ganó la operación, adoptar su resultado y mostrar conflicto resuelto.

---

## 8. Matriz de pruebas

### Motor puro y preview

| Caso | Resultado esperado |
|---|---|
| Pool libre sin consumo → Normal | Cargo fijo `$0`, un nuevo contexto Normal |
| Pool con horas pendientes → Normal | Una sola línea con el saldo de horas |
| Pool con jugadas pendientes → Normal | Una sola línea con las jugadas no pagadas |
| Pool libre con tiempo redondeado → Normal | Usa exactamente la misma regla del checkout |
| Pool con `paid_at` → Normal | No duplica el tiempo ya pagado |
| Pool con offsets → Normal | Solo congela el saldo posterior al offset |
| Pool pausada → Normal | Usa minutos hasta la pausa |
| Pool con asientos pagados/no pagados | Solo incluye cargos de asientos no pagados |
| Pool con abonos | Mantiene saldo e historial sin doble descuento |
| IVA/impoconsumo inclusive/exclusive | El cargo fijo no se grava dos veces |
| Producto pesable en la comanda | Cantidad y precio no cambian |

### Persistencia y errores

| Caso | Resultado esperado |
|---|---|
| Destino Normal libre | Sesión y orden apuntan al destino |
| Destino Normal ocupado | Fusión única y cargo fijo único |
| Destino en `CHECKOUT` | Rechazo sin mutaciones |
| Doble clic | Un solo `operation_id` y un solo cargo |
| Dos dispositivos | Un resultado autoritativo |
| Falla antes de insertar cargo | Rollback completo |
| Falla después de insertar cargo | Rollback completo o reanudación idempotente, nunca duplicado |
| Reintento con operación completada | Devuelve el mismo resultado |
| Offline | Cola sin confirmar prematuramente |
| Reconexión | RPC completa una sola vez |

### UI responsive

- Preview sin scroll en móvil de 375 px cuando no hay cargos por asiento.
- Preview con cargos por asiento con scroll solo como fallback del contenido.
- Menú de dropdown no desplaza el modal.
- Confirmación deshabilitada durante cálculo y mutación.
- Texto de `Tiempo en barra` no muestra el tiempo Pool antiguo.

---

## 9. Criterios de aceptación

La mejora estará lista cuando:

1. El reloj visual de Normal comienza en el traslado y no representa tiempo Pool anterior.
2. El cargo fijo coincide exactamente con el preview y con el total insertado.
3. Un mismo tiempo Pool nunca genera dos cargos fijos.
4. Los cargos por asiento pagados no reaparecen.
5. La orden conserva sus ítems, precios y cantidades.
6. Sesión y orden quedan en el mismo destino después de una respuesta exitosa.
7. Una operación repetida devuelve el mismo resultado.
8. Un fallo transaccional no deja una sesión movida con una comanda en el origen.
9. La auditoría contiene origen, destino, operador, timestamps, importe congelado y `operation_id`.
10. Los casos de IVA, pausa, offsets y fusión pasan en el Tester de Mesas.

---

## 10. Despliegue gradual y rollback

### Orden recomendado

1. Agregar metadata y tabla de operaciones sin cambiar el flujo actual.
2. Implementar preview puro y pruebas fiscales.
3. Separar `started_at` visual y agregar la etiqueta `Tiempo en barra`.
4. Publicar la RPC detrás de una bandera de configuración.
5. Habilitarla para un dispositivo piloto.
6. Comparar durante un turno los cargos calculados por cliente y servidor.
7. Activar para todos cuando no existan divergencias.

### Rollback

- Mantener la ruta cliente actual solo como fallback temporal y claramente marcada como no transaccional.
- No borrar `transfer_metadata` ni operaciones completadas.
- Si la RPC falla, impedir el traslado automático antes que aplicar una operación parcialmente.
- Reconciliar operaciones `STARTED` antiguas desde un panel administrativo antes de reintentar.

### Observabilidad

Registrar métricas:

- transferencias Pool→Normal exitosas.
- rechazos por estado o concurrencia.
- diferencia preview vs resultado RPC.
- cargos fijos duplicados detectados.
- operaciones offline pendientes.
- tiempo promedio de resolución.
