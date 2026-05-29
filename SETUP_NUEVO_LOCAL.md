# 🚀 Pool Imperial — Guía de Setup para Nuevo Local

> **Versión:** 1.0  
> **Tiempo estimado:** 30-60 minutos  
> **Requisitos:** Acceso a Supabase, Node.js 18+ o Bun, y un servidor de hosting (Vercel/Cloudflare)

Esta guía te lleva paso a paso para replicar Pool Imperial en un nuevo salón de billar. El sistema está diseñado para que un solo archivo (`venueConfig.js`) controle toda la identidad del negocio, sin tocar la lógica de la app.

---

## 📋 Checklist Rápido

- [ ] 1. Crear proyecto en Supabase
- [ ] 2. Ejecutar el esquema SQL
- [ ] 3. Clonar el repositorio
- [ ] 4. Configurar `.env`
- [ ] 5. Personalizar `venueConfig.js`
- [ ] 6. Reemplazar logos y favicon
- [ ] 7. Actualizar `index.html` y `vite.config.js`
- [ ] 8. Ajustar `floorPlanData.js` (plano del local)
- [ ] 9. Crear el primer usuario ADMIN
- [ ] 10. Deploy a producción
- [ ] 11. Verificar en dispositivo real

---

## Paso 1: Crear Proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com/) → "New Project"
2. Selecciona una región cercana a tu local (ej: `South America (São Paulo)`)
3. Guarda la **contraseña de la base de datos** en un lugar seguro
4. Una vez creado, ve a **Settings → API** y copia:
   - `Project URL` (ej: `https://xxxxxxxxxxxx.supabase.co`)
   - `anon public key` (empieza con `eyJ...`)

---

## Paso 2: Ejecutar el Esquema SQL

1. En Supabase, ve a **SQL Editor**
2. Copia y pega todo el contenido de [`pool_imperial_full_schema.sql`](./pool_imperial_full_schema.sql)
3. Ejecuta el script
4. Verifica que se crearon las tablas: `tables`, `table_sessions`, `orders`, `sales`, `staff_users`, etc.

> ⚠️ **Importante:** Este script incluye RLS policies, índices y funciones RPC. Ejecútalo completo sin modificar.

---

## Paso 3: Clonar el Repositorio

```bash
git clone <url-del-repo>
cd pool-imperial
npm install   # o: bun install
```

---

## Paso 4: Configurar Variables de Entorno

```bash
cp .env.example .env
```

Edita `.env` con los valores de tu proyecto Supabase:

```env
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...tu_anon_key_aqui
VITE_LICENSE_SALT=MI_LOCAL_COLOMBIA_2026
```

| Variable | Descripción |
|----------|-------------|
| `VITE_SUPABASE_URL` | URL de tu proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave pública (anon key) de tu proyecto |
| `VITE_LICENSE_SALT` | Salt único para generar IDs de licencia por dispositivo |

---

## Paso 5: Personalizar `venueConfig.js`

Abre `src/config/venueConfig.js` y cambia los valores para tu local:

```js
// ── IDENTIDAD DEL NEGOCIO ──
export const VENUE_NAME        = 'Billar El Dorado';      // ← Nombre de tu local
export const VENUE_SHORT_NAME  = 'El Dorado';             // ← Nombre corto
export const VENUE_TAGLINE     = 'El mejor billar de la ciudad';

// ── MONEDA ──
export const CURRENCY_CODE     = 'COP';                   // ISO 4217
export const CURRENCY_LOCALE   = 'es-CO';                 // Para formato de números
export const CURRENCY_SYMBOL   = '$';

// ── CONTACTO ──
export const SUPPORT_WHATSAPP  = '573001234567';           // ← Tu WhatsApp

// ── TARIFAS DEFAULT ──
export const DEFAULT_PRICE_PER_HOUR    = 8000;             // ← COP por hora
export const DEFAULT_PRICE_PINA        = 3000;             // ← COP por piña
```

### Campos que DEBES cambiar

| Campo | Qué poner |
|-------|-----------|
| `VENUE_NAME` | Nombre oficial de tu negocio |
| `VENUE_SHORT_NAME` | Nombre corto (máx. 12 caracteres, para PWA) |
| `SUPPORT_WHATSAPP` | Número WhatsApp del dueño/soporte (sin +) |
| `DEFAULT_PRICE_PER_HOUR` | Tarifa hora en COP (el admin puede cambiarla después) |
| `DEFAULT_PRICE_PINA` | Tarifa piña en COP |
| `LICENSE_SALT` | Un string único para este local |

### Campos que probablemente NO necesitas cambiar

| Campo | Por qué |
|-------|---------|
| `CURRENCY_CODE` | Solo cambia si sales de Colombia |
| `TICKET_WIDTH_MM` | Solo cambia si usas rollos de 80mm |
| `STORAGE_DB_NAME` | Solo cambia si corres dos locales en el mismo navegador |

---

## Paso 6: Reemplazar Logos

Reemplaza estos archivos en la carpeta `public/`:

| Archivo | Tamaño | Uso |
|---------|--------|-----|
| `logo.png` | 512×512 px | Logo principal en el dashboard |
| `logodark.png` | 512×512 px | Logo para modo oscuro |
| `logo-ticket.png` | ~200×200 px | Logo impreso en tickets térmicos |
| `favicon.png` | 32×32 px | Ícono del navegador |
| `apple-touch-icon.png` | 180×180 px | Ícono en iOS |
| `pwa-192x192.png` | 192×192 px | Ícono PWA (Android) |
| `pwa-512x512.png` | 512×512 px | Splash screen PWA |

> 💡 **Tip:** Usa [favicon.io](https://favicon.io/) para generar todos los tamaños desde una sola imagen.

---

## Paso 7: Actualizar `index.html` y `vite.config.js`

### index.html

Busca y reemplaza todas las menciones de "Pool Imperial" por el nombre de tu local:

```html
<meta name="application-name" content="Billar El Dorado" />
<meta name="description" content="Billar El Dorado — Gestión de mesas y punto de venta" />
<meta property="og:title" content="Billar El Dorado" />
<meta name="apple-mobile-web-app-title" content="El Dorado" />
<title>Billar El Dorado</title>
```

### vite.config.js

Actualiza el manifiesto PWA:

```js
manifest: {
  name: 'Billar El Dorado',
  short_name: 'El Dorado',
  description: 'Gestión de mesas y punto de venta',
  // ...
}
```

---

## Paso 8: Ajustar el Plano del Local

El archivo `src/data/floorPlanData.js` contiene la disposición física de las mesas en el plano interactivo. Para un local nuevo:

### Opción A: Reusar el plano actual (recomendado para empezar)
Si tu local tiene un número similar de mesas, puedes usar el plano actual y solo renombrar las mesas desde Settings → Mesas en la app.

### Opción B: Personalizar el plano
Edita `floorPlanData.js` para ajustar posiciones. Cada elemento tiene:

```js
{
  id: 'pool-1',           // ID único
  type: 'pool_table',     // Tipo: pool_table | dining_table | round_stool | bar_stool | bar_counter | entry | logo
  refName: 'Pool 1',      // Nombre que coincide con la mesa en Supabase
  label: 'Pool 1',        // Etiqueta visual
  x: 15, y: 5,            // Posición (% del contenedor 16:9)
  w: 14, h: 45,           // Tamaño (% del contenedor)
  interactive: true,       // ¿Es clickeable?
  zone: 'mesas_pool',     // Zona lógica
}
```

> ⚠️ Las coordenadas son porcentuales (0-100) dentro de un contenedor 16:9.

---

## Paso 9: Crear el Primer Usuario ADMIN

1. Inicia el servidor de desarrollo: `npm run dev`
2. Abre la app en el navegador
3. Regístrate con email y contraseña (Cloud Auth)
4. Una vez dentro, ve a **Settings → Usuarios**
5. Crea un usuario con rol **ADMIN** y un PIN de 4 dígitos
6. Cierra sesión local y entra con el PIN del admin

> 💡 **Alternativa programática:** Usa el SQL Editor de Supabase para insertar directamente:
> ```sql
> INSERT INTO staff_users (name, pin_hash, role, user_id)
> VALUES ('Admin', '<sha256-hash-del-pin>', 'ADMIN', '<tu-user-id>');
> ```

---

## Paso 10: Deploy a Producción

### Vercel (Recomendado)

```bash
npm run build
npx vercel --prod
```

Configura las variables de entorno en Vercel Dashboard → Settings → Environment Variables.

### Cloudflare Workers (Alternativo)

```bash
npm run build
npx wrangler deploy
```

Actualiza `wrangler.jsonc` con el nombre de tu worker:

```jsonc
{
  "name": "billar-el-dorado",  // ← Nombre de tu worker
  "main": "worker.js",
  "assets": { "directory": "./dist/" }
}
```

---

## Paso 11: Verificación en Dispositivo Real

Una vez desplegado, verifica en un celular o tablet:

- [ ] La app carga y muestra el login
- [ ] El nombre del local aparece correctamente
- [ ] El logo se ve en el dashboard y en los tickets
- [ ] Puedes crear un usuario ADMIN con PIN
- [ ] Puedes abrir una mesa, agregar tiempo y consumo
- [ ] La impresión térmica funciona (si tienes impresora conectada)
- [ ] La app es instalable como PWA (botón "Agregar a pantalla de inicio")
- [ ] Funciona offline (desconecta WiFi, haz una venta, reconecta)

---

## 🔧 Configuración Avanzada

### Activar/Desactivar Autenticación por Email

Por defecto, Supabase requiere confirmación de email. Para desactivarlo:
1. Ve a Supabase → Authentication → Settings
2. Desactiva "Enable email confirmations"

### Configurar Dominio Personalizado

Si usas Vercel:
1. Ve a Vercel Dashboard → tu proyecto → Settings → Domains
2. Agrega tu dominio (ej: `app.billardorado.com`)
3. Configura los DNS en tu proveedor de dominio

### Licencias por Dispositivo

El sistema incluye un mecanismo de licencias en `cloud_licenses`. Para dar acceso permanente:

```sql
INSERT INTO cloud_licenses (email, license_type, max_devices, active)
VALUES ('admin@billardorado.com', 'permanent', 5, true);
```

---

## 🆘 Troubleshooting

| Problema | Solución |
|----------|----------|
| "No autorizado" al hacer checkout | Verifica que el `user_id` del staff coincida con el `auth.uid()` de Supabase |
| Las mesas no aparecen | Ejecuta `pool_imperial_full_schema.sql` y verifica que la tabla `tables` tenga registros |
| La app no se instala como PWA | Necesitas HTTPS. Deploy a Vercel/Cloudflare o usa `localhost` |
| Tickets no imprimen | Verifica que el navegador soporte Web Serial API (Chrome 89+) |
| Sincronización no funciona | Verifica Supabase Realtime: Authentication → Policies → Todas las tablas con RLS |
| Error "State loaded from storage" | Es una advertencia normal de Zustand persist, no afecta funcionalidad |

---

## 📁 Archivos que Cambian por Local

| Archivo | Qué cambiar |
|---------|-------------|
| `.env` | Credenciales de Supabase |
| `src/config/venueConfig.js` | Nombre, moneda, tarifas, contacto |
| `src/data/floorPlanData.js` | Layout físico del local |
| `public/logo.png` | Logo del negocio |
| `public/favicon.png` | Favicon |
| `public/pwa-*.png` | Íconos PWA |
| `index.html` | Meta tags y título |
| `vite.config.js` | Manifiesto PWA |
| `wrangler.jsonc` | Nombre del worker (si usas Cloudflare) |

**Todo lo demás (lógica de negocio, UI, stores, utils) NO se modifica.**
