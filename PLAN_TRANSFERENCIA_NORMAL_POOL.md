# Plan: Transferencia de mesa Normal → Pool

> **Estado:** IMPLEMENTADO — selector obligatorio, guardrails de cargos por asiento, validación previa, operación idempotente local y aviso offline ya están integrados; queda como mejora futura la RPC transaccional en Supabase.
> **Fecha:** 18-Ago-2026
> **Objetivo:** mover una cuenta de una mesa Normal a una mesa Pool sin cobrar el tiempo anterior en barra y comenzar un nuevo contexto tarifario desde el traslado.

---

## 1. Regla de negocio definitiva

La operación debe tratarse como un **cambio de contexto tarifario**, no como la continuación del tiempo de la mesa Normal.

### Debe ocurrir

1. El tiempo transcurrido en la mesa Normal vale **$0 como tiempo de Pool**.
2. El nuevo cobro de Pool empieza en el instante confirmado por el servidor.
3. El operador debe elegir explícitamente el modo de cobro nuevo:
   - **Libre por tiempo**, si el local permite este modo.
   - **Prepago**: 30 minutos, 1 hora u otra cantidad configurada.
   - **Jugada/Piña**.
4. Se conserva la cuenta comercial:
   - Productos y cantidades.
   - Clientes y asientos.
   - Notas y abonos históricos.
   - Precio original de cada producto.
5. Se registra una acción de auditoría con origen, destino, operador, modo nuevo y timestamp.

### Nunca debe ocurrir

- Heredar `hours_paid`, `extended_times` o `paid_at` de la mesa Normal.
- Cobrar retroactivamente el tiempo pasado en barra.
- Mantener offsets o pausas de la sesión Normal.
- Duplicar productos, cargos por asiento o abonos.
- Transferir una sesión que ya está en `CHECKOUT`.
- Fusionar contra una mesa destino en `CHECKOUT`.

> **Decisión pendiente del negocio:** el README indica “solo horas prepagadas”, pero el motor actual también soporta modo libre. Si la regla de producción es realmente solo prepago, ocultar “Libre” y usar “Prepago 30 min” como opción inicial recomendada.

---

## 2. Flujo operativo propuesto

```text
Mesa Normal activa
      │
      ▼
Operador pulsa “Mover”
      │
      ▼
Selecciona mesa Pool libre
      │
      ▼
Validación: sesión ACTIVE, destino libre, no duplicados
      │
      ▼
Modal “Normal → Pool”
  - Tiempo anterior en barra: $0
  - Consumo actual: $X
  - Modo nuevo: Libre / Prepago / Jugada
  - Inicio de Pool: ahora
      │
      ▼
Confirmación explícita
      │
      ▼
Transferencia de sesión + comanda + metadata
      │
      ▼
Mesa Pool activa con nuevo cobro desde el timestamp del servidor
```

Si el operador cancela el modal, no se modifica ninguna sesión, orden, offset ni asiento.

---

## 3. Contrato de datos al confirmar

### Sesión

Para `NORMAL → POOL`, el patch debe contener como mínimo:

```js
{
  table_id: targetPoolTableId,
  started_at: serverNow,
  game_mode: selectedPoolMode,
  hours_paid: selectedHoursPaid,
  extended_times: selectedRounds,
  paid_at: null,
  paused_at: null
}
```

- `selectedPoolMode = 'NORMAL'` solo si representa el modo libre del producto.
- Para prepago, `hours_paid` debe ser la cantidad seleccionada.
- Para jugada, `game_mode = 'PINA'` y la cantidad debe representar únicamente las jugadas nuevas.
- No copiar `started_at`, `hours_paid`, `extended_times` ni `paid_at` de la mesa Normal.

### Comanda

- Actualizar `orders.table_id` al Pool destino.
- Mantener `orders.table_session_id` sin cambiar.
- Mantener `order_items` completos, incluyendo `qty` fraccionaria y `seat_id` remapeado si existe colisión.
- No crear una segunda orden para la misma sesión.
- Si falla la red, encolar el movimiento y no crear una orden duplicada.

### Runtime local

Limpiar para el ID de sesión:

- `paid_hours_offsets`.
- `paid_rounds_offsets`.
- `paid_elapsed_offsets`.
- `paid_sessions`.
- `paused_sessions`.

Emitir los broadcasts correspondientes para que otros dispositivos no conserven un estado pagado o pausado obsoleto.

---

## 4. UX requerida

El modal de confirmación debe mostrar:

- Mesa origen y destino.
- Tipo `Normal → Pool`.
- “Tiempo anterior en barra: **no se cobra**”.
- Consumo actual de la cuenta.
- Selector obligatorio del modo de Pool.
- Hora exacta de inicio estimada.
- Advertencia si existen cargos manuales por asiento.
- Botones `Cancelar` y `Confirmar traslado`.

El botón de confirmación debe estar deshabilitado hasta que exista un modo válido.

Texto recomendado:

> “El tiempo usado en la mesa Normal no se cobrará como Pool. El nuevo cobro comenzará ahora en la mesa Pool. El consumo y los clientes se conservarán.”

Si la sesión Normal tiene cargos de tiempo manuales por asiento, mostrar:

> “Hay cargos de tiempo asignados a clientes. ¿Deseas conservarlos como cargos válidos en Pool?”

La política recomendada es conservarlos solo con confirmación; si el local prohíbe tiempo en mesas Normales, limpiarlos y registrarlo en auditoría.

---

## 5. Fases de implementación

### Fase 0 — Cerrar decisión comercial

- [ ] Confirmar si producción permite modo libre.
- [ ] Confirmar el modo predeterminado: recomendado `Prepago 30 min` si solo se aceptan horas prepagadas.
- [ ] Definir política para `seat.timeCharges[]` originados en una mesa Normal.

### Fase 1 — Motor puro

- [x] Validar origen/destino y estados `ACTIVE`/`CHECKOUT`.
- [x] Generar patch Normal→Pool con reloj nuevo y `paid_at: null`.
- [x] Limpiar offsets y pausa.
- [x] Conservar consumo, asientos, clientes y notas.
- [x] Remapear colisiones de `seat_id`.
- [x] Incorporar `selectedPoolMode`, `selectedHoursPaid` y `selectedRounds` al plan puro.

### Fase 2 — Modal de confirmación

- [x] Agregar selector obligatorio de modo Pool.
- [x] Mostrar resumen económico y advertencia de no retroactividad.
- [x] Confirmar explícitamente cargos manuales por asiento.
- [x] Bloquear traslado desde `CHECKOUT`.

### Fase 3 — Persistencia segura

- [x] Actualizar la sesión y mover el `table_id` de la orden.
- [x] Encolar movimiento de orden si falla la red.
- [x] Verificar cantidades fraccionarias y precios históricos.
- [x] Hacer la operación idempotente dentro del cliente con `TRANSFER_OPERATION_ID` y bloqueo de doble ejecución.
- [ ] Preferiblemente mover sesión y orden mediante una RPC transaccional de Supabase con locks sobre origen y destino.

### Fase 4 — Auditoría y observabilidad

- [x] Registrar transferencia en bitácora.
- [x] Guardar en el evento el modo elegido, horas/jugadas nuevas y `started_at`.
- [x] Mostrar advertencia diferenciada cuando la operación queda encolada offline.
- [ ] Registrar conflictos autoritativos de concurrencia entre dispositivos mediante RPC.

### Fase 5 — Pruebas y despliegue

- [x] Agregar pruebas de matriz Normal/Pool, validaciones, fusiones, colisiones, modos y guardrails.
- [x] Verificar build de producción.
- [ ] Ejecutar el Tester de Mesas desde el panel de administración.
- [ ] Ejecutar pruebas manuales con una caja de prueba.
- [ ] Desplegar primero a un dispositivo piloto.
- [ ] Revisar bitácora y totales durante un turno antes de habilitarlo para todos.

---

## 6. Matriz de pruebas obligatoria

| Caso | Resultado esperado |
|------|--------------------|
| Normal vacía → Pool libre | Nuevo reloj desde ahora; sin cobro retroactivo |
| Normal con productos → Pool | Productos y cantidades idénticos |
| Normal pagada (`paid_at`) → Pool | `paid_at` limpiado; nuevo tiempo cobrable desde ahora |
| Normal con abono → Pool | Historial conservado; no se descuenta dos veces |
| Normal con varios asientos → Pool | Clientes, `guest_count` y `seat_id` correctos |
| Normal con cargos manuales → Pool | Conservados o limpiados según confirmación/política |
| Normal pausada → Pool | Pausa eliminada; Pool inicia activo desde ahora |
| Normal → Pool prepago | Solo se cobra la cantidad nueva seleccionada |
| Normal → Pool jugada | Solo se cobra la jugada nueva |
| Normal → Pool destino `CHECKOUT` | Operación rechazada sin mutaciones |
| Origen `CHECKOUT` → Pool | Operación rechazada |
| Destino inexistente | Operación rechazada |
| Doble sesión en origen/destino | Operación rechazada |
| Doble clic | Una sola transferencia |
| Dos dispositivos simultáneos | Un resultado autoritativo; sin órdenes duplicadas |
| Offline | Estado y operación quedan encolados sin duplicar órdenes |
| Reintento de operación | Resultado idempotente |

---

## 7. Criterios de aceptación

La funcionalidad se considera lista cuando:

1. El total de productos antes y después del traslado coincide exactamente.
2. El tiempo anterior en Normal nunca aparece como tiempo facturable en Pool.
3. `started_at` de Pool corresponde al momento confirmado por el servidor.
4. `paid_at` y offsets anteriores no reducen el primer cobro de Pool.
5. La comanda tiene un solo registro y apunta a la mesa Pool.
6. No existen ítems duplicados ni cantidades fraccionarias alteradas.
7. Los abonos e importes compartidos conservan el mismo saldo.
8. Una sesión en `CHECKOUT` no puede ser transferida.
9. La operación puede reintentarse sin duplicar consumo.
10. Todas las operaciones quedan auditadas.

---

## 8. Riesgos y mitigaciones

### Concurrencia entre dispositivos

La validación en frontend evita errores normales, pero no elimina una carrera entre dos dispositivos. La solución definitiva es una RPC transaccional que:

1. Bloquee origen y destino con `FOR UPDATE`.
2. Verifique que origen siga `ACTIVE` y destino siga libre/activo.
3. Mueva sesión y orden en una sola transacción.
4. Devuelva el estado final autoritativo.

### Regla ambigua de modo libre

El código actual soporta modo libre, pero la documentación del producto indica solo horas prepagadas. Esta decisión debe cerrarse antes de habilitar el selector en producción.

### Cargos manuales en mesa Normal

No deben interpretarse automáticamente como tiempo válido. Requieren una política explícita y una prueba de regresión para evitar cobros inesperados.
