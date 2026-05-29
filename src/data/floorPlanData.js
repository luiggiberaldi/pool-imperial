/**
 * floorPlanData.js — Pool Imperial · Fase 1.1
 * ─────────────────────────────────────────────
 * Dataset del plano físico del local.
 * Coordenadas x, y, w, h expresadas en % del contenedor 16:9.
 *
 * TIPOS DE ELEMENTO
 * ─────────────────
 * 'pool_table'   → Mesa de billar (interactiva). Render: felt + rails + pockets.
 * 'dining_table' → Mesa comedor/social (interactiva). Render: superficie + sillas top-view.
 * 'round_stool'  → Taburete redondo alto (M4-M11). Render: círculo con aura.
 * 'bar_stool'    → Taburete de barra (B1-B15). Render: círculo compacto.
 * 'bar_counter'  → Mostrador/barra estructural (decorativo).
 * 'entry'        → Acceso al local (decorativo).
 * 'logo'         → Área de identidad visual central (decorativo).
 *
 * CAMPOS
 * ──────
 * refName  → Nombre exacto de la mesa en Supabase (debe coincidir con table.name)
 * chairs   → Número de sillas para dining_table (actualmente siempre 4)
 *
 * NOTAS DE CONSISTENCIA (Fase 1.1)
 * ─────────────────────────────────
 * - Se eliminó el tipo 'bar_table' (era genérico). Ahora se usa 'dining_table'.
 * - M4-M11 cambiaron de 'bar_stool' a 'round_stool' para renderer correcto.
 * - B1-B15 mantienen 'bar_stool' (stools de mostrador, más compactos).
 * - Coordenadas re-calibradas contra boceto CAMBIA_LA_B7_B9_B10_202605282143.jpeg.
 * - Barra 1 horizontal corregida (ya no solapa Pool 1).
 * - Pool 1 ampliado a portrait completo (h=45 para mayor protagonismo).
 * - Logo reposicionado al centro-izquierda, entre M2/M3 y Barra 1.
 */

/** @type {FloorItem[]} */
export const FLOOR_ITEMS = [

  // ══════════════════════════════════════════
  // ZONA: ENTRADA
  // ══════════════════════════════════════════
  {
    id: 'entry-1',
    type: 'entry',
    label: 'Entrada 1',
    x: 0,
    y: 71,
    w: 3.5,
    h: 16,
    interactive: false,
    zone: 'entrada',
  },

  // ══════════════════════════════════════════
  // ZONA: SALÓN — mesas comedor (izquierda)
  // ══════════════════════════════════════════

  // M1 — esquina inferior izquierda, junto a entrada
  {
    id: 'floor-m1',
    type: 'dining_table',
    refName: 'M1',
    label: 'M1',
    chairs: 4,
    x: 3,
    y: 57,
    w: 10,
    h: 13,
    interactive: true,
    zone: 'salon',
  },

  // M2 — centro-izquierda, fila superior
  {
    id: 'floor-m2',
    type: 'dining_table',
    refName: 'M2',
    label: 'M2',
    chairs: 4,
    x: 14,
    y: 18,
    w: 10.5,
    h: 13,
    interactive: true,
    zone: 'salon',
  },

  // M3 — centro-izquierda, fila superior (junto a M2)
  {
    id: 'floor-m3',
    type: 'dining_table',
    refName: 'M3',
    label: 'M3',
    chairs: 4,
    x: 26,
    y: 18,
    w: 10.5,
    h: 13,
    interactive: true,
    zone: 'salon',
  },

  // ══════════════════════════════════════════
  // DECORATIVO: Logo Area
  // Ubicado entre M2/M3 (arriba) y Barra 1 (abajo)
  // ══════════════════════════════════════════
  {
    id: 'logo-area',
    type: 'logo',
    label: 'Pool Imperial',
    x: 14,
    y: 34,
    w: 24,
    h: 7,
    interactive: false,
    zone: 'salon',
  },

  // ══════════════════════════════════════════
  // ZONA: BARRA 1 — forma en L
  // ──────────────────────────────────────────
  // El brazo horizontal va de x=28 a x=42 (y≈44-52)
  // El brazo vertical baja desde el extremo derecho (x=38-44, y≈52-79)
  // ══════════════════════════════════════════

  // Brazo horizontal (parte norte de la L)
  {
    id: 'barra1-h',
    type: 'bar_counter',
    label: 'Barra 1',
    x: 27,
    y: 44,
    w: 15,
    h: 8,
    interactive: false,
    zone: 'barra1',
  },

  // Brazo vertical (parte sur de la L, baja hacia abajo)
  {
    id: 'barra1-v',
    type: 'bar_counter',
    label: '',
    x: 38,
    y: 52,
    w: 5,
    h: 27,
    interactive: false,
    zone: 'barra1',
  },

  // B1, B2 — stools frente al brazo horizontal (lado norte)
  {
    id: 'floor-b1',
    type: 'bar_stool',
    refName: 'B1',
    label: 'B1',
    x: 28,
    y: 37.5,
    w: 5,
    h: 6,
    interactive: true,
    zone: 'barra1',
  },
  {
    id: 'floor-b2',
    type: 'bar_stool',
    refName: 'B2',
    label: 'B2',
    x: 34.5,
    y: 37.5,
    w: 5,
    h: 6,
    interactive: true,
    zone: 'barra1',
  },

  // B3-B6 — stools frente al brazo vertical (lado este)
  {
    id: 'floor-b3',
    type: 'bar_stool',
    refName: 'B3',
    label: 'B3',
    x: 43.5,
    y: 53,
    w: 4.5,
    h: 5.5,
    interactive: true,
    zone: 'barra1',
  },
  {
    id: 'floor-b4',
    type: 'bar_stool',
    refName: 'B4',
    label: 'B4',
    x: 43.5,
    y: 59.5,
    w: 4.5,
    h: 5.5,
    interactive: true,
    zone: 'barra1',
  },
  {
    id: 'floor-b5',
    type: 'bar_stool',
    refName: 'B5',
    label: 'B5',
    x: 43.5,
    y: 66,
    w: 4.5,
    h: 5.5,
    interactive: true,
    zone: 'barra1',
  },
  {
    id: 'floor-b6',
    type: 'bar_stool',
    refName: 'B6',
    label: 'B6',
    x: 43.5,
    y: 72.5,
    w: 4.5,
    h: 5.5,
    interactive: true,
    zone: 'barra1',
  },

  // ══════════════════════════════════════════
  // ZONA: MESAS DE POOL — centro del local
  // ──────────────────────────────────────────
  // Pool 1: portrait (más alto que ancho), izquierda del bloque
  // Pool 3: landscape (más ancho que alto), superior derecha
  // Pool 2: landscape, inferior derecha
  // ══════════════════════════════════════════

  // Mesa Pool 1 — portrait, columna izquierda del bloque de pool
  {
    id: 'floor-pool1',
    type: 'pool_table',
    refName: 'Mesa Pool 1',
    label: 'Pool 1',
    x: 49,
    y: 19,
    w: 12,
    h: 44,
    interactive: true,
    zone: 'pool',
  },

  // Mesa Pool 3 — landscape, fila superior derecha
  {
    id: 'floor-pool3',
    type: 'pool_table',
    refName: 'Mesa Pool 3',
    label: 'Pool 3',
    x: 63,
    y: 11,
    w: 19,
    h: 32,
    interactive: true,
    zone: 'pool',
  },

  // Mesa Pool 2 — landscape, fila inferior derecha
  {
    id: 'floor-pool2',
    type: 'pool_table',
    refName: 'Mesa Pool 2',
    label: 'Pool 2',
    x: 63,
    y: 48,
    w: 19,
    h: 32,
    interactive: true,
    zone: 'pool',
  },

  // ══════════════════════════════════════════
  // ZONA: TABURETES SUPERIORES (M4-M7)
  // Fila horizontal encima de las mesas de pool
  // ══════════════════════════════════════════
  {
    id: 'floor-m4',
    type: 'round_stool',
    refName: 'M4',
    label: 'M4',
    x: 49,
    y: 3,
    w: 5.5,
    h: 8,
    interactive: true,
    zone: 'barra-alta',
  },
  {
    id: 'floor-m5',
    type: 'round_stool',
    refName: 'M5',
    label: 'M5',
    x: 56,
    y: 3,
    w: 5.5,
    h: 8,
    interactive: true,
    zone: 'barra-alta',
  },
  {
    id: 'floor-m6',
    type: 'round_stool',
    refName: 'M6',
    label: 'M6',
    x: 63,
    y: 3,
    w: 5.5,
    h: 8,
    interactive: true,
    zone: 'barra-alta',
  },
  {
    id: 'floor-m7',
    type: 'round_stool',
    refName: 'M7',
    label: 'M7',
    x: 70,
    y: 3,
    w: 5.5,
    h: 8,
    interactive: true,
    zone: 'barra-alta',
  },

  // ══════════════════════════════════════════
  // ZONA: TABURETES INFERIORES (M8-M11)
  // Fila horizontal debajo de las mesas de pool
  // ══════════════════════════════════════════
  {
    id: 'floor-m8',
    type: 'round_stool',
    refName: 'M8',
    label: 'M8',
    x: 52,
    y: 83,
    w: 5.5,
    h: 8,
    interactive: true,
    zone: 'barra-baja',
  },
  {
    id: 'floor-m9',
    type: 'round_stool',
    refName: 'M9',
    label: 'M9',
    x: 59,
    y: 83,
    w: 5.5,
    h: 8,
    interactive: true,
    zone: 'barra-baja',
  },
  {
    id: 'floor-m10',
    type: 'round_stool',
    refName: 'M10',
    label: 'M10',
    x: 66,
    y: 83,
    w: 5.5,
    h: 8,
    interactive: true,
    zone: 'barra-baja',
  },
  {
    id: 'floor-m11',
    type: 'round_stool',
    refName: 'M11',
    label: 'M11',
    x: 73,
    y: 83,
    w: 5.5,
    h: 8,
    interactive: true,
    zone: 'barra-baja',
  },

  // ══════════════════════════════════════════
  // ZONA: BARRA 2 — extremo derecho, vertical
  // B7-B15 se ubican a su izquierda
  // ══════════════════════════════════════════

  // Stools B7-B15 (columna vertical, izquierda de Barra 2)
  { id: 'floor-b7',  type: 'bar_stool', refName: 'B7',  label: 'B7',  x: 84, y: 17,   w: 4.5, h: 5.5, interactive: true, zone: 'barra2' },
  { id: 'floor-b8',  type: 'bar_stool', refName: 'B8',  label: 'B8',  x: 84, y: 23.5, w: 4.5, h: 5.5, interactive: true, zone: 'barra2' },
  { id: 'floor-b9',  type: 'bar_stool', refName: 'B9',  label: 'B9',  x: 84, y: 30,   w: 4.5, h: 5.5, interactive: true, zone: 'barra2' },
  { id: 'floor-b10', type: 'bar_stool', refName: 'B10', label: 'B10', x: 84, y: 36.5, w: 4.5, h: 5.5, interactive: true, zone: 'barra2' },
  { id: 'floor-b11', type: 'bar_stool', refName: 'B11', label: 'B11', x: 84, y: 43,   w: 4.5, h: 5.5, interactive: true, zone: 'barra2' },
  { id: 'floor-b12', type: 'bar_stool', refName: 'B12', label: 'B12', x: 84, y: 49.5, w: 4.5, h: 5.5, interactive: true, zone: 'barra2' },
  { id: 'floor-b13', type: 'bar_stool', refName: 'B13', label: 'B13', x: 84, y: 56,   w: 4.5, h: 5.5, interactive: true, zone: 'barra2' },
  { id: 'floor-b14', type: 'bar_stool', refName: 'B14', label: 'B14', x: 84, y: 62.5, w: 4.5, h: 5.5, interactive: true, zone: 'barra2' },
  { id: 'floor-b15', type: 'bar_stool', refName: 'B15', label: 'B15', x: 84, y: 69,   w: 4.5, h: 5.5, interactive: true, zone: 'barra2' },

  // Mostrador Barra 2 (derecho, vertical)
  {
    id: 'barra2-counter',
    type: 'bar_counter',
    label: 'Barra 2',
    x: 90,
    y: 15,
    w: 6,
    h: 70,
    interactive: false,
    zone: 'barra2',
  },
];
