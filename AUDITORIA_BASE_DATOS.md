# Auditoría completa de base de datos

**Fecha local:** 2026-08-18
**Proyecto:** `abbrcppmwsmxhoaxkgsh` (`pool bar imperial`)
**Alcance:** esquema público, migraciones del repositorio, RPC, RLS, índices, Realtime e integridad de ventas/mesas/transferencias.

> El token se leyó desde `.env`, se usó únicamente en memoria y no se guardó, imprimió ni incluyó en este documento.

## Resultado ejecutivo

La base remota ya tenía aplicadas las migraciones principales. El `404` anterior de `transfer_table_atomic` quedó resuelto: la función existe y está expuesta con la firma esperada.

Se ejecutó una migración adicional segura:

```text
database/harden_device_backups_and_rpc_grants.sql
```

Esta migración:

- eliminó la política pública `USING (true)` de `device_backups`;
- restringió los backups a dispositivos registrados en `account_devices` para la cuenta autenticada;
- revocó ejecución a `PUBLIC` y `anon` de los RPC financieros y de transferencia;
- conservó ejecución para `authenticated` y `service_role`.

No se modificaron ventas, órdenes, sesiones, cargos ni datos históricos.

## Objetos verificados

### Tablas y columnas

Presentes todas las entidades críticas:

- `sales`, `sale_items`;
- `sync_documents`;
- `cash_sessions`;
- `tables`, `table_sessions`;
- `orders`, `order_items`;
- `pool_config`, `pool_customers`;
- `staff_users`, `staff_debts`, `staff_debt_payments`;
- `table_transfer_operations`;
- `table_transfer_item_links`;
- `table_transfer_charges`.

También están presentes las columnas necesarias para transferencias y reportes:

- `table_sessions.transfer_metadata`;
- `table_sessions.paused_at`;
- `order_items.transfer_operation_id`;
- `order_items.transfer_source_item_id`;
- `order_items.seat_id`;
- `order_items.unit_price_bs`;
- `sales.cash_session_id`;
- `sales.updated_at`.

### RPC

Presentes y `SECURITY DEFINER`:

```text
process_checkout(jsonb)
transfer_table_atomic(text, uuid, uuid, text, jsonb)
transfer_pool_to_normal_atomic(text, uuid, uuid, text, numeric, jsonb)
register_and_check_device(text, text, text)
```

`process_checkout` conserva idempotencia y publicación durable en `sync_documents`. La RPC general de transferencia usa locks de filas y advisory lock.

### RLS

Las tablas operativas y de sincronización tienen RLS activo y políticas por `auth.uid()`. Los items heredan autorización mediante su orden/venta padre.

`device_backups` quedó corregida con política por dispositivo registrado; ya no existe una política `USING (true)`.

### Índices

Verificados:

- `uq_sales_owner_idempotency`;
- `uq_sales_owner_sale_number`;
- índices de cursor/propietario para `sales` y `sync_documents`;
- índices de operaciones, enlaces y cargos de transferencia;
- índice único por operación para ítems y cargos.

### Realtime

Publicadas las tablas necesarias para el cliente actual:

```text
cash_sessions
order_items
orders
sales
sync_documents
table_sessions
tables
```

`table_transfer_*` no está publicado porque el cliente adopta la respuesta de la RPC y sincroniza órdenes/sesiones. Si se implementa un monitor remoto de operaciones, deberá añadirse publicación o un endpoint de reconciliación.

## Integridad de datos observada

| Entidad | Filas | Filas sin `user_id` |
|---|---:|---:|
| `sales` | 898 | 0 |
| `sync_documents` | 1.198 | 0 |
| `cash_sessions` | 93 | 0 |
| `tables` | 58 | 0 |
| `table_sessions` | 992 | 0 |
| `orders` | 9 | 0 |
| `order_items` | 21 | — |
| `table_transfer_operations` | 11 | 0 |
| `table_transfer_item_links` | 4 | — |
| `table_transfer_charges` | 3 | 0 |

Guardrails que dieron cero:

- duplicados de `idempotency_key` por cuenta;
- duplicados de `sale_number` por cuenta;
- más de una sesión `ACTIVE/CHECKOUT` por mesa;
- más de una orden `OPEN/PENDING` por sesión;
- operaciones de transferencia incompletas;
- órdenes huérfanas;
- `order_items` huérfanos;
- cargos sin operación, sin item o negativos;
- cargos congelados sin `operation_id`.

Los tres cargos registrados suman **13.000** y todos tienen operación y `order_item` asociado.

## Observación de trazabilidad

Los cuatro registros de `table_transfer_item_links` están marcados `APPLIED`, pero sus `target_order_item_id` ya no resuelven a una fila actual de `order_items`. El total financiero actual no muestra orfandad de órdenes, pero la auditoría histórica de copias queda incompleta cuando un item destino se elimina junto con una orden.

Esto requiere un fix P1 de trazabilidad: conservar un snapshot mínimo del item destino, usar una FK con política de retención/tombstone o impedir borrar físicamente items enlazados. No se corrigió automáticamente porque no es seguro reconstruir items históricos sin decidir la política contable.

## Migraciones que no deben ejecutarse

No ejecutar estos scripts históricos tal como están:

- `database/update_process_checkout.sql` — marcado `DEPRECATED`;
- `database/fix_rls_policies.sql` — puede reabrir acceso entre cuentas;
- `database/fix_account_isolation.sql` — contiene backfill histórico con UUID fijo;
- `database/fix_data_cleanup.sql` — contiene borrados y columnas antiguas;
- `database/fix_constraints.sql` — referencia nombres de columnas que no existen en el esquema actual;
- `database/fix_orphan_orders*.sql` — contienen estados/columnas legacy y deben revisarse antes de usar.

`add_pool_normal_transfer_rpc.sql` ya dejó una RPC legacy presente, pero no es sustituto de `transfer_table_atomic`; la ruta general actual debe seguir usando la RPC atómica.

Algunas columnas antiguas de caja (`base_usd`, `base_bs`, `updated_at`) y de `sale_items` (`quantity`, `unit_price`) no existen remotamente. El cliente actual usa `initial_cash_usd`, `final_cash_usd`, `qty` y `price_usd`; por eso no se agregaron columnas legacy sin una migración funcional explícita.

## Prueba E2E determinista ejecutada

Se ejecutó una prueba contra la RPC usando únicamente filas sintéticas dentro de una transacción que terminó con rollback automático:

```text
Normal → Pool → Normal
```

Escenario validado:

- consumo sintético de 2 unidades a 12.000 cada una;
- 60 minutos transcurridos;
- 30 minutos representados como pagados mediante `paidElapsedOffsets`;
- saldo esperado: 30 minutos = 5.000;
- reintento de Pool → Normal con el mismo `operation_id`, enviando deliberadamente otro importe.

Resultado:

- `PASSED_ROLLBACK`;
- cargo real dentro de la transacción: **5.000**;
- total de items dentro de la transacción: **29.000**;
- operaciones creadas durante la prueba: **2**;
- línea congelada creada: **1**;
- reintento devolvió exactamente el resultado original;
- verificación posterior: mesas, sesiones, operaciones, cargos e items sintéticos persistentes: **0**.

La prueba valida la atomicidad e idempotencia de la RPC y no ejecutó la UI. Tampoco puede demostrar todavía el recálculo financiero servidor-side: el RPC actual recibe el importe congelado desde el payload, riesgo ya identificado como P0.

## Riesgos pendientes

1. **P0 financiero:** `transfer_table_atomic` y `process_checkout` aún reciben importes/base financiera desde payload del cliente; se debe validar o recalcular en servidor antes de considerar el servidor como fuente fiscal completa.
2. **P1 concurrencia:** la RPC de transferencia toma locks de filas antes del advisory lock y elige la primera sesión/orden con `LIMIT 1`; debe reordenar locks y rechazar multiplicidad.
3. **P1 trazabilidad:** resolver los cuatro enlaces con destino eliminado mediante tombstones/snapshot, no borrado destructivo.
4. **P1 dispositivos antiguos:** `account_devices` tiene 22 registros y solo 6 con `user_id`; revisar los 16 legacy antes de depender de backups cloud para ellos. `device_backups` actualmente tiene 0 filas.
5. **P2 Realtime:** publicar `table_transfer_operations` solo si se necesita observabilidad remota; mientras tanto mantener reconciliación por `operation_id`.

## Verificación posterior

Después de aplicar la hardening, la auditoría confirmó:

- tablas críticas faltantes: 0;
- operaciones no completadas: 0;
- duplicados de ventas: 0;
- duplicados de sesiones/órdenes activas: 0;
- RPC críticas sin acceso `anon`: 0;
- política pública de backups: eliminada.

No se ejecutó ninguna transferencia real ni checkout de prueba contra datos productivos.
