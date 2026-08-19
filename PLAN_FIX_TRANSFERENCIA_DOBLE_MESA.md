# Plan de fixeo: doble transferencia de mesas Normal/Pool

**Estado:** P0 parcial implementado — fix financiero/UX P0.1 y migración SQL aplicados; pruebas piloto E2E y validación autoritativa pendientes
**Relacionado:** `AUDITORIA_TRANSFERENCIA_DOBLE_MESA.md`
**Objetivo:** hacer seguras las secuencias Normal → Pool → Normal/Pool, Pool → Normal → Pool y todas las fusiones repetidas, sin perder tiempo, productos, asientos, abonos ni historial.

---

## 1. Decisión de seguridad

Hasta completar el Sprint P0, las transferencias repetidas y las fusiones no deben considerarse financieramente autoritativas en producción.

El sistema debe preferir:

```text
rechazar o dejar pendiente una operación
```

antes que:

```text
confirmar una operación parcial, duplicar consumo o perder tiempo facturable.
```

La ruta antigua del cliente se conservará únicamente como compatibilidad temporal y deberá quedar detrás de una bandera de funcionalidad.

---

## 2. Problemas que resuelve este plan

1. El cargo congelado actual usa `frozen-time-${session.id}` y se reutiliza en un segundo ciclo.
2. Una fusión copia ítems y elimina el origen en operaciones separadas.
3. `transferInFlight` solo protege una pestaña y no dos dispositivos.
4. El `TRANSFER_OPERATION_ID` guardado en `notes` no es una identidad durable suficiente.
5. Las rutas offline no tienen el mismo comportamiento para `ALL` y `CONSUMPTION`.
6. Un error después de copiar parte de una comanda puede dejar datos duplicados.
7. El modo `FREE` no tiene una semántica comercial inequívoca.
8. Los offsets y cargos pagados viven principalmente en caché/runtime y no son autoritativos para una RPC.

---

## 3. Invariantes de negocio

Estas reglas deben ser invariantes verificables en servidor y cliente:

### Sesión

- Una sesión activa tiene una sola mesa destino.
- Una mesa no puede tener más de una sesión `ACTIVE`/`CHECKOUT`.
- El `table_session_id` permanece estable durante un traslado completo.
- `ALL` mueve la sesión; `CONSUMPTION` cierra la sesión origen después de fusionarla.
- Un origen o destino en `CHECKOUT` no se puede transferir/fusionar.

### Orden y consumo

- Una sesión mantiene como máximo una orden abierta.
- Cada `order_item` de origen se incorpora al destino como máximo una vez por operación.
- Un reintento no incrementa cantidades nuevamente.
- Los precios y cantidades históricas no se recalculan con el catálogo actual.
- La orden no puede quedar en origen si la sesión ya está en destino.

### Tiempo y jugadas

- Cada traslado Pool → Normal congela únicamente el saldo nuevo no pagado.
- Dos traslados distintos generan dos cargos distintos o dos entradas de ledger distintas.
- Reintentar el mismo traslado devuelve el mismo resultado y no crea otra línea.
- Un cargo congelado no vuelve a interpretarse como tiempo Pool.
- Una hora/jugada nueva después de volver a Pool no reemplaza ni se pierde junto al cargo anterior.

### Asientos, abonos y pausas

- Los `seat_id` se remapean solo cuando hay colisión.
- Los cargos de asientos pagados no reaparecen.
- Los cargos de asientos no pagados se conservan o limpian según la política confirmada.
- `RETIRED_PAID_SHARED` e `HISTORIAL_ABONOS` no se duplican.
- Pausas y offsets del contexto anterior no reducen el primer cobro del nuevo contexto.

---

## 4. Arquitectura objetivo

### 4.1 Operación durable

Reutilizar/extender `table_transfer_operations` para todas las rutas, no solo Pool → Normal libre.

Campos mínimos:

```text
operation_id             TEXT PRIMARY KEY
user_id                  UUID NOT NULL
source_session_id        UUID NOT NULL
target_session_id        UUID NULL
source_table_id          UUID NOT NULL
target_table_id          UUID NOT NULL
transfer_type            TEXT NOT NULL       -- ALL / CONSUMPTION
source_type              TEXT NOT NULL       -- NORMAL / POOL
target_type              TEXT NOT NULL       -- NORMAL / POOL
status                   TEXT NOT NULL       -- STARTED / COMPLETED / FAILED / CONFLICT
request_payload          JSONB NOT NULL
result_payload           JSONB NULL
preview_total            NUMERIC NULL
committed_total          NUMERIC NULL
error_code               TEXT NULL
error_message            TEXT NULL
created_at               TIMESTAMPTZ NOT NULL
completed_at             TIMESTAMPTZ NULL
```

Índices y restricciones:

```text
UNIQUE (user_id, operation_id)
INDEX (user_id, source_session_id, created_at DESC)
INDEX (user_id, target_table_id, status)
```

No depender de `notes` como fuente primaria de idempotencia. El tag puede permanecer por compatibilidad y auditoría visual.

### 4.2 Trazabilidad de ítems fusionados

Agregar una tabla de enlaces para que una copia parcial pueda reanudarse sin duplicar:

```text
 table_transfer_item_links
 ├── operation_id
 ├── source_order_item_id
 ├── target_order_item_id
 ├── source_qty
 ├── target_qty_applied
 ├── status
 └── created_at
```

Restricción esencial:

```text
UNIQUE (operation_id, source_order_item_id)
```

Si el mismo ítem vuelve a procesarse, la RPC devuelve el enlace existente y no vuelve a sumar cantidad.

### 4.3 Ledger de cargos congelados

No identificar un cargo por `session.id`. Crear una entidad explícita:

```text
 table_transfer_charges
 ├── id
 ├── operation_id
 ├── user_id
 ├── source_session_id
 ├── target_session_id
 ├── order_id
 ├── order_item_id
 ├── charge_type              -- POOL_TIME / SEAT_TIME / PINA
 ├── amount
 ├── tax_amount
 ├── source_elapsed_minutes
 ├── metadata
 └── created_at
```

Restricciones:

```text
UNIQUE (operation_id, charge_type)
```

La línea de `order_items` puede usar un producto sintético, pero debe conservar también `operation_id` o el vínculo en `table_transfer_charges`.

---

## 5. RPC transaccional única

Crear una RPC que cubra `ALL` y `CONSUMPTION`, por ejemplo:

```text
transfer_table_atomic(
  p_operation_id,
  p_source_session_id,
  p_target_table_id,
  p_transfer_type,
  p_pool_mode,
  p_preserve_seat_time_charges,
  p_preview_payload
)
```

### Secuencia interna obligatoria

1. Validar `auth.uid()` y pertenencia a la cuenta.
2. Resolver o crear `table_transfer_operations`.
3. Si está `COMPLETED`, devolver exactamente `result_payload`.
4. Si está `STARTED`, bloquear reentrada y devolver conflicto reconciliable.
5. Bloquear la sesión origen con `FOR UPDATE`.
6. Bloquear las filas de las mesas origen/destino.
7. Bloquear la sesión destino, si existe.
8. Bloquear las órdenes abiertas origen/destino.
9. Revalidar estados y tipos dentro de la transacción.
10. Calcular el contexto de tiempo y el saldo no pagado con datos durables.
11. Para `ALL`:
    - actualizar `table_id` de la sesión;
    - aplicar cambio de contexto Normal/Pool;
    - mover la orden sin cambiar `table_session_id`;
    - insertar cada cargo congelado asociado al `operation_id`.
12. Para `CONSUMPTION`:
    - crear enlaces `table_transfer_item_links` por cada ítem;
    - aplicar cantidades una sola vez;
    - añadir cargo congelado una sola vez;
    - fusionar asientos/notas/abonos;
    - cerrar la sesión y orden origen únicamente al final.
13. Marcar la operación `COMPLETED` con el resultado completo.
14. Ante cualquier error, rollback de sesión, orden, ítems, cargos y metadata.

### Resultado de la RPC

Debe devolver:

```json
{
  "operation_id": "...",
  "status": "COMPLETED",
  "source_session_id": "...",
  "target_session_id": "...",
  "target_table_id": "...",
  "transfer_type": "ALL",
  "frozen_charges": [],
  "copied_items": [],
  "session": {},
  "order": {}
}
```

El cliente debe adoptar este resultado, no reconstruirlo con su caché.

---

## 6. Cambios en el cliente

### 6.1 Antes de confirmar

- Construir el preview sin efectos secundarios.
- Crear un `operation_id` estable.
- Mostrar diferencias entre:
  - tiempo Pool pendiente;
  - tiempo ya pagado;
  - nuevo cargo congelado;
  - consumo conservado;
  - nuevo modo de Pool.
- Bloquear el botón mientras haya una operación en vuelo.

### 6.1.1 Fix de preview financiero y etiquetas

- Incorporar `paidElapsedOffsets` al preview, al cargo congelado, al checkout y a la RPC.
- Restar el offset solo del tiempo corrido pendiente; horas y piñas conservan sus offsets independientes.
- Usar una única función de `effectiveElapsed` para que modal, orden y cierre produzcan el mismo saldo.
- Separar cargos sintéticos `frozen-time-*` y `table_transfer_charges` de los productos del bar.
- Mostrar `Productos conservados` y `Cargos fijos anteriores` por separado, sin excluirlos del total financiero.
- Etiquetar dinámicamente el pendiente:
  - `Tiempo Pool pendiente` para tiempo corrido;
  - `Jugadas Pool pendientes` para piñas/jugadas;
  - `Cargos por asiento pendientes` para cargos por cliente;
  - `Cargos Pool pendientes` con desglose para casos mixtos.
- Renombrar `Cargo fijo único` a `Total que se trasladará` en el resumen y en el aviso de confirmación.
- Mantener fallback legacy: `paidElapsedOffsets` ausente equivale a cero y los cargos antiguos se clasifican sin borrarlos.

### 6.2 Durante la operación

Eliminar del camino autoritativo del cliente:

- `addItemToSession` para cargos de traslado;
- copias directas de todos los `order_items` antes de respuesta del servidor;
- `cancelOrderBySessionId` como paso independiente de una fusión;
- updates separados de sesión y orden como confirmación final.

El cliente solo debe llamar la RPC y actualizar su caché con el resultado.

### 6.3 Reintentos

- Reutilizar exactamente el mismo `operation_id`.
- Si la respuesta se pierde, consultar la operación por ID antes de crear otra.
- Si la operación está `COMPLETED`, adoptar su resultado.
- Si está `STARTED`, mostrar `Reconciliando transferencia` y no duplicar.
- Si está `CONFLICT`, bloquear el nuevo intento y mostrar el motivo.

### 6.4 Offline

Para P0:

- encolar la intención completa, no una mutación parcial;
- no mostrar la transferencia como completada antes del servidor;
- reintentar con el mismo `operation_id`;
- si la instalación aún no tiene la RPC, bloquear fusiones y cruces de tipo con un mensaje claro.

La ruta legacy offline se puede conservar únicamente como fallback explícito durante la migración, nunca como ruta silenciosa.

---

## 7. Corrección específica del cargo congelado

### Regla nueva

El ID de una línea debe ser por operación:

```text
frozen-time-${operation_id}
```

o, preferiblemente, una línea vinculada por `table_transfer_charges`.

### Ejemplo esperado

```text
Normal → Pool + 1 h → Normal
  operación T1 → cargo congelado T1 = 1 h

Normal → Pool + 1 h → Normal
  operación T2 → cargo congelado T2 = 1 h

Total congelado acumulado = 2 h
```

El reintento de T2 no crea T3 ni vuelve a sumar T2.

---

## 8. Semántica del modo Libre

Cerrar la decisión comercial antes de implementar:

### Opción A — Libre por tiempo

- `game_mode = NORMAL` en mesa Pool;
- se cobra `pricePerHour` según tiempo transcurrido;
- UI debe decir `Libre por tiempo`.

### Opción B — Sin cargo de tiempo

- el motor debe devolver tiempo `$0`;
- UI puede decir `Sin cargo de tiempo`;
- el nuevo Pool solo cobra consumo, horas explícitas o piñas explícitas.

No mantener el texto actual `Libre (sin cargo de tiempo)` si el motor cobra `libreCost`.

---

## 9. Fases de implementación

### Fase 0 — Preparación y protección

- [ ] Activar feature flag `atomic_table_transfers`.
- [ ] No cambiar aún la ruta legacy.
- [ ] Crear migración de tablas, índices, RLS y columnas de vínculo.
- [ ] Añadir consultas de preflight para operaciones `STARTED` y cargos legacy.
- [ ] Confirmar la semántica de `FREE`.

### Fase 1 — Modelo durable

- [ ] Extender `table_transfer_operations` para todas las rutas.
- [ ] Crear `table_transfer_item_links`.
- [ ] Crear `table_transfer_charges`.
- [ ] Agregar RLS por `user_id`.
- [ ] Agregar índices y restricciones únicas.
- [ ] Crear backfill solo de metadata; no borrar cargos legacy automáticamente.

### Fase 2 — RPC transaccional

- [ ] Implementar `transfer_table_atomic`.
- [ ] Añadir locks de origen, destino, sesión y órdenes.
- [ ] Implementar `ALL`.
- [ ] Implementar `CONSUMPTION`.
- [ ] Hacer cargos e ítems idempotentes por operación.
- [ ] Implementar estados `STARTED`, `COMPLETED`, `FAILED`, `CONFLICT`.
- [ ] Revocar ejecución pública y conceder solo a `authenticated`.

### Fase 3 — Cliente

- [ ] Cambiar `transferSession` para llamar la RPC única.
- [ ] Mantener preview puro.
- [x] Incorporar `paidElapsedOffsets` y el cálculo de tiempo efectivo en preview, cargo y checkout.
- [x] Separar productos conservados de cargos fijos anteriores.
- [x] Ajustar etiquetas por tiempo, jugadas, cargos por asiento y casos mixtos.
- [x] Renombrar `Cargo fijo único` a `Total que se trasladará`.
- [ ] Eliminar mutaciones de orden antes de la respuesta.
- [ ] Reemplazar caché local con respuesta autoritativa.
- [ ] Implementar reintento por operación.
- [ ] Bloquear rutas de riesgo sin RPC.

### Fase 4 — Offline, Realtime y recuperación

- [ ] Crear cola de intenciones de transferencia.
- [ ] Reintentar por `operation_id`.
- [ ] Publicar resultado autoritativo por Realtime.
- [ ] Reconciliar operaciones `STARTED` al iniciar.
- [ ] Resolver operaciones que quedaron a medias antes del despliegue.

### Fase 5 — UX y observabilidad

- [ ] Corregir texto del modo Libre.
- [ ] Mostrar histórico de cargos congelados por operación.
- [ ] Mostrar productos y cargos fijos anteriores en bloques separados.
- [ ] Mostrar etiquetas dinámicas para tiempo, jugadas, asientos y casos mixtos.
- [ ] Mostrar `Total que se trasladará` sin presentarlo como un cargo adicional al desglose.
- [ ] Mostrar estado `Pendiente`, `Completada`, `Conflicto` o `Reconciliando`.
- [ ] Registrar preview vs total confirmado, incluyendo `paidElapsedOffsets`.
- [ ] Crear alerta administrativa para operaciones inconclusas.

---

## 10. Matriz de pruebas P0

### Secuencias normales

| Caso | Resultado esperado |
|---|---|
| Normal → Pool + 30 min → Normal | Un cargo de 30 min |
| Normal → Pool + 1 h → Pool + 1 h → Normal | Dos cargos, 2 h totales |
| Normal → Pool + 2 piñas → Normal | Dos piñas, una sola vez |
| Pool → Normal → Pool + horas → Normal | Conserva cargo anterior y añade el nuevo |
| Pool → Normal → Pool → Pool ocupado | No pierde ni duplica cargos |
| Pool → Pool → Normal → Pool → Normal | Cada operación queda separada |

### Consumo y asientos

| Caso | Resultado esperado |
|---|---|
| Fusión con productos iguales | Cantidad aplicada una sola vez |
| Fusión con precios distintos | Líneas separadas, sin revalorar |
| Fusión con asiento colisionado | `seat_id` remapeado una vez |
| Fusión con cargos por asiento | Conserva o limpia según política |
| Fusión después de un pago de tiempo corrido | Solo cobra minutos posteriores al offset |
| Fusión repetida con cargos fijos previos | Separa cargos fijos de productos, sin alterar el total |
| Fusión con abonos | Historial y saldo sin duplicar |
| Fusión con productos pesables | Cantidad decimal exacta |

### Fallos y concurrencia

| Caso | Resultado esperado |
|---|---|
| Error después del primer ítem | Rollback o reanudación idempotente |
| Error al cerrar origen | No quedan dos órdenes cobrables |
| Doble clic | Una operación |
| Dos pestañas | Una operación autoritativa |
| Dos dispositivos, destinos distintos | Una operación gana; la otra recibe conflicto |
| Timeout de RPC | Reconsulta por `operation_id` |
| Offline | Intención pendiente, sin confirmar mutación parcial |
| Realtime perdido | Pull autoritativo repara el estado |
| Reintento de operación completada | Mismo resultado, cero duplicados |

### Integridad financiera

Después de cada secuencia verificar:

```text
consumo final = consumo original
+ consumo añadido
+ cargos congelados de operaciones nuevas
- pagos/abonos aplicables
```

Y además:

- no existen dos `table_transfer_operations` completadas con el mismo ID;
- cada cargo congelado tiene una operación única;
- cada ítem fuente tiene como máximo un enlace por operación;
- una sola orden abierta queda asociada a la sesión destino;
- no quedan sesiones activas en la mesa origen.

---

## 11. Migraciones y despliegue

### Orden de migración

1. ~~Preflight de columnas y datos legacy.~~ **Ejecutado.**
2. ~~Ejecutar `database/add_table_transfer_atomic_rpc.sql`.~~ **Ejecutado y verificado.**
3. ~~Verificar tablas, índices, RLS y la función `transfer_table_atomic`.~~ **Verificado en Supabase.**
4. Tabla/extensiones de operaciones.
5. Tabla de enlaces de ítems.
6. Ledger de cargos.
7. Índices únicos y RLS.
8. RPC transaccional.
9. Feature flag en cliente.
10. Pruebas piloto.

No volver a ejecutar el esquema completo antiguo después de publicar la RPC nueva.

### Backfill

- No eliminar automáticamente líneas `frozen-time-*` históricas.
- Marcar cargos anteriores como `legacy` o `unattributed`.
- No reinterpretar el historial antiguo como una nueva transferencia.
- Revisar operaciones inconclusas antes de activar la bandera.

### Piloto

1. Activar para un usuario/dispositivo de prueba.
2. Ejecutar todas las secuencias P0.
3. Comparar preview, orden, sesión y cierre.
4. Mantener un turno de observación.
5. Activar para el resto de usuarios.

---

## 12. Rollback

- Apagar `atomic_table_transfers` sin borrar operaciones ni ledger.
- Mantener los resultados completados como fuente histórica.
- No reactivar automáticamente la ruta legacy para operaciones `STARTED`.
- Reconciliar primero las operaciones pendientes.
- Si el problema es solo UI, mantener la RPC activa y corregir el cliente.
- Si falla la RPC, bloquear nuevas transferencias de riesgo y preservar las órdenes intactas.

---

## 13. Criterios de aceptación

El fix se considera listo cuando:

1. Una nueva transferencia Pool → Normal nunca reemplaza un cargo congelado anterior.
2. Un reintento no crea otra orden, línea ni cantidad.
3. Una fusión parcial puede reanudarse sin duplicar ítems.
4. Dos dispositivos no pueden completar dos destinos para la misma fuente.
5. El resultado del cliente coincide con la respuesta RPC.
6. Los offsets, pausas, asientos y abonos mantienen el mismo saldo.
7. `paidElapsedOffsets` evita volver a cobrar tiempo ya pagado. **Implementado y validado en una prueba E2E RPC rollback; pendiente validar el recálculo servidor-side y el piloto desde UI.**
8. Los cargos fijos anteriores aparecen separados del consumo de productos. **Implementado en preview.**
9. Las etiquetas reflejan si el pendiente es tiempo, jugadas, asientos o un caso mixto. **Implementado en preview.**
10. El resumen usa `Total que se trasladará` y no sugiere un cobro duplicado. **Implementado en modal.**
11. Las transferencias offline quedan pendientes y no se anuncian como completadas.
12. Las pruebas secuenciales P0 pasan con y sin consumo.
13. Las operaciones inconclusas son visibles y reconciliables.
14. La bitácora permite reconstruir cada movimiento por `operation_id`.
