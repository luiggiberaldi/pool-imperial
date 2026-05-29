/**
 * floorPlanData.js
 * Dataset del plano físico de Pool Imperial.
 * Las coordenadas x, y son % del ancho/alto del contenedor (0–100).
 * w, h son también % del contenedor.
 *
 * type:
 *   'pool_table'   → Mesa de billar (interactiva, vinculada a una mesa del store)
 *   'bar_table'    → Mesa normal de bar/comedor (interactiva, vinculada a mesa del store)
 *   'bar_stool'    → Taburete de barra (interactivo, vinculado a mesa del store si aplica)
 *   'bar_counter'  → Mostrador / barra (decorativo, no interactivo)
 *   'entry'        → Entrada al local
 *   'logo'         → Logo area (decorativo)
 *   'label'        → Etiqueta de zona (decorativo)
 */

/** @type {Array<import('./floorPlanTypes').FloorItem>} */
export const FLOOR_ITEMS = [
  // ─────────────────────────────────────────
  // ZONA: ENTRADA
  // ─────────────────────────────────────────
  {
    id: 'entry-1',
    type: 'entry',
    label: 'Entrada',
    x: 0,
    y: 73,
    w: 5,
    h: 14,
    interactive: false,
    zone: 'entrada',
  },

  // ─────────────────────────────────────────
  // ZONA: MESAS NORMALES (izquierda)
  // ─────────────────────────────────────────
  {
    id: 'floor-m1',
    type: 'bar_table',
    refId: null, // se resuelve en runtime por nombre
    refName: 'M1',
    label: 'M1',
    x: 3.5,
    y: 57,
    w: 10,
    h: 14,
    interactive: true,
    zone: 'salon',
  },
  {
    id: 'floor-m2',
    type: 'bar_table',
    refName: 'M2',
    label: 'M2',
    x: 18,
    y: 22,
    w: 10,
    h: 12,
    interactive: true,
    zone: 'salon',
  },
  {
    id: 'floor-m3',
    type: 'bar_table',
    refName: 'M3',
    label: 'M3',
    x: 30,
    y: 22,
    w: 10,
    h: 12,
    interactive: true,
    zone: 'salon',
  },

  // ─────────────────────────────────────────
  // ZONA: MESAS NORMALES (superior centro)
  // ─────────────────────────────────────────
  {
    id: 'floor-m4',
    type: 'bar_stool',
    refName: 'M4',
    label: 'M4',
    x: 47.5,
    y: 5.5,
    w: 5.5,
    h: 8,
    interactive: true,
    zone: 'barra-alta',
  },
  {
    id: 'floor-m5',
    type: 'bar_stool',
    refName: 'M5',
    label: 'M5',
    x: 54.5,
    y: 5.5,
    w: 5.5,
    h: 8,
    interactive: true,
    zone: 'barra-alta',
  },
  {
    id: 'floor-m6',
    type: 'bar_stool',
    refName: 'M6',
    label: 'M6',
    x: 61.5,
    y: 5.5,
    w: 5.5,
    h: 8,
    interactive: true,
    zone: 'barra-alta',
  },
  {
    id: 'floor-m7',
    type: 'bar_stool',
    refName: 'M7',
    label: 'M7',
    x: 68.5,
    y: 5.5,
    w: 5.5,
    h: 8,
    interactive: true,
    zone: 'barra-alta',
  },

  // ─────────────────────────────────────────
  // ZONA: MESAS NORMALES (inferior derecha)
  // ─────────────────────────────────────────
  {
    id: 'floor-m8',
    type: 'bar_stool',
    refName: 'M8',
    label: 'M8',
    x: 50,
    y: 82,
    w: 5.5,
    h: 8,
    interactive: true,
    zone: 'barra-baja',
  },
  {
    id: 'floor-m9',
    type: 'bar_stool',
    refName: 'M9',
    label: 'M9',
    x: 57,
    y: 82,
    w: 5.5,
    h: 8,
    interactive: true,
    zone: 'barra-baja',
  },
  {
    id: 'floor-m10',
    type: 'bar_stool',
    refName: 'M10',
    label: 'M10',
    x: 64,
    y: 82,
    w: 5.5,
    h: 8,
    interactive: true,
    zone: 'barra-baja',
  },
  {
    id: 'floor-m11',
    type: 'bar_stool',
    refName: 'M11',
    label: 'M11',
    x: 71,
    y: 82,
    w: 5.5,
    h: 8,
    interactive: true,
    zone: 'barra-baja',
  },

  // ─────────────────────────────────────────
  // ZONA: MESAS DE POOL (centro)
  // ─────────────────────────────────────────
  {
    id: 'floor-pool1',
    type: 'pool_table',
    refName: 'Mesa Pool 1',
    label: 'Pool 1',
    x: 44,
    y: 27,
    w: 14,
    h: 34,
    interactive: true,
    zone: 'pool',
  },
  {
    id: 'floor-pool2',
    type: 'pool_table',
    refName: 'Mesa Pool 2',
    label: 'Pool 2',
    x: 60,
    y: 50,
    w: 18,
    h: 30,
    interactive: true,
    zone: 'pool',
  },
  {
    id: 'floor-pool3',
    type: 'pool_table',
    refName: 'Mesa Pool 3',
    label: 'Pool 3',
    x: 60,
    y: 15,
    w: 18,
    h: 30,
    interactive: true,
    zone: 'pool',
  },

  // ─────────────────────────────────────────
  // ZONA: BARRA 1 (L-shape)
  // Horizontal top arm
  // ─────────────────────────────────────────
  {
    id: 'barra1-h',
    type: 'bar_counter',
    label: 'Barra 1',
    x: 28,
    y: 46,
    w: 16,
    h: 8,
    interactive: false,
    zone: 'barra1',
  },
  // Vertical bottom arm
  {
    id: 'barra1-v',
    type: 'bar_counter',
    label: '',
    x: 38,
    y: 54,
    w: 6,
    h: 22,
    interactive: false,
    zone: 'barra1',
  },

  // ─────────────────────────────────────────
  // SILLAS de Barra 1 — frente (B1, B2)
  // ─────────────────────────────────────────
  {
    id: 'floor-b1',
    type: 'bar_stool',
    refName: 'B1',
    label: 'B1',
    x: 28,
    y: 39,
    w: 4,
    h: 6,
    interactive: true,
    zone: 'barra1',
  },
  {
    id: 'floor-b2',
    type: 'bar_stool',
    refName: 'B2',
    label: 'B2',
    x: 33,
    y: 39,
    w: 4,
    h: 6,
    interactive: true,
    zone: 'barra1',
  },

  // SILLAS lado vertical Barra 1 (B3-B6)
  {
    id: 'floor-b3',
    type: 'bar_stool',
    refName: 'B3',
    label: 'B3',
    x: 44,
    y: 55,
    w: 4,
    h: 5,
    interactive: true,
    zone: 'barra1',
  },
  {
    id: 'floor-b4',
    type: 'bar_stool',
    refName: 'B4',
    label: 'B4',
    x: 44,
    y: 61,
    w: 4,
    h: 5,
    interactive: true,
    zone: 'barra1',
  },
  {
    id: 'floor-b5',
    type: 'bar_stool',
    refName: 'B5',
    label: 'B5',
    x: 44,
    y: 67,
    w: 4,
    h: 5,
    interactive: true,
    zone: 'barra1',
  },
  {
    id: 'floor-b6',
    type: 'bar_stool',
    refName: 'B6',
    label: 'B6',
    x: 44,
    y: 73,
    w: 4,
    h: 5,
    interactive: true,
    zone: 'barra1',
  },

  // ─────────────────────────────────────────
  // ZONA: BARRA 2 (vertical, extremo derecho)
  // ─────────────────────────────────────────
  {
    id: 'barra2-counter',
    type: 'bar_counter',
    label: 'Barra 2',
    x: 91,
    y: 18,
    w: 5,
    h: 64,
    interactive: false,
    zone: 'barra2',
  },

  // SILLAS Barra 2 (B7-B15)
  {
    id: 'floor-b7',
    type: 'bar_stool',
    refName: 'B7',
    label: 'B7',
    x: 85.5,
    y: 18,
    w: 4,
    h: 5,
    interactive: true,
    zone: 'barra2',
  },
  {
    id: 'floor-b8',
    type: 'bar_stool',
    refName: 'B8',
    label: 'B8',
    x: 85.5,
    y: 24,
    w: 4,
    h: 5,
    interactive: true,
    zone: 'barra2',
  },
  {
    id: 'floor-b9',
    type: 'bar_stool',
    refName: 'B9',
    label: 'B9',
    x: 85.5,
    y: 30,
    w: 4,
    h: 5,
    interactive: true,
    zone: 'barra2',
  },
  {
    id: 'floor-b10',
    type: 'bar_stool',
    refName: 'B10',
    label: 'B10',
    x: 85.5,
    y: 36,
    w: 4,
    h: 5,
    interactive: true,
    zone: 'barra2',
  },
  {
    id: 'floor-b11',
    type: 'bar_stool',
    refName: 'B11',
    label: 'B11',
    x: 85.5,
    y: 42,
    w: 4,
    h: 5,
    interactive: true,
    zone: 'barra2',
  },
  {
    id: 'floor-b12',
    type: 'bar_stool',
    refName: 'B12',
    label: 'B12',
    x: 85.5,
    y: 48,
    w: 4,
    h: 5,
    interactive: true,
    zone: 'barra2',
  },
  {
    id: 'floor-b13',
    type: 'bar_stool',
    refName: 'B13',
    label: 'B13',
    x: 85.5,
    y: 54,
    w: 4,
    h: 5,
    interactive: true,
    zone: 'barra2',
  },
  {
    id: 'floor-b14',
    type: 'bar_stool',
    refName: 'B14',
    label: 'B14',
    x: 85.5,
    y: 60,
    w: 4,
    h: 5,
    interactive: true,
    zone: 'barra2',
  },
  {
    id: 'floor-b15',
    type: 'bar_stool',
    refName: 'B15',
    label: 'B15',
    x: 85.5,
    y: 66,
    w: 4,
    h: 5,
    interactive: true,
    zone: 'barra2',
  },

  // ─────────────────────────────────────────
  // DECORATIVO: Logo Area
  // ─────────────────────────────────────────
  {
    id: 'logo-area',
    type: 'logo',
    label: 'Pool Imperial',
    x: 16,
    y: 38,
    w: 20,
    h: 6,
    interactive: false,
    zone: 'salon',
  },
];
