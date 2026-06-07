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
- **Script SQL (`add_tax_rate_columns.sql`)**:
  - Se creó el archivo en la raíz del proyecto para agregar las columnas `tax_rate_iva` y `tax_rate_impoconsumo` con valores por defecto de `19` y `8` respectivamente.

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

## 🕒 Sincronización del Reloj del Servidor (Timers Independientes de Dispositivos)

Se ha implementado una solución robusta para solucionar el desfase de los timers entre diferentes dispositivos que utilizan la aplicación debido a discrepancias en sus relojes locales.

### 1. Migración y RPC en Base de Datos
- **[get_server_time.sql](file:///c:/Users/luigg/Desktop/URO/LOS%20DIAZ/pool%20imperial/get_server_time.sql)**:
  - Script SQL para crear la función RPC `get_server_time()` en Supabase que retorna el timestamp exacto del servidor Postgres.

### 2. Módulo de Sincronización
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
