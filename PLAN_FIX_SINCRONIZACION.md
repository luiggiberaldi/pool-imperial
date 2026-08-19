# Auditoría de sincronización y plan de fixeo

**Fecha:** 2026-08-18
**Alcance:** flujo offline → IndexedDB/localStorage → Supabase → Broadcast/Realtime → Reportes, además de caja, mesas, órdenes y aislamiento por cuenta.
**Tipo de revisión:** auditoría estática del código y de las migraciones, más diagnóstico SQL remoto. Se ejecutó únicamente hardening idempotente de políticas/privilegios; no se modificaron datos de negocio.

## Estado de implementación

El Sprint P0 quedó aplicado en el checkout:

- `offlineQueueService` conserva `localId`, `idempotency_key`, `owner_user_id`, conflictos y estados de reconciliación; no borra fallidos automáticamente.
- Checkout y Reportes distinguen ventas locales pendientes de ventas confirmadas.
- El merge de ventas usa identidad canónica y dejó de renumerar facturas en el cliente.
- El pull inicial queda fail-closed, usa páginas/cursor del servidor y la restauración forzada ya no borra la cola antes de validar.
- Logout/cambio de cuenta destruye canales de ventas y backup; órdenes filtran por cuenta.
- Caja conserva cierres offline pendientes y mesas no descartan acciones dependientes de IDs temporales.
- Se agregaron las migraciones `database/add_sales_sync_integrity.sql` y `database/harden_sync_rls.sql`.
- Los scripts inseguros `fix_rls_policies.sql`, `fix_account_isolation.sql` y `update_process_checkout.sql` quedaron marcados como deprecated para evitar que reabran el sistema.

**Actualización 2026-08-18:** las migraciones de idempotencia, reportes, RLS, Realtime y transferencias fueron auditadas y están aplicadas en Supabase. La reconciliación de las ventas pendientes no debe hacerse reenviando a ciegas; el estado remoto actual tiene 0 duplicados y 0 filas críticas sin dueño. Ver `AUDITORIA_BASE_DATOS.md`.

## 1. Resumen ejecutivo

La alerta de **“63 ventas pendientes de sincronización”** no debe interpretarse todavía como “63 ventas esperando en la red”. La pantalla de Reportes y el indicador global consultan **fuentes distintas**:

- `useReportsData.pendingSalesCount` cuenta todas las ventas locales con estado `PENDIENTE_SYNC` o `PENDIENTE_VERIFICACION`, sin importar rango.
- `SyncStatus` cuenta solamente entradas `pending` de `offline_sales_queue`.

Por eso puede aparecer `63` mientras el rango visible tiene `0 ventas`, y también puede quedar una alerta aunque la cola ya haya subido la venta. El código actualmente permite que una venta quede marcada localmente como pendiente para siempre después de sincronizarse.

Se encontraron riesgos más importantes que el problema visual:

1. **Reintentos después de timeout pueden duplicar ventas**, porque el RPC no es idempotente a nivel de base de datos.
2. **Una venta subida desde la cola no necesariamente llega a los demás dispositivos**, porque el pull de ventas depende de `sync_documents`, mientras que el RPC escribe en `sales` y la cola no publica el resultado exitoso.
3. **El arranque puede habilitar pushes después de un pull fallido**, pudiendo sobrescribir datos de nube con datos locales obsoletos.
4. **Hay migraciones RLS incompatibles entre sí**: `fix_rls_policies.sql` vuelve a permitir que cualquier usuario autenticado lea/escriba varias tablas, anulando el aislamiento por `user_id`.
5. **Colas de ventas, caja, mesas y órdenes no comparten un outbox durable ni un estado de reconciliación**, por lo que existen pérdidas silenciosas y acciones pendientes que no tienen indicador.

### Prioridad recomendada

- **P0 — antes de confiar en reportes o reintentar las 63:** idempotencia de venta, reconciliación de estados, bloqueo fail-closed del arranque, RLS y aislamiento por cuenta.
- **P1 — siguiente sprint:** cursores/paginación, outbox transaccional, cleanup/reintentos Realtime y colas de caja/mesas/órdenes.
- **P2 — después:** observabilidad, UX de sincronización, reducción de egress y pruebas de caos.

---

## 2. Mapa del flujo actual

### 2.1 Venta online

1. `processSaleTransaction` construye `rpcPayload` y genera `idempotency_key`.
2. Llama `supabase.rpc('process_checkout')`.
3. El RPC inserta en `sales` y `sale_items`.
4. Se guarda una copia local en `bodega_sales_v1`.
5. `broadcastNewSale` intenta enviar Broadcast y hace upsert de una copia en `sync_documents`.

**Problema:** los errores de Broadcast/upsert se absorben; la venta de `sales` no tiene un pull periódico directo para nuevas filas.

### 2.2 Venta offline o timeout

1. Se guarda una copia local con `PENDIENTE_SYNC` o `PENDIENTE_VERIFICACION`.
2. Se agrega el payload a `offline_sales_queue`.
3. Al volver online, `syncPendingSales` vuelve a llamar `process_checkout`.
4. Si el RPC responde, marca la entrada de cola como `synced` e intenta actualizar la venta local.

**Problema:** la copia local no persiste la misma clave de idempotencia, el resultado del RPC no se asocia con el ID/número de servidor y el estado `PENDIENTE_VERIFICACION` nunca se cambia en la actualización local.

### 2.3 Catálogo/configuración

- `storageService` usa localforage/IndexedDB y llama a `scheduleCloudPush`.
- `useCloudSync` conserva una cola genérica `_poolbar_sync_queue` para claves de configuración.
- Supabase guarda una fila por documento en `sync_documents`.
- Broadcast acelera la propagación; `pullLatestFromCloud` funciona como fallback.

**Problema:** la cola genérica es una lista de claves sin versión, sin intento/lease y con cursores que se adelantan aunque haya error.

### 2.4 Mesas, órdenes y caja

- Mesas: cache local + updates directos + `pool_pending_table_actions`.
- Órdenes: cache local + updates directos + `pending_order_table_moves`.
- Caja: cache local + `poolbar_pending_cash_open`; no existe cola equivalente confiable para cierre.
- Realtime y polling actúan como aceleradores/fallbacks independientes.

**Problema:** no existe una operación única con `operation_id`, precondición, reintento, resultado canónico y dead-letter para estas entidades.

---

## 3. Hallazgos priorizados

| ID | Prioridad | Hallazgo | Impacto |
|---|---|---|---|
| SYNC-01 | **P0** | El estado local pendiente no queda vinculado al resultado de la cola. | Reportes falsos; ventas pendientes eternas. |
| SYNC-02 | **P0** | `process_checkout` no implementa idempotencia real en SQL. | Doble cobro/duplicados tras timeout o reintento. |
| SYNC-03 | **P0** | El arranque marca sync inicial como listo aunque el pull falle. | Push local obsoleto puede sobrescribir nube. |
| SYNC-04 | **P0** | RLS permisivo contradice el aislamiento por cuenta. | Lectura/escritura cruzada entre cuentas. |
| SYNC-05 | **P0** | Cola offline con read-modify-write de arrays. | Una pestaña puede borrar entradas agregadas por otra. |
| SYNC-06 | **P0** | Ventas nuevas dependen de `sync_documents`/Broadcast, no de una fuente autoritativa completa. | Otros dispositivos pueden no ver ventas válidas. |
| SYNC-07 | **P0** | `forcePullFromCloud` borra la cola antes de confirmar el pull. | Pérdida irreversible de operaciones locales. |
| SYNC-08 | **P0** | Scope local basado en email/unscoped y cola sin `owner_user_id`. | Riesgo de subir datos de una cuenta a otra al cambiar sesión. |
| SYNC-09 | **P1** | Cursores avanzan con reloj local y sin manejo de error/paginación robusto. | Cambios omitidos o retrasos silenciosos. |
| SYNC-10 | **P1** | Broadcast/Realtime carece de cleanup completo al logout y algunos canales no son resilientes. | Duplicación de listeners, eventos perdidos y stale state. |
| SYNC-11 | **P1** | `fixDuplicateNumbers` renumera ventas localmente. | Facturas diferentes entre dispositivos y números históricos mutados. |
| SYNC-12 | **P1** | Colas de mesas/caja/órdenes no son idempotentes ni tienen dead-letter. | Estados de mesa/caja inconsistentes después de cortes. |
| SYNC-13 | **P1** | Reportes tratan estados pendientes como ventas confirmadas. | Totales y cierres pueden incluir ventas no confirmadas. |
| SYNC-14 | **P1** | `sync_documents` usa last-write-wins sin versión/tombstone. | Un update atrasado puede revivir o sobrescribir un estado nuevo. |
| SYNC-15 | **P2** | No hay una fuente única de salud de sincronización. | El usuario ve cifras contradictorias y no conoce el origen del error. |

---

## 4. Detalle técnico de los hallazgos

### SYNC-01 — Los 63 pendientes pueden ser estados huérfanos

**Evidencia:**

- `src/utils/checkoutProcessor.js`: genera `idempotencyKey`, pero el objeto `sale` persistido localmente no guarda `idempotency_key`, `localId` de la cola ni `serverSaleId`.
- `src/services/offlineQueueService.js`: después de sincronizar busca la venta local usando `item.payload.idempotency_key || item.payload.localId` y solo cambia `PENDIENTE_SYNC`.
- Ese código no actualiza `PENDIENTE_VERIFICACION`.
- La actualización directa con localforage tampoco dispara `app_storage_update`, por lo que Reportes puede permanecer con una copia React vieja.
- `src/hooks/useReportsData.js`: `pendingSalesCount` cuenta todo `allSales`, no solo el rango visible ni el contenido real de la cola.

**Resultado:** una venta puede estar `synced` en la cola y seguir `PENDIENTE_SYNC` en Reportes. También puede quedar pendiente si fue `PENDIENTE_VERIFICACION`.

**Fix:** usar una identidad canónica persistida desde el primer momento: `local_sale_id`, `idempotency_key`, `server_sale_id`, `server_sale_number`, `owner_user_id`, `sync_status`. Actualizar la copia local con el resultado del RPC y emitir un evento de estado.

### SYNC-02 — Idempotencia incompleta en checkout

`database/pool_imperial_full_schema.sql` y `database/update_process_checkout.sql` aceptan `idempotency_key`, pero el RPC inserta una venta nueva sin buscarla ni existir un índice único visible por `(user_id, idempotency_key)`. `sale_number` se calcula con `MAX(...) + 1`, también vulnerable a dos dispositivos concurrentes.

**Escenario de duplicado:**

1. El servidor inserta la venta.
2. La respuesta se pierde o tarda más de 8/12 segundos.
3. El cliente la deja pendiente.
4. El reintento vuelve a ejecutar el RPC.
5. Se crea una segunda venta.

El `23505` está clasificado como error irrecuperable en la cola, pero no sirve como reconciliación mientras la base no tenga la restricción correspondiente.

**Fix:** migración única e idempotente:

- índice único parcial o total sobre `(user_id, idempotency_key)`;
- RPC `INSERT ... ON CONFLICT ...` que devuelva la fila existente y sus IDs;
- índice único `(user_id, sale_number)` o secuencia por cuenta;
- respuesta RPC con `sale_id`, `sale_number`, `idempotency_key` y estado;
- reconciliación de timeouts antes de permitir un nuevo cobro.

### SYNC-03 — Arranque no fail-closed

En `src/hooks/useCloudSync.js`, el pull inicial destructura `data` sin conservar ni validar `error`. Si la consulta falla por red, RLS, sesión o schema, el código continúa, establece `isInitialSyncCompleted = true` y luego procesa la cola/push.

El mismo patrón aparece en `pullLatestFromCloud`: si falla la consulta, aún se guarda un timestamp de pull nuevo. Esto puede saltar cambios futuros.

**Fix:** ningún push automático hasta tener un `pull_ok` confirmado para el `user_id` actual. Guardar cursor solo con respuesta exitosa, usar estado `degraded/error`, reintentar y mostrar al usuario que los datos son locales.

### SYNC-04 — Migraciones RLS incompatibles

`database/fix_account_isolation.sql` crea políticas por `user_id`, pero `database/fix_rls_policies.sql` vuelve a crear políticas como:

```sql
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated')
```

para `cash_sessions`, `sales`, `sale_items`, `orders` y `order_items`. En PostgreSQL las políticas permisivas se combinan con OR; por tanto, una política amplia puede neutralizar la política propia.

Además:

- `useOrdersStore.syncOrders()` no filtra `orders` por `user_id`.
- `order_items` tiene políticas amplias y no posee `user_id`; debe autorizarse mediante `EXISTS` sobre la orden dueña.
- `sale_items` debe autorizarse mediante `EXISTS` sobre `sales`.
- `tables`/`pool_config` conservan excepciones para `user_id IS NULL`.
- `fix_account_isolation.sql` contiene un UUID fijo para backfill de staff/ventas; no es seguro como migración general.

**Fix:** definir una sola migración de seguridad, eliminar políticas permisivas y validar con dos cuentas reales. No liberar la sincronización hasta pasar pruebas de lectura/escritura cruzada.

### SYNC-05 — Carrera al modificar la cola

`offlineQueueService.addSaleToQueue()` lee el array completo y lo vuelve a escribir. `syncPendingSales()` hace lo mismo al final con `updatedQueue`. Si una venta se agrega mientras otra pestaña sincroniza, el último `setItem` puede reconstruir la cola desde una fotografía vieja y eliminar la nueva entrada.

El lock de localStorage tampoco es atómico, no tiene owner token y expira a los 30 segundos sin heartbeat. Una sincronización lenta puede quedar concurrente con otra.

**Fix:** outbox por registro, claim/lease por item, escritura atómica o transacción IndexedDB, `operation_id`, `attempts`, `next_retry_at`, `processing_by`, `processing_until` y dead-letter permanente. Usar `navigator.locks` cuando exista y mantener fallback con token/heartbeat.

### SYNC-06 — Fuente de verdad incompleta para ventas

`pullNewSales()` lee únicamente filas `sync_documents` de `collection = 'sale'`. Sin embargo:

- el RPC escribe en `sales`;
- `broadcastNewSale()` intenta crear el documento, pero absorbe cualquier error;
- al completar una venta desde `offline_sales_queue`, la cola no publica el resultado canónico en `sync_documents`;
- `subscribeSalesStatusChanges()` escucha solo `UPDATE`, no `INSERT`;
- `applyIncomingSale()` deduplica por `sale.id`, no por `idempotency_key`.

Una venta puede existir correctamente en `sales` y no llegar a otro dispositivo. En el caso offline, la venta local puede tener un ID distinto al ID que finalmente cree el RPC, produciendo una venta local y una remota duplicadas al hacer pull.

**Fix recomendado:** hacer `sales` la fuente autoritativa para el pull incremental y usar Broadcast solo como acelerador. Como alternativa, convertir `sync_documents` en un outbox durable que siempre se escriba dentro del mismo RPC transaccional. En ambos casos, merge por `user_id + idempotency_key`, nunca solo por ID local.

### SYNC-07 — Restauración forzada destructiva

`forcePullFromCloud()` elimina `_poolbar_sync_queue` antes de completar la consulta. Si la consulta falla, las operaciones offline desaparecen. Además, al recorrer todos los `sync_documents`, cualquier documento `collection = 'sale'` pasa a `_applyFromCloud()` como si fuera `store` y puede escribirse bajo un `doc_id` UUID en IndexedDB, en vez de mezclarse con `bodega_sales_v1`.

**Fix:** hacer snapshot de la cola, descargar y validar primero, aplicar por colección conocida y eliminar la cola solo después de reconciliar cada operación. La restauración debe ser reversible y requerir confirmación administrativa.

### SYNC-08 — Scope por email y sesión offline

`scopedKey()` usa `poolbar_cloud_email`; varias claves de `localStorage` permanecen sin scope. Las colas no almacenan `owner_user_id` y las acciones offline se reintentan con la sesión que esté activa en ese momento.

Al cambiar de cuenta en el mismo dispositivo, o al entrar en modo offline con una sesión cacheada, existe riesgo de leer datos de una cuenta previa o subirlos a la cuenta nueva. `useCloudSync` tampoco reinicia todo el motor cuando cambia el `userId`; solo observa si existe o no sesión.

**Fix:** scope por `auth.uid()` (no por email), guardar `account_id` en cada operación y abortar cualquier reintento cuyo dueño no sea el usuario autenticado. Al cambiar de cuenta: teardown completo, cargar namespace nuevo y bloquear la UI hasta terminar reconciliación.

### SYNC-09 — Cursores susceptibles a perder cambios

`pullLatestFromCloud()` y el pull inicial guardan `new Date().toISOString()` del reloj local, no el máximo `updated_at` devuelto por el servidor. Si el dispositivo está adelantado, puede saltar una actualización futura de la nube. Tampoco hay paginación explícita ni cursor compuesto `(updated_at, id)`.

`pullNewSales()` mejora el caso usando un solapamiento de un segundo, pero no pagina explícitamente ni comunica el error al consumidor; retorna `0` ante fallo. `useReportsData` puede mostrar `lastSyncedAt` aunque la consulta haya fallado.

**Fix:** cursor servidor `(updated_at, id)`, páginas de tamaño fijo, solapamiento determinista, no avanzar cursor en error y single-flight por cuenta.

### SYNC-10 — Canales Realtime y cleanup

`useCloudSync()` ignora las funciones de cleanup retornadas por `subscribeSalesRealtime()` y `subscribeSalesStatusChanges()`. El canal de solicitudes de backup tampoco se conserva para teardown. Al cerrar sesión y volver a entrar pueden quedar listeners del usuario anterior.

`useOrdersStore` mantiene una estrategia de retry distinta, limita a tres intentos y luego queda sin Realtime; no tiene un resync robusto al foreground. Caja y tablas usan polling/fallback, pero algunos canales no tienen recreación resiliente uniforme.

**Fix:** registrar cada handle por `userId`, teardown al logout/cambio de cuenta/unmount, usar un único `subscribeResilient`, y hacer pull autoritativo después de cada reconexión.

### SYNC-11 — Renumeración local de facturas

`fixDuplicateNumbers()` muta `saleNumber` de ventas locales cuando encuentra duplicados. La mutación no se persiste en servidor y puede cambiar números históricos distintos entre dispositivos.

**Fix:** nunca corregir números de factura en el cliente. El servidor asigna el número; los duplicados se reportan como conflicto para resolverlos con una migración controlada.

### SYNC-12 — Caja, mesas y órdenes

- `cashStore.closeCashSession()` limpia la caché local antes de confirmar el update y no encola un cierre fallido.
- `_retryPendingOpen()` puede repetir un insert ya aceptado por el servidor y dejarlo pendiente por `23505`.
- `openSession()` usa IDs temporales; una acción `CLOSE_SESSION` o `UPDATE_SESSION` sobre el temporal puede descartarse sin aplicarse a la sesión real cuando el alta offline aún no terminó.
- `pending_order_table_moves` no tiene `operation_id`, estado ni deduplicación por versión.
- `useOrdersStore.syncOrders()` consulta órdenes abiertas sin filtro explícito por `user_id`.

**Fix:** un outbox por dominio, operaciones con ID estable y dependencias explícitas. Un cierre de caja debe quedar pendiente hasta confirmación; `23505` debe reconciliarse por ID, no tratarse como fallo ciego.

### SYNC-13 — Reportes incluyen ventas no confirmadas

`reportsProcessor` excluye `ANULADA`, pero considera válidos todos los demás estados de `VENTA`/`VENTA_FIADA`, incluidos `PENDIENTE_SYNC` y `PENDIENTE_VERIFICACION`. Por lo tanto, una venta que aún no está en nube puede entrar en ingresos, artículos, impuestos y utilidad.

**Fix:** métricas financieras solo con `COMPLETADA` o estado canónico confirmado. Mostrar pendientes en una sección separada y no incluirlos en cierres/exportaciones salvo una opción explícita de auditoría local.

### SYNC-14 — Last-write-wins sin versión

`sync_documents` guarda `updated_at` enviado por cada cliente y `data` completo. No hay `revision`, `operation_id`, `deleted_at` ni comparación condicional. Una escritura atrasada puede sobrescribir una anulación, reactivar una configuración o perder cambios concurrentes.

**Fix:** versión monotónica por documento, `updated_by`, `revision`, tombstones para borrados y upsert condicionado (`revision` esperada). Para ventas usar eventos append-only, no sobrescritura de snapshot.

### SYNC-15 — Salud fragmentada

Reportes, `SyncStatus`, `offline_sales_queue`, `_poolbar_sync_queue`, acciones de mesas y apertura de caja muestran estados diferentes. No existe un `sync_run` común con:

- usuario/cuenta;
- último pull exitoso;
- último push exitoso;
- cantidad pending/processing/failed/conflict;
- último error por operación;
- edad de la operación más antigua;
- latencia y versión del cursor.

**Fix:** crear un store/servicio de salud único y que Reportes consuma ese estado, no una aproximación derivada de ventas locales.

---

## 5. Plan de fixeo propuesto

### Sprint 0 — Contención y reconciliación segura (P0)

1. No reintentar automáticamente las 63 ventas sin reconciliar; exportar una copia de `bodega_sales_v1` y `offline_sales_queue` por cuenta.
2. Mostrar tres contadores separados: `local_pending`, `queue_pending`, `queue_failed/conflict`; no presentar uno como el otro.
3. Excluir `PENDIENTE_SYNC` y `PENDIENTE_VERIFICACION` de ingresos/utilidad/cierres; conservarlos en auditoría.
4. Deshabilitar temporalmente `forcePullFromCloud()` destructivo y el purge automático de pendientes fallidos.
5. Ejecutar las consultas SQL de verificación de la sección 7.
6. Para cada pendiente existente, buscar por `idempotency_key`, `server_sale_id`, hora/total/usuario y revisar duplicados antes de volver a enviar.

**Salida:** inventario de pendientes clasificado como `confirmada`, `no encontrada`, `duplicada`, `conflicto` o `payload inválido`.

### Sprint 1 — Outbox de ventas e idempotencia SQL (P0)

1. Generar una sola `operation_id`/`idempotency_key` y persistirla antes del primer intento.
2. Guardar esa clave en la venta local, en la cola y en cualquier Broadcast.
3. Añadir `owner_user_id`, `local_sale_id` y `server_sale_id` al contrato.
4. Crear índice único por cuenta y clave de idempotencia.
5. Reescribir `process_checkout` para devolver la venta existente en reintentos.
6. Añadir constraint/sequence para `sale_number` por cuenta.
7. Al sincronizar, guardar el ID/número de servidor y marcar `COMPLETADA`; en error permanente marcar `SYNC_ERROR` con payload retenido.
8. Publicar el resultado canónico en el canal de ventas; el dispositivo receptor hace merge por idempotencia.
9. Emitir `app_storage_update`/evento de store después de cada transición.

**Guardrail:** ningún reintento puede crear una segunda venta con la misma clave; ningún éxito puede quedar visualmente pendiente.

### Sprint 2 — Motor outbox durable y cursores (P0/P1)

1. Sustituir arrays completos por registros individuales en IndexedDB.
2. Implementar `pending → processing → synced/failed/conflict`, lease con expiración, attempts, backoff con jitter y dead-letter sin borrado automático.
3. Garantizar single-flight por `owner_user_id` y operación.
4. Implementar cursor compuesto del servidor, paginación, límite, solapamiento y no avance en error.
5. Bloquear push hasta un pull inicial exitoso; si falla, permanecer en `DEGRADED`.
6. Hacer reconciliación periódica de local, outbox y servidor.
7. Mantener el cursor y la última sincronización en namespace de `auth.uid()`.

### Sprint 3 — Cuenta, RLS y migraciones (P0)

1. Consolidar `fix_account_isolation.sql` y retirar las políticas amplias de `fix_rls_policies.sql`.
2. Eliminar los `OR user_id IS NULL` después de un backfill revisado por cuenta.
3. Cambiar `sale_items`/`order_items` a políticas `EXISTS` sobre su entidad padre.
4. Añadir filtros `user_id` en todas las consultas y canales.
5. Reemplazar el UUID fijo del backfill por un procedimiento que reciba la cuenta explícita y genere un informe de filas ambiguas.
6. Cambiar namespace local de email a `auth.uid()` y hacer teardown completo ante cambio de usuario.
7. Añadir pruebas de seguridad con dos cuentas y datos parecidos.

### Sprint 4 — Realtime y dominios operativos (P1)

1. Registrar y destruir todos los handles al logout/cambio de cuenta.
2. Unificar reconexión con backoff, jitter y pull autoritativo posterior.
3. Añadir fallback de foreground/online para órdenes y caja.
4. Crear outbox de caja con apertura/cierre idempotentes y reconciliación de `23505`.
5. Resolver dependencias de mesa temporal con `operation_id` y una máquina de estados; no descartar cierres/updates dependientes.
6. Añadir eventos de `INSERT/UPDATE/DELETE` necesarios y filtros de cuenta.

### Sprint 5 — Reportes, estado y observabilidad (P1/P2)

1. Crear `useSyncHealth` o equivalente como fuente única.
2. Mostrar edad de la operación más antigua, último éxito/error, origen del contador y botón de reconciliación.
3. Separar claramente “confirmadas”, “pendientes locales”, “fallidas” y “conflictos”.
4. Exportar pendientes sin incluirlos en métricas financieras por defecto.
5. Eliminar `fixDuplicateNumbers` del flujo productivo; conservar solo un detector de conflictos.
6. Medir duración de pull/push, tamaño de lote, reintentos, errores por código y canales activos.

---

## 6. Orden de despliegue y migraciones

1. **Backup verificado** de ventas, cola local y datos de cuenta.
2. Ejecutar `database/add_sales_sync_integrity.sql` después de revisar duplicados.
3. Ejecutar un backfill revisado por cuenta para filas `user_id IS NULL`.
4. Ejecutar `database/harden_sync_rls.sql` como último script de políticas.
5. Verificar políticas antes de activar clientes nuevos.
6. Publicar cliente compatible con esquema viejo: lee estados legacy, pero no hace migraciones destructivas.
7. Activar outbox nuevo detrás de una bandera; mantener lectura/reconciliación del formato antiguo.
8. Migrar pendientes antiguos a operaciones con estado `NEEDS_RECONCILIATION`.
9. Activar reportes confirmados y contadores separados.
10. Retirar el flujo viejo solo cuando no queden operaciones legacy sin clasificar.

Las migraciones de Realtime (`ALTER PUBLICATION ... ADD TABLE`) deben hacerse idempotentes consultando `pg_publication_tables`; los scripts actuales pueden fallar al ejecutarse por segunda vez.

---

## 7. Consultas SQL de verificación (solo lectura)

Ejecutar en Supabase con la cuenta administrativa y exportar el resultado:

```sql
-- 1. Ventas por cuenta y estado
select user_id, status, count(*)
from public.sales
group by user_id, status
order by user_id, status;

-- 2. Idempotencias duplicadas
select user_id, idempotency_key, count(*) as repetitions,
       min(id) as first_sale, max(id) as last_sale
from public.sales
where idempotency_key is not null
group by user_id, idempotency_key
having count(*) > 1;

-- 3. Números de venta duplicados por cuenta
select user_id, sale_number, count(*) as repetitions
from public.sales
group by user_id, sale_number
having count(*) > 1;

-- 4. Documentos de sincronización por colección
select user_id, collection, count(*)
from public.sync_documents
group by user_id, collection
order by user_id, collection;

-- 5. Políticas efectivas
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 6. Tablas publicadas en Realtime
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;

-- 7. Filas sin dueño que requieren backfill controlado
select 'sales' as table_name, count(*) from public.sales where user_id is null
union all
select 'cash_sessions', count(*) from public.cash_sessions where user_id is null
union all
select 'table_sessions', count(*) from public.table_sessions where user_id is null
union all
select 'orders', count(*) from public.orders where user_id is null;
```

Para el caso de las 63 ventas, comparar además desde DevTools/localforage:

- ventas locales por `status`;
- entradas de `offline_sales_queue` por `sync_status`;
- `idempotency_key` de ambas fuentes;
- antigüedad de la entrada más vieja;
- errores y `attempts`;
- ventas remotas encontradas por clave, total y timestamp.

---

## 8. Matriz mínima de pruebas antes de liberar

### Ventas y cola

- Offline: crear 1 venta, reconectar, confirmar exactamente 1 fila remota y estado local `COMPLETADA`.
- Timeout después de commit: repetir 10 veces; debe existir una sola venta.
- Timeout antes de commit: debe poder reintentar una sola vez.
- Dos pestañas agregan ventas mientras una sincroniza: ninguna entrada desaparece.
- Dos pestañas sincronizan la misma operación: una sola ejecución efectiva.
- Error 400/23502/42501: pasa a `SYNC_ERROR`, conserva payload y muestra acción manual.
- Venta `PENDIENTE_VERIFICACION`: se reconcilia y no queda pendiente tras éxito.
- Broadcast perdido: el pull autoritativo encuentra la venta.
- Broadcast duplicado y pull duplicado: el merge no duplica.
- Números de factura concurrentes: nunca se renumeran localmente.

### Cursor y recuperación

- Error de red durante pull: cursor no avanza.
- Reloj local adelantado/atrasado: no se omiten documentos.
- Más de 1.000 ventas nuevas: todas llegan por páginas.
- Muchas filas con el mismo `updated_at`: todas llegan.
- App suspendida, vuelve al foreground: pull autoritativo y único.
- Refresh de token: no crea canales duplicados.
- Logout/login con otra cuenta: no quedan listeners ni operaciones de la cuenta anterior.

### Seguridad

- Cuenta A no puede leer/escribir ventas, items, órdenes, caja o documentos de B.
- `order_items` y `sale_items` no se pueden consultar sin pertenecer al padre.
- Operación offline de A no se puede enviar con sesión B.
- No quedan filas legacy sin dueño antes de activar RLS estricto.

### Caja, mesas y órdenes

- Abrir caja offline y reconectar tras respuesta perdida: una sola sesión.
- Cerrar caja offline: queda pendiente y no reaparece como abierta sin advertencia.
- Abrir mesa offline, agregar consumo y cerrar antes del primer sync: las dependencias se resuelven en orden.
- Mover orden entre mesas offline y reconectar: un solo destino final.
- Reconnect Realtime después de dormir la aplicación: estado autoritativo correcto.

### Reportes

- Pendientes no aparecen en ingresos/utilidad/cierres confirmados.
- La alerta distingue rango visible de total global pendiente.
- El contador de Reportes coincide con el outbox después de cada transición.
- Exportación y pantalla usan la misma clasificación de estados.

---

## 9. Criterios de aceptación

El fix se considera listo cuando:

- una operación con la misma `idempotency_key` produce como máximo una venta remota;
- el estado local, cola y servidor convergen después de reinicio, timeout o pérdida de Broadcast;
- ningún cursor avanza tras error ni omite filas por reloj/paginación;
- el cambio de cuenta no mezcla datos ni canales;
- RLS bloquea lecturas cruzadas en dos cuentas de prueba;
- caja/mesas/órdenes tienen operación pendiente visible y reintentable;
- Reportes no contabiliza operaciones sin confirmación remota;
- el caso de las 63 queda clasificado y no se resuelve reenviando a ciegas;
- existe una prueba automatizada de cada escenario P0 y una prueba manual con dos dispositivos.

**No se modificó la lógica productiva durante esta auditoría; este archivo es el reporte y plan de implementación.**