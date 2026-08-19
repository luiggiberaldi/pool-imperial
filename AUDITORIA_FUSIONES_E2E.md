# Auditoría E2E de fusiones de mesas

**Fecha:** 2026-08-18
**Estado actual:** RPC atómica instalada y verificada; la evidencia de bloqueo de la sección 1 es histórica
**Alcance:** `CONSUMPTION` entre mesas NORMAL/POOL, órdenes, ítems, asientos, tiempo, abonos, concurrencia, Realtime y reintentos.

---

## 1. Evidencia observada (histórica, antes de aplicar la migración)


El flujo real produjo:

```text
POST /rest/v1/rpc/transfer_table_atomic → 404
Error: Las fusiones requieren la migración de transferencia atómica antes de continuar
```

La aplicación muestra el modal y permite pulsar **Fusionar Cuentas**, pero solo detecta la capacidad faltante después de confirmar.

### Veredicto histórico

En ese momento la fusión estaba **no operativa**, pero el bloqueo era seguro:

- no se copian `order_items`;
- no se crea una orden destino;
- no se cancela la orden origen;
- no se cierra la sesión origen;
- no se actualizan asientos ni notas;
- no se confirma la fusión como exitosa.

El problema inmediato era de despliegue y UX, sin evidencia de pérdida de datos en ese intento.

### Estado actual después de la auditoría de base

`transfer_table_atomic(text, uuid, uuid, text, jsonb)` existe en Supabase y el `404` ya no corresponde al estado remoto. Las fusiones siguen protegidas por validaciones del cliente y por la RPC; los riesgos financieros y de concurrencia descritos más adelante permanecen como trabajo P0/P1.

---

## 2. Flujo E2E actual

1. `TableCard` inicia la transferencia y cambia al plano.
2. `handleFloorTableSelect` valida que el destino no esté en `CHECKOUT`, crea un `operation_id` y abre el modal.
3. El modal decide:
   - destino libre → `ALL`;
   - destino ocupado → `CONSUMPTION`.
4. Al confirmar, `transferSession` vuelve a validar origen, destino, estados y tipos.
5. Para `CONSUMPTION` construye:
   - `merge_payload` de sesión;
   - mapa de `seat_id`;
   - cargos Pool congelados;
   - `operation_id`.
6. Llama únicamente a `transfer_table_atomic`.
7. Si la RPC responde correctamente, el servidor debe:
   - bloquear origen/destino;
   - copiar ítems;
   - crear enlaces de idempotencia;
   - insertar cargos congelados;
   - fusionar sesión destino;
   - cerrar origen;
   - cancelar orden origen;
   - devolver la sesión final.
8. El cliente adopta la sesión devuelta y sincroniza órdenes.

La ruta legacy de fusión no se usa cuando la RPC está ausente. Esto es correcto para evitar copias parciales.

---

## 3. Matriz de rutas

| Origen | Destino ocupado | Tipo | Estado actual |
|---|---:|---|---|
| NORMAL | NORMAL | CONSUMPTION | Disponible tras migración; pendiente piloto E2E |
| NORMAL | POOL | CONSUMPTION | Disponible tras migración; pendiente piloto E2E |
| POOL | NORMAL | CONSUMPTION | Disponible tras migración; debe congelar tiempo y validar saldo |
| POOL | POOL | CONSUMPTION | Disponible tras migración; debe congelar tiempo y validar saldo |
| NORMAL | libre | ALL | Puede usar ruta atómica/legacy según tipo |
| POOL | libre | ALL | Cruce de tipo requiere RPC atómica |

La ruta mostrada en la captura —`B7 NORMAL → Pool 1 POOL`, ambas ocupadas— entra correctamente por `CONSUMPTION`.

---

## 4. Hallazgos priorizados

### P0 — Migración/RPC ausente (cerrado en la base auditada)

La captura documenta un estado anterior en el que `transfer_table_atomic` no existía o PostgREST todavía no la exponía. Ese bloqueo de disponibilidad ya está cerrado en la base auditada.

**Estado:** `database/add_table_transfer_atomic_rpc.sql` ya fue aplicado y la firma exacta fue verificada. Mantener la comprobación de capacidad y refrescar/reconectar el esquema de PostgREST si se despliega una nueva versión.

No usar `add_pool_normal_transfer_rpc.sql` como sustituto: cubre Pool → Normal completo, no las fusiones generales.

### P0 — El importe Pool congelado no es autoritativo

La RPC toma `p_plan->'frozen'->>'total'`, enviado por el navegador. Un cliente desactualizado, una carrera o una manipulación puede alterar el importe de tiempo que se incorpora a la cuenta destino.

**Fix:** calcular el saldo Pool en servidor usando datos durables, o validar estrictamente el preview contra un ledger de pagos/offsets antes de insertar el cargo.

### P0 — El payload de sesión también viene del cliente

`merge_payload`, `seat_id_map` y `session_patch` se calculan con el estado local abierto en el modal. Si otro dispositivo modifica clientes, asientos, notas o abonos antes de confirmar, la RPC puede aplicar un payload obsoleto y sobrescribir cambios recientes.

**Fix:** fusionar en servidor desde las filas bloqueadas o exigir una versión/`updated_at` coincidente y devolver conflicto si cambió.

### P1 — La capacidad se detecta demasiado tarde

La UI permite abrir y confirmar una fusión sin saber que la RPC está instalada. El usuario recibe un toast rojo después de una acción que parecía disponible.

**Fix:** health-check/preflight al iniciar la vista o al seleccionar destino; deshabilitar el botón y mostrar `Fusión no disponible: falta migración atómica`.

El bloqueo actual debe mantenerse como segunda barrera.

### P1 — Orden de locks vulnerable a deadlock

La RPC bloquea primero la sesión/mesas y después toma el advisory lock de la pareja. Dos transferencias simultáneas en sentidos opuestos pueden retener recursos distintos y esperar el lock que posee la otra transacción.

**Fix:** tomar primero un lock determinista de la pareja y después bloquear siempre origen, destino, sesión y órdenes en el mismo orden.

### P1 — Selección silenciosa de sesiones y órdenes

La RPC toma la primera sesión activa y la primera orden abierta mediante `LIMIT 1`. Si existen dos sesiones u órdenes activas por datos legacy o una carrera, puede fusionar solo una y dejar otra cobrable.

**Fix:** contar primero; si hay más de una sesión o más de una orden abierta, devolver `CONFLICT` y no elegir silenciosamente.

### P1 — Realtime incompleto para fusiones sin ítems

El canal de órdenes escucha principalmente `order_items`. Una fusión que solo mueve asientos/notas o crea una orden vacía puede modificar `orders` sin generar un evento de ítem. Otro dispositivo puede seguir mostrando la orden anterior.

**Fix:** suscribir también `orders`, emitir un evento de operación completada y ejecutar un pull autoritativo en los dispositivos receptores.

### P1 — Reintento no durable tras recarga

Mientras el modal permanece abierto, `transferOperationId` se conserva. Si la aplicación se recarga o cambia de dispositivo después de un timeout, el ID se pierde y un nuevo intento puede crear otra operación.

**Fix:** persistir la intención completa en una cola de transferencias por cuenta y reconsultar `table_transfer_operations` antes de generar una nueva operación.

### P1 — Abonos y metadata con dos fuentes pueden perder información

`HISTORIAL_ABONOS` se combina, pero los tags legacy `ABONO` y `ABONO_MONTO` eligen preferentemente el destino y pueden descartar el valor del origen. Además, entradas sin `id` pueden deduplicarse por JSON aunque representen dos abonos legítimos.

**Fix:** normalizar todos los abonos a un ledger estructurado, conservar cada ID/evento y rechazar metadata ambigua antes de fusionar.

### P2 — Estados de órdenes inconsistentes

El esquema base contempla `PENDING`, mientras el cliente sincroniza principalmente `OPEN`. La RPC acepta ambos, pero una orden destino `PENDING` puede desaparecer del estado local después del `syncOrders`.

**Fix:** definir un único contrato (`OPEN` para orden activa) y migrar/normalizar estados legacy.

### P2 — Fusión sin consumo puede crear una orden vacía

La RPC crea una orden destino en `CONSUMPTION` aunque no haya ítems ni cargo congelado. Debe decidirse si una fusión de solo clientes/asientos necesita orden o solo actualización de sesión.

---

## 5. Qué ya está bien encaminado

- El botón de fusión determina `CONSUMPTION` cuando el destino está ocupado.
- Origen en `CHECKOUT` y destino en `CHECKOUT` tienen guardarraíles.
- Se detectan sesiones duplicadas en el cliente.
- Se remapean colisiones de `seat_id`.
- Los ítems de origen conservan precio y cantidad históricos.
- `table_transfer_item_links` evita repetir el mismo ítem dentro de una operación.
- `table_transfer_charges` separa cargos por operación.
- Los cargos Pool de una fuente se materializan y los `timeCharges` se limpian para evitar doble cobro.
- El servidor bloquea mesas, sesiones y órdenes dentro de una transacción cuando la RPC está instalada.
- Un resultado `COMPLETED` puede devolverse de forma idempotente por `operation_id`.
- La falta de RPC actualmente detiene la fusión antes de cualquier mutación.

---

## 6. Plan de fixeo

### Sprint P0 — Disponibilidad y seguridad financiera

1. ~~Ejecutar `database/add_table_transfer_atomic_rpc.sql` en Supabase.~~ **Ejecutado y verificado.**
2. Verificar:
   - `public.transfer_table_atomic(text, uuid, uuid, text, jsonb)`;
   - `table_transfer_operations`;
   - `table_transfer_item_links`;
   - `table_transfer_charges`;
   - columnas de trazabilidad en `order_items`;
   - RLS y permisos para `authenticated`.
3. Agregar health-check de capacidad en la aplicación.
4. Deshabilitar fusión antes de abrir el modal si la capacidad no está disponible.
5. Mantener el rechazo en `transferSession` como guardarraíl final.
6. Cambiar la RPC para no confiar en `frozen.total` del cliente.
7. Validar servidoramente origen, destino, tipo, operación y saldo.
8. Auditar operaciones legacy antes de activar la función.

**Criterio:** una fusión no se muestra como disponible si el servidor no puede ejecutarla de forma atómica.

### Sprint P0.1 — Preview financiero y lenguaje del modal

1. Incorporar `paidElapsedOffsets` al contrato de preview y transferencia.
2. Aplicar el offset únicamente al tiempo corrido pendiente (`libreCost`), sin restarlo otra vez de horas o jugadas ya controladas por sus propios offsets.
3. Propagar el mismo cálculo efectivo a `buildPoolToNormalPreview`, `buildFrozenTimeCharge`, checkout y RPC para que modal, cargo y cierre coincidan.
4. Separar `frozen-time-*` y los registros de `table_transfer_charges` del consumo de productos.
5. Mostrar por separado:
   - productos conservados;
   - cargos fijos anteriores;
   - nuevo total de tiempo/jugadas que se trasladará.
6. Ajustar las etiquetas según el contenido pendiente:
   - `Tiempo Pool pendiente` si solo hay tiempo corrido;
   - `Jugadas Pool pendientes` si solo hay piñas/jugadas;
   - `Cargos por asiento pendientes` si solo hay cargos por asiento;
   - `Cargos Pool pendientes` y desglose si el caso es mixto.
7. Renombrar `Cargo fijo único` a `Total que se trasladará` y usar el mismo texto en el aviso de confirmación.
8. Mantener compatibilidad legacy: offset ausente equivale a cero y cargos históricos identificables solo por prefijo quedan clasificados como legacy, nunca eliminados.

**Criterio financiero:** después de un pago parcial, el segundo traslado solo incluye el tiempo posterior al pago; un ciclo repetido no mezcla cargos fijos anteriores con productos y el total mostrado no sugiere un cobro doble.

### Sprint P1 — RPC autoritativa

1. Reordenar locks: advisory de pareja primero, luego filas en orden determinista.
2. Rechazar múltiples sesiones u órdenes activas; no usar `LIMIT 1` como resolución.
3. Fusionar asientos, notas y abonos en servidor desde las filas bloqueadas.
4. Añadir control de versión/`updated_at` para detectar estado obsoleto.
5. Normalizar estados de órdenes activas.
6. Decidir y documentar si una fusión sin consumo crea orden.
7. Devolver resultado completo:
   - operación;
   - sesión destino;
   - orden destino;
   - ítems copiados;
   - enlaces;
   - cargos;
   - conflictos.

### Sprint P1 — Cliente y recuperación

1. Persistir la intención de fusión con `operation_id` antes de llamar la RPC.
2. Reintentar el mismo ID tras timeout, recarga o pérdida de respuesta.
3. Si el ID está `COMPLETED`, adoptar el resultado; no crear uno nuevo.
4. Si está `STARTED`, mostrar `Reconciliando` y consultar el resultado.
5. Si está `CONFLICT`, bloquear el reintento automático.
6. No ejecutar copias directas con `addItemToSession` ni `cancelOrderBySessionId` en la ruta autoritativa.

### Sprint P1 — Realtime y consistencia local

1. Escuchar cambios de `orders` además de `order_items`.
2. Emitir broadcast `table_transfer_completed` con `operation_id`.
3. Reconsultar sesión y órdenes después de recibir el evento.
4. Marcar operaciones pendientes en el indicador de sincronización.
5. Reparar automáticamente el caché si el pull posterior contradice el resultado RPC.

### Sprint P2 — Observabilidad y UX

1. Mostrar estado de capacidad atómica en el modal.
2. Mostrar claramente qué se conserva:
   - productos;
   - cargos Pool;
   - asientos;
   - abonos;
   - notas.
3. Mostrar el `operation_id` en auditoría, no necesariamente al usuario final.
4. Registrar preview vs importe confirmado.
5. Crear panel de operaciones `COMPLETED`, `CONFLICT` y `RECONCILING`.

---

## 7. Matriz E2E obligatoria

### Fusiones por tipo

- NORMAL → NORMAL con consumo y sin consumo.
- NORMAL → POOL con y sin cargos por asiento.
- POOL → NORMAL con tiempo, piñas y cargos por asiento.
- POOL → POOL con tiempo, piñas y cargos por asiento.
- Cada ruta con destino `ACTIVE`, `CHECKOUT` y con sesiones duplicadas.

### Contenido

- Productos con el mismo producto y precio.
- Productos con precio histórico diferente.
- Productos pesables con cantidad decimal.
- Ítems compartidos y atribuidos a asiento.
- Colisión de `seat_id`.
- Asientos pagados y no pagados.
- `RETIRED_PAID_SHARED`.
- Pago previo de tiempo corrido con `paidElapsedOffsets`.
- Uno o varios abonos en ambos lados.
- Cargos fijos de transferencias anteriores mezclados con productos.
- Etiquetas para solo tiempo, solo jugadas, solo asientos y modo mixto.
- Notas y propina en ambas sesiones.
- Fuente sin orden, destino sin orden y ambas sin orden.

### Fallos

- RPC 404 o schema cache desactualizado.
- Timeout después del commit.
- Timeout antes del commit.
- Doble clic.
- Dos pestañas sobre el mismo origen.
- Dos dispositivos fusionando el mismo destino.
- Dos dispositivos en sentidos opuestos.
- Realtime apagado durante la operación.
- Recarga antes y después de la respuesta.
- Error de RLS/pertenencia de cuenta.
- Operación legacy inconclusa.

### Invariantes posteriores

```text
1 sesión activa en el destino
0 sesiones activas en el origen
1 orden abierta máxima por sesión
0 ítems fuente cobrables en una orden activa de origen
cada ítem fuente enlazado como máximo una vez por operación
cada cargo congelado asociado a una operación
saldo final = origen + destino, sin duplicados
```

---

## 8. Verificación de despliegue

Después de aplicar la migración, ejecutar en Supabase:

```sql
SELECT to_regprocedure(
    'public.transfer_table_atomic(text,uuid,uuid,text,jsonb)'
) AS atomic_transfer_function;

SELECT
    to_regclass('public.table_transfer_operations') AS transfer_operations,
    to_regclass('public.table_transfer_item_links') AS transfer_item_links,
    to_regclass('public.table_transfer_charges') AS transfer_charges;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'order_items'
  AND column_name IN (
      'transfer_operation_id',
      'transfer_source_item_id'
  )
ORDER BY column_name;
```

La primera consulta debe devolver la función, las tres tablas deben existir y deben aparecer las dos columnas de `order_items`.

No ejecutar una fusión real hasta que estas verificaciones sean correctas.

---

## 9. Criterios de aceptación

El fix queda aprobado cuando:

1. El modal no permite iniciar una fusión sin RPC disponible.
2. El `404` deja de ocurrir después de la migración y la recarga del esquema.
3. Una fusión completa es una sola transacción.
4. Un timeout/reintento devuelve el mismo resultado.
5. No se duplican productos, cantidades, cargos ni abonos.
6. Los cargos Pool se conservan una sola vez.
7. `paidElapsedOffsets` evita volver a cobrar tiempo ya pagado.
8. Los cargos fijos anteriores aparecen separados de los productos.
9. Las etiquetas reflejan tiempo, jugadas, asientos o un caso mixto.
10. El modal usa `Total que se trasladará` y no sugiere un cobro duplicado.
11. Los asientos e ítems mantienen su atribución correcta.
12. Dos dispositivos no pueden completar dos fusiones incompatibles.
13. Otros dispositivos reciben el cambio de orden y sesión.
14. Una operación conflictiva queda visible y reconciliable.
15. Las pruebas E2E pasan para las cuatro combinaciones NORMAL/POOL.

**No se modificó la lógica productiva durante esta auditoría.**
