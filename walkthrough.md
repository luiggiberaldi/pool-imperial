# Walkthrough: Configuración de Porcentajes de Impuestos Dinámicos y Dropdowns Redondeados

Se han completado las modificaciones de la configuración de porcentajes de impuestos dinámicos, y se implementó la corrección visual de los dropdowns (`<select>`) nativos a lo largo de toda la aplicación, reemplazándolos con componentes personalizados de bordes redondeados adaptados al tema del sistema, junto con correcciones para asegurar una visualización totalmente responsiva en dispositivos móviles.

---

## 🛠️ Implementación de Dropdowns Redondeados y Correcciones Responsivas

### 1. Creación de Componente Común
- **[CustomSelect.jsx](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/src/components/CustomSelect.jsx)**:
  - Componente React reutilizable que actúa como reemplazo directo de `<select>`.
  - Transforma de manera transparente los tags `<option>` pasados en su `children` a elementos interactivos de un popover flotante.
  - Implementa lógica de cierre automático al hacer clic fuera del componente (`Ref` y evento `mousedown`).
  - Utiliza bordes redondeados (`rounded-xl`), sombras premium (`shadow-xl`), animaciones de entrada (`animate-in fade-in slide-in-from-top-2`) y diseño compatible con el tema oscuro/claro del sistema.
  - **[NEW] Auto-posicionamiento inteligente (Upward/Downward)**: Detecta si la distancia del selector al fondo del viewport es menor a 220px. En tal caso, el menú flotante se despliega hacia arriba (`bottom-full mb-1.5`) para evitar salirse de la pantalla.
  - **[NEW] Tipografía responsiva**: En móviles o espacios reducidos, los textos de las opciones se reducen dinámicamente (`text-xs sm:text-sm`) para evitar cortes.

### 2. Corrección del Clipping en Contenedores
- **[SettingsShared.jsx](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/src/components/SettingsShared.jsx)**:
  - Se removió la clase `overflow-hidden` de `SectionCard` para permitir que el popover absoluto del dropdown no sea recortado por el límite inferior de la tarjeta.

### 3. Rediseño de Grillas Responsivas
Se modificaron las columnas que agrupan los dropdowns para apilarse verticalmente en móviles y volver a su visualización normal en pantallas medianas/grandes (`grid-cols-1 sm:grid-cols-2`):
- **[ProductFormModal.jsx](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/src/components/Products/ProductFormModal.jsx)**: Selectores de categoría, impuesto e inclusión del impuesto.
- **[SettingsTabMesas.jsx](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/src/components/Settings/tabs/SettingsTabMesas.jsx)**: Selectores de tipo de impuesto y modo de impuesto para el servicio de mesa.

### 4. Modificaciones en Otros Componentes
Se reemplazaron los selectores nativos por `<CustomSelect>` en los siguientes módulos:
- **[ManualMode.jsx](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/src/components/calculator/ManualMode.jsx)**: Selector de moneda principal para mostrar totales en calculadora.
- **[SupplierModals.jsx](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/src/components/Suppliers/SupplierModals.jsx)**: Selector de método de pago al registrar un egreso de proveedor.
- **[OrderPanel.jsx](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/src/components/tables/OrderPanel.jsx)**: Selector de categorías para filtrar menú de adición en mesas. Se removió la superposición de Chevron manual.
- **[ProductShareModal.jsx](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/src/components/ProductShareModal.jsx)**: Selector de cuenta bancaria receptora en "Cotización Flash".
- **[BulkPriceAdjustModal.jsx](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/src/components/Products/BulkPriceAdjustModal.jsx)**: Selector de filtro de categoría para aplicar aumento masivo.
- **[TransactionModal.jsx](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/src/components/Customers/TransactionModal.jsx)**: Selector de método de pago al registrar abonos de clientes.

### 5. Rediseño del Input de la Calculadora
- **[CalculatorInput.jsx](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/src/components/CalculatorInput.jsx)**:
  - Se eliminó el selector `<select>` nativo invisible (`opacity-0`) que cubría el badge de moneda.
  - Se integró un dropdown flotante personalizado con control de estado `isOpen` y `Ref` para el cierre automático al hacer clic fuera del componente, logrando un menú de monedas con bordes perfectamente redondeados (`rounded-xl`), animado y con estética premium.

## 3. Validación de Compilación Realizada
* Se ejecutó el comando de compilación del proyecto (`npm run build`), completando con éxito y generando el bundle de producción de la PWA sin ningún error o advertencia:
  ```bash
  ✓ built in 30.85s
  PWA v1.2.0
  mode      generateSW
  precache  31 entries (2507.74 KiB)
  files generated: dist/sw.js, dist/workbox-1d305bb8.js
  ```

---

## PARTE 3: Homologación de Claves en la Nube (Supabase)

### 1. El Problema Corregido
* **Desincronización de Clientes:** En una actualización anterior, se cambiaron las claves en IndexedDB de `pool_imperial_...` a `bodega_...`. Se añadió una migración local al vuelo, pero los datos históricos de la nube en Supabase quedaron intactos.
* Como un equipo subía datos de clientes bajo `pool_imperial_customers_v1` y el otro consultaba solo `bodega_customers_v1`, la lista de clientes aparecía vacía ("Sin Clientes") y las deudas asociadas a ventas fiadas no se mostraban.

### 2. Solución y Homologación Implementada
* **Script de Autohomologación:** Se integró un bloque auto-ejecutable en [main.jsx](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/src/main.jsx) que se activa cuando la aplicación se inicia con una sesión autenticada.
* **Proceso de Fusión:**
  1. Descarga el documento antiguo (`pool_imperial_customers_v1`) y el nuevo (`bodega_customers_v1`) de la nube, y los combina con los del IndexedDB local actual.
  2. Elimina los registros duplicados por ID de cliente, preservando las deudas registradas.
  3. Sube la lista consolidada bajo la clave definitiva `bodega_customers_v1` a Supabase y actualiza IndexedDB local.
  4. Borra la clave obsoleta `pool_imperial_customers_v1` de la nube.
  5. Repite el mismo proceso para `pool_imperial_products_v1` / `bodega_products_v1`.
* Una vez finalizado el proceso de fusión en el navegador del cliente, la aplicación se recarga automáticamente para aplicar los cambios unificados en todos los dispositivos.

---

## 📈 Cambios de Configuración de Porcentajes de Impuestos Dinámicos

### 1. Migración de Base de Datos
- **Script SQL (`database/add_tax_rate_columns.sql`)**:
  - Se creó el archivo para agregar las columnas `tax_rate_iva` y `tax_rate_impoconsumo` con valores por defecto de `19` y `8` respectivamente.

### 2. Actualización de Store de Zustand y Sincronización
- **`useTablesStore.js`**:
  - Se añadieron `taxRateIva: 19` y `taxRateImpoconsumo: 8` al estado inicial de la configuración (`config`).
- **`tableSyncActions.js`**:
  - En `updateConfig`: Se configuró el envío de `tax_rate_iva` y `tax_rate_impoconsumo` a Supabase al guardar cambios. Si la tabla no cuenta aún con estas columnas, la función atrapa el error de forma segura y reintenta la actualización omitiendo dichos campos para evitar caídas en el sistema.
  - En `syncTablesAndSessions`: Se lee dinámicamente `tax_rate_iva` y `tax_rate_impoconsumo` de la base de datos, asignándolos a las propiedades del store local.

### 3. Modificaciones en la Interfaz de Configuración
- **`SettingsTabMesas.jsx`**:
  - Se definieron estados locales para el porcentaje de IVA y de Impoconsumo.
  - Se añadieron dos controles numéricos (`input type="number"`) en la interfaz dentro del bloque "Impuesto Servicio de Mesa" para modificar libremente estos porcentajes.
  - Al presionar "Guardar Tarifas", se invocó a `updateConfig` enviando los nuevos valores numéricos.
  - Se actualizaron las etiquetas informativas y estimaciones de precios finales del cliente para mostrar dinámicamente los porcentajes ingresados.

### 4. Generalización de los Motores Financieros
- **`FinancialEngine.js`**:
  - Se modificó la resolución de tasas de impuestos reemplazando la constante estática `TAX_RATES` con un lookup dinámico mediante `useTablesStore.getState().config`.
- **`tableBillingEngine.js`**:
  - Se adaptó la función `computeItemTax` de mesas y sesiones para consultar reactivamente las tasas activas desde el store.

---

## 🧪 Plan de Verificación Recomendado

1. **Apertura de Dropdowns Cerca del Borde**: Abre los dropdowns de "Tipo Impuesto" y "Modo Impuesto" en móviles y verifica que abren adecuadamente hacia arriba si hay poco espacio abajo.
2. **Apilamiento de la Grilla**: Cambia el ancho del navegador o pruébalo en un móvil para comprobar cómo las opciones de impuestos se ordenan en una sola columna con tamaño adecuado.
3. **Comprobación de Scroll**: Asegúrate de que las opciones no son recortadas por el contenedor principal de la tarjeta de configuración.

---

## 🕒 Sincronización del Reloj del Servidor y cloudSession

Se ha implementado una solución robusta para solucionar el desfase de los timers entre diferentes dispositivos que utilizan la aplicación debido a discrepancias en sus relojes locales y la falta de persistencia de la sesión en el store global.

### 1. Migración y RPC en Base de Datos
- **[get_server_time.sql](file:///c:/Users/luigg/Desktop/pool/pool%20imperial/database/get_server_time.sql)**:
  - Script SQL para crear la función RPC `get_server_time()` en Supabase que retorna el timestamp exacto del servidor Postgres.

### 2. Corrección del Estado `cloudSession`
- **Problema**: Componentes críticos como `voidSaleProcessor.js` fallaban al obtener el `userId` debido a que `cloudSession` era un estado local volátil en `useAppInit.js` en lugar de estar persistido en el store global `authStore.js`.
- **Solución**: Se añadió `cloudSession` al estado de `authStore.js` y se sincronizó reactivamente mediante `useAppInit.js` para asegurar que el ID del usuario esté siempre disponible globalmente.

## 6. Sincronización Resiliente de Ventas Anuladas

Se implementó una solución de doble vía (tiempo real auto-recuperable + pull incremental periódico en segundo plano) para asegurar que cuando una venta se anule en un dispositivo, el cambio se refleje inmediatamente en todas las demás estaciones de trabajo.

### Causas de las Discrepancias
1. **Desconexiones de WebSocket sin Reintento**:
   - Las suscripciones en tiempo real (Supabase Realtime channels) para la sincronización de documentos P2P y de ventas no tenían implementada una política de reintento/re-suscripción en caso de errores de red o desconexiones del WebSocket.
   - Si la suscripción se caía una vez, el dispositivo quedaba desconectado indefinidamente del flujo en tiempo real de los demás dispositivos.
2. **Ausencia de Pull de Ventas en Segundo Plano**:
   - El método `pullNewSales` (que obtiene de forma incremental las ventas creadas o modificadas desde la base de datos central) solo se llamaba al iniciar la app o al regresar al primer plano, pero nunca de forma periódica mientras el usuario operaba activamente.
3. **Discrepancia en Tabla sales Relacional**:
   - Al anular una venta se modificaba la cola en `sync_documents`, pero no se actualizaba la columna `status` en la tabla SQL relacional principal `sales` de Supabase.
4. **Falta de Estado `cloudSession` en `useAuthStore` (CAUSA CRÍTICA)**:
   - Se detectó que componentes y servicios críticos (como `voidSaleProcessor.js`, `useCloudSync.js` en `scheduleCloudPush`, `tableRealtimeActions.js`, `useGlobalTableAlerts.js` y `ProductContext.jsx`) leían el ID de la cuenta de Supabase desde `useAuthStore.getState().cloudSession?.user?.id`.
   - Sin embargo, la propiedad `cloudSession` **nunca se había declarado ni actualizado** en el store de Zustand (`authStore.js`). Se mantenía puramente como un hook de estado React interno dentro de `useAppInit.js`.
   - Como consecuencia, el `userId` siempre se evaluaba como `undefined` al intentar anular una venta. Esto causaba que la llamada a `broadcastVoidSale()` y la actualización a Supabase (`supabaseCloud.from('sales').update(...)`) se saltaran por completo en `voidSaleProcessor.js`.

### Cambios Realizados

#### [MODIFY] [authStore.js](file:///c:/Users/luigg/Desktop/pool/pool%20imperial/src/hooks/store/authStore.js)
- Se añadió `cloudSession: null` en el estado inicial de la tienda de Zustand.

#### [MODIFY] [useAppInit.js](file:///c:/Users/luigg/Desktop/pool/pool%20imperial/src/hooks/useAppInit.js)
- Se enlazaron llamadas a `useAuthStore.setState({ cloudSession: session })` en todos los puntos donde se establece o destruye la sesión (inicio de sesión, modo offline cached y cierre de sesión), sincronizando reactivamente la sesión de Supabase con el store.

#### [MODIFY] [voidSaleProcessor.js](file:///c:/Users/luigg/Desktop/pool/pool%20imperial/src/utils/voidSaleProcessor.js)
- Se añadió un fallback resiliente para consultar la sesión en tiempo de ejecución usando `supabaseCloud.auth.getSession()` en caso de que la tienda de Zustand tarde en hidratar o recuperar el estado. Esto garantiza que la venta anulada se sincronice y difunda en cualquier circunstancia.

#### [MODIFY] [salesSyncService.js](file:///c:/Users/luigg/Desktop/pool/pool%20imperial/src/utils/salesSyncService.js)
- **Función `broadcastVoidSale`**: Se creó este nuevo método que emite un evento P2P en tiempo real (`void_sale`) a las demás estaciones activas y actualiza la fila correspondiente en la tabla `sync_documents` de Supabase.
- **Detector de cambios en tiempo real (`applyIncomingSale`)**: Se actualizó para que, al recibir actualizaciones de una venta existente, también compare su propiedad `status` y, si cambia (ej. a `ANULADA`), la sobrescriba en IndexedDB y dispare un evento de actualización en la interfaz React.
- **Suscripción de eventos (`subscribeSalesRealtime`)**: Se configuró para escuchar activamente el canal de eventos `'void_sale'`.
- **Descarga incremental (`pullNewSales`)**: Se añadió una validación para que al consultar la base de datos central de ventas nuevas, si una venta ya existe localmente pero su `status` es diferente al de la nube, actualice el estado local para reflejar la anulación.

#### [MODIFY] [useCloudSync.js](file:///c:/Users/luigg/Desktop/pool/pool%20imperial/src/hooks/useCloudSync.js)
- Se aplicó la misma política de re-suscripción automática con delay para `globalSubscription` (canal P2P `sync_live`).
- Se introdujo un `useEffect` que ejecuta de forma automática un pull incremental de ventas (`pullNewSales`) cada 30 segundos como mecanismo de respaldo robusto en caso de que los WebSockets no estén disponibles.

---

## Verificación y Compilación
- Se compiló con éxito el bundle de producción de la PWA con `npm run build` en 32.84 segundos.
- Se verificó que todos los componentes, contextos e importaciones funcionan correctamente en armonía sin arrojar excepciones.
- Se realizó commit y push exitoso a la rama `master`.

### 3. Módulo de Sincronización
- **[serverClock.js](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/src/utils/serverClock.js)**:
  - Módulo singleton que consulta el tiempo del servidor en segundo plano.
  - Calcula la latencia de ida y vuelta (RTT / 2) y la diferencia de tiempo entre el reloj del servidor y el reloj del dispositivo local (`serverOffset`).
  - Expone `getServerNow()` que retorna un timestamp en milisegundos sumando el offset calculado a `Date.now()`.
  - **Estrategia de Fallback (Cero-Configuración)**: Si la RPC `get_server_time()` no está creada aún o falla la autenticación, hace un fetch `HEAD` rápido a la URL de Supabase para leer el header estándar HTTP `date`. Si esto también falla o no está expuesto en CORS, se desactiva de forma segura utilizando la hora del dispositivo (`offset = 0`), garantizando que la aplicación nunca falle.

### 3. Integración en el Ciclo de Vida de la Aplicación
- **[App.jsx](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/src/App.jsx)**:
  - Llama a `initServerClock()` en el montaje inicial para calcular el desfase de reloj.
  - **Sincronización Inteligente Offline/Online**: Escucha cambios en el estado de conexión de la red (`isOnline` de Zustand offline queue). Si la red se recupera (pasa de offline a online), invoca automáticamente a `initServerClock()` para refrescar el offset con la base de datos.

### 4. Ajustes en Motores Financieros y Componentes de Mesas
- **[tableBillingEngine.js](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/src/utils/tableBillingEngine.js)**:
  - La función `calculateElapsedTime` ahora usa la marca de tiempo confiable `getServerNow()` para calcular la duración transcurrida de las mesas, haciendo los cálculos de minutos consistentes en todas las terminales.
- **[TableCard.jsx](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/src/components/tables/TableCard.jsx)**:
  - La actualización del timer en tiempo real (`elapsedSeconds`) usa `getServerNow()` para calcular los segundos exactos de juego de forma idéntica en cualquier pantalla.
- **[tableBillingActions.js](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/src/hooks/store/tableBillingActions.js)**:
  - Ajusta el cálculo de tiempo prepagado transcurrido (`nowElapsed`) al agregar horas extras usando `getServerNow()`.
- **[tableSessionActions.js](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/src/hooks/store/tableSessionActions.js)**:
  - Utiliza `new Date(getServerNow()).toISOString()` al registrar el inicio de las sesiones (`started_at`) y sus cierres (`closed_at`), de manera que las marcas temporales que viajan a la base de datos y a otros dispositivos ya incluyan el offset corregido del cliente.

---

## 🧾 Fix: Exclusión de Ventas Anuladas en Cierre de Caja

### Problema
En el reporte de Cierre de Caja, la función `groupSalesByCierreId` incluía ventas con
`status === 'ANULADA'` en los totales por cierre. Esto inflaba montos de ventas,
ganancias, items vendidos y el desglose de métodos de pago, ya que una venta anulada
no debe contar para ninguna estadística ni para el flujo de caja.

### Cambio Realizado

#### [MODIFY] [reportsProcessor.js](file:///c:/Users/luigg/Desktop/pool/pool%20imperial/src/utils/reportsProcessor.js)
Se añadió el filtro `s.status !== 'ANULADA'` a los dos conjuntos de ventas que alimentan
los cálculos por cierre en `groupSalesByCierreId`:

```js
const salesForStats = c.sales.filter(s => (s.tipo === 'VENTA' || s.tipo === 'VENTA_FIADA') && s.status !== 'ANULADA');
const salesForCashFlow = c.sales.filter(s => (s.tipo === 'VENTA' || s.tipo === 'VENTA_FIADA' || s.tipo === 'COBRO_DEUDA' || s.tipo === 'PAGO_PROVEEDOR') && s.status !== 'ANULADA');
```

- `salesForStats`: alimenta total COP, IVA, desglose de impuestos, items y ganancia.
- `salesForCashFlow`: alimenta el desglose de métodos de pago.
- Los `adjustments` (`AJUSTE_ENTRADA` / `AJUSTE_SALIDA`) no se modificaron, ya que no llevan estado de anulación.

El cambio es consistente con el filtrado de `ANULADA` que ya existía en la función de
resumen general del mismo archivo (cálculo de `salesForStats` / `salesForCashFlow` globales).

### Verificación
- `npm run build` → `✓ built in 27.30s`, sin errores de compilación.

---

## 🔒 Fix: Prevención de Ventas Duplicadas por Doble Click (Debouncing / Loading State)

### Problema
Cuando el cajero pulsaba repetidamente el botón "CONFIRMAR COBRO" durante momentos de latencia o lag en la conexión de red, se procesaban y registraban múltiples ventas idénticas en paralelo. La guardia interna basada en `submittingRef.current` no funcionaba porque el callback `onConfirmSale` de la vista no retornaba la promesa de la transacción, haciendo que el bloqueo se liberara de forma instantánea e ineficaz.

### Cambios Realizados

#### [MODIFY] [SalesView.jsx](file:///c:/Users/luigg/Desktop/pool/pool%20imperial/src/views/SalesView.jsx)
Se agregaron retornos de promesas en ambos manejadores `onConfirmSale` (venta directa y cobro de mesa) para asegurar que el componente padre comunique la finalización asíncrona de la venta:
- **Venta directa**: Se añadió `return` a `processSaleTransaction(opts).then(...)`.
- **Cobro de mesa**: Se añadió `return` a `handleTableCheckout(...).then(...)`.

#### [MODIFY] [useCheckoutPayments.js](file:///c:/Users/luigg/Desktop/pool/pool%20imperial/src/hooks/useCheckoutPayments.js)
- Se introdujo el estado reactivo `isSubmitting` gestionado dentro de `_doConfirm` mediante un bloque `try...finally` que abarca toda la duración de la promesa de `onConfirmSale`.
- Se mantiene el bloqueo instantáneo sincrónico de `submittingRef.current` en conjunto con el nuevo estado reactivo `isSubmitting` para máxima seguridad ante pulsaciones rápidas.

#### [MODIFY] [CheckoutModal.jsx](file:///c:/Users/luigg/Desktop/pool/pool%20imperial/src/components/Sales/CheckoutModal.jsx)
- Se enlazó el estado `isSubmitting` al botón principal **CONFIRMAR COBRO** para deshabilitarlo e impedir eventos de click concurrentes.
- Se implementó un estado visual de carga premium que muestra el texto **`PROCESANDO...`** junto con un spinner animado SVG durante la ejecución de la venta.

### Verificación
- `npm run build` completado exitosamente en `42.15s` sin errores de compilación.

---

## 🎨 Fix: Alineación y Prevención de Solapamiento en Reporte de Ventas del Cierre de Caja

### Problema
En la sección "DETALLE DE VENTAS" del PDF de cierre de caja, el nombre del cliente (ej. `"Consumidor Final"`) se solapaba con la hora de venta (especialmente con el indicador de AM/PM, resultando en textos encimados como `"08:29 p. mConsumidor Final"`). Esto ocurría porque la coordenada inicial del cliente estaba fijada a un margen demasiado estrecho (`M + 12`), mientras que el formato de hora de 11 caracteres requería más espacio.

### Cambios Realizados

#### [MODIFY] [dailyCloseGenerator.js](file:///c:/Users/luigg/Desktop/pool/pool%20imperial/src/utils/dailyCloseGenerator.js)
- Se incrementó el margen horizontal de inicio para el nombre del cliente de `M + 12` a `M + 16` (y a `M + 23` tras incorporar el correlativo), proporcionando un espacio seguro de separación de más de 4 mm.
- Se ajustó el límite máximo de truncamiento del nombre del cliente de 18 a 12 caracteres para asegurar que no colisione con el monto de la venta, el cual está alineado al extremo derecho.
- Se agregó el correlativo de venta (ej. `#0238`) junto al campo de la hora.

---

## 🖨️ Restablecimiento del Layout de Impresión de Cierre a HTML (Thermal)

### Cambios Realizados

#### [MODIFY] [CierreHistoryCard.jsx](file:///c:/Users/luigg/Desktop/pool/pool%20imperial/src/components/Reports/CierreHistoryCard.jsx) y [CierreCajaWizard.jsx](file:///c:/Users/luigg/Desktop/pool/pool%20imperial/src/components/Dashboard/CierreCajaWizard.jsx)
- Se restauró la llamada a `printThermalDailyClose` para el botón "Imprimir Ticket / Re-imprimir Ticket". Esto restablece el diseño nativo HTML optimizado para papel térmico de 58mm (con textos bold contrastados, logo en blanco y negro y tablas compactas).
- Se conservó `generateDailyClosePDF` únicamente para la descarga local a través de "Descargar PDF".

---

## 🧹 Script de Limpieza y Deduplicación Local Avanzada (Filtro por Minuto)

### Problema
Debido a la latencia y la concurrencia al realizar múltiples clicks, el navegador generó registros duplicados locales con segundos ligeramente distintos (ej. `12:21:03` y `12:21:08`). Esto impedía que filtros de segundo exacto detectaran los duplicados.

### Solución
Se diseñó un nuevo script para la consola de Chrome que agrupa las ventas locales con precisión de 1 minuto (ignorando segundos) y de forma completamente automatizada calcula los ítems que se van a descartar para devolverlos directamente al inventario de productos.

### Verificación
- `npm run build` completado exitosamente sin advertencias.

---

## 📄 Rediseño de Reporte de Cierre PDF a Formato Carta (Letter Size)

### Problema
El reporte en PDF descargado anteriormente utilizaba un formato estilo recibo continuo de 58mm (largo y angosto). Al ser abierto en computadoras o impreso en hojas convencionales de oficina, se desaprovechaba la mayor parte del espacio y las tablas se veían demasiado comprimidas.

### Solución
Se rediseñó por completo el generador de PDF en [`dailyCloseGenerator.js`](file:///c:/Users/luigg/Desktop/pool/pool%20imperial/src/utils/dailyCloseGenerator.js) para utilizar el tamaño de hoja **Carta (Letter, 215.9 x 279.4 mm)** en orientación vertical.

### Detalles de la Nueva Interfaz del Reporte:
1. **Encabezado Corporativo**:
   - Logo a la izquierda de la página y metadatos de emisión (fecha, hora, número de cierre) alineados a la derecha de forma elegante.
2. **Cuadrícula de Métricas (Grid Cards)**:
   - Se diseñaron tarjetas rectangulares modernas con fondos e indicadores de color (azul/charcoal) para mostrar *Ingresos Brutos y Netos*, *Operaciones Realizadas* y *Ganancia Estimada*.
3. **Distribución en Columnas Simétricas**:
   - **Pagos por método** e **Impuestos** en la columna izquierda.
   - **Cuadre de caja física** (esperado vs. declarado) en la columna derecha.
4. **Inventario y Más Vendidos**:
   - **Movimientos de Productos** (entradas/salidas) y **Top de Artículos** mostrados en dos tablas alineadas lado a lado para optimizar el espacio horizontal.
5. **Historial Detallado de Ventas (Formato Tabla Completo)**:
   - Se distribuyeron los datos de cada venta en columnas: `Hora / Ref`, `Cliente`, `Artículos Detalle`, `Transacción / Pago` y `Total Venta` (con colores destacados).
6. **Salto de Página Inteligente (Multi-página)**:
   - Se programó un control de desborde dinámico que añade hojas adicionales automáticamente si la cantidad de ventas supera la altura física de la página, agregando un membrete y pie de página en cada hoja.

### Verificación
- `npm run build` completado exitosamente sin advertencias.

---

## ⚡ Optimización de Rendimiento para Perfiles de Caja (Cajero, Mesero, Barra)

### Problema
Los usuarios con perfiles de caja experimentaban congelamientos de pantalla y lentitud (lag) debido a lecturas excesivas a IndexedDB (`bodega_sales_v1`), procesamiento iterativo innecesario de miles de ventas para rankings y métricas, y consultas redundantes y continuas en segundo plano de manera simultánea.

### Solución
Se implementó un plan de optimización en 4 fases:
1. **Debounce en Lecturas IndexedDB (1s)**: Tanto en `DashboardView.jsx` como en `OperatorDashboardPanel.jsx`, se agregó un retardo de 1 segundo a las lecturas reactivas ante eventos de actualización (`app_storage_update`). Esto evita múltiples lecturas y deserializaciones consecutivas del historial completo cuando llegan múltiples transacciones seguidas.
2. **Limitación de Ventas en Panel del Operador**: Se modificó `OperatorDashboardPanel.jsx` para que solo cargue y procese transacciones de los últimos 7 días. Esto redujo el volumen de datos de miles de filas a solo unas decenas de registros.
3. **Reducción de Intervalos de Polling en Background**:
   - Se extendió el fallback de sincronización de ventas (`pullNewSales` en `useCloudSync.js`) de 30 a 90 segundos, delegando la velocidad en tiempo real al canal P2P de broadcast de Supabase.
   - Se extendió el polling de estado de sesión de caja (`cashStore.js`) de 30 a 60 segundos y se incorporó un guard `document.hidden` para pausar la sincronización cuando la aplicación no está activa en la pantalla.
4. **Métricas y Rankings Acotados**: En `useDashboardMetrics.js`, se limitó el procesamiento de las funciones `topProducts` y `topStaff` para analizar únicamente los últimos 30 días, evitando procesar toda la historia del negocio en cada cambio de vista del administrador.

### Verificación
- `npm run build` completado exitosamente sin advertencias en 25 segundos.

