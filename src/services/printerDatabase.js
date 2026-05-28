/**
 * printerDatabase.js
 * Base de datos de impresoras conocidas por USB Vendor ID / Product ID.
 * Permite auto-detectar el modelo y configurar automáticamente baud rate,
 * ancho de papel y protocolo de impresión.
 *
 * type:
 *   'thermal'        → impresora térmica USB directa (ESC/POS)
 *   'thermal_serial' → adaptador USB-Serial con impresora térmica (ESC/POS via COM)
 *   'system'         → inkjet / laser → usar window.print() del sistema
 */

export const PRINTER_DB = [
    // ── EPSON Thermal (TM Series) ────────────────────────────────────────────
    { vid: 0x04B8, pid: 0x0202, brand: 'Epson', model: 'TM-T20 / TM-T88IV / TM-T88V', type: 'thermal', baudRate: 115200, paperWidth: 80 },
    { vid: 0x04B8, pid: 0x0E15, brand: 'Epson', model: 'TM-T20III',  type: 'thermal', baudRate: 115200, paperWidth: 80 },
    { vid: 0x04B8, pid: 0x0E1F, brand: 'Epson', model: 'TM-T20II',   type: 'thermal', baudRate: 115200, paperWidth: 80 },
    { vid: 0x04B8, pid: 0x0E28, brand: 'Epson', model: 'TM-T88VI',   type: 'thermal', baudRate: 115200, paperWidth: 80 },
    { vid: 0x04B8, pid: 0x0E2A, brand: 'Epson', model: 'TM-T82III',  type: 'thermal', baudRate: 115200, paperWidth: 80 },
    { vid: 0x04B8, pid: 0x0003, brand: 'Epson', model: 'TM-T88III',  type: 'thermal', baudRate: 9600,   paperWidth: 80 },
    { vid: 0x04B8, pid: 0x0005, brand: 'Epson', model: 'TM-T90',     type: 'thermal', baudRate: 115200, paperWidth: 80 },
    { vid: 0x04B8, pid: 0x0007, brand: 'Epson', model: 'TM-T70',     type: 'thermal', baudRate: 115200, paperWidth: 80 },
    { vid: 0x04B8, pid: 0x0152, brand: 'Epson', model: 'TM-T70II',   type: 'thermal', baudRate: 115200, paperWidth: 80 },

    // ── STAR MICRONICS ───────────────────────────────────────────────────────
    { vid: 0x0519, pid: 0x0001, brand: 'Star', model: 'TSP100 / TSP143',   type: 'thermal', baudRate: 115200, paperWidth: 80 },
    { vid: 0x0519, pid: 0x0003, brand: 'Star', model: 'TSP650 / TSP654',   type: 'thermal', baudRate: 115200, paperWidth: 80 },
    { vid: 0x0519, pid: 0x000B, brand: 'Star', model: 'mPOP',              type: 'thermal', baudRate: 115200, paperWidth: 58 },
    { vid: 0x0519, pid: 0x0006, brand: 'Star', model: 'SP700',             type: 'thermal', baudRate: 115200, paperWidth: 76 },

    // ── BIXOLON ──────────────────────────────────────────────────────────────
    { vid: 0x1504, pid: 0x0006, brand: 'Bixolon', model: 'SRP-350',  type: 'thermal', baudRate: 115200, paperWidth: 80 },
    { vid: 0x1504, pid: 0x0012, brand: 'Bixolon', model: 'SRP-300',  type: 'thermal', baudRate: 115200, paperWidth: 58 },
    { vid: 0x1504, pid: 0x0016, brand: 'Bixolon', model: 'SRP-F310', type: 'thermal', baudRate: 115200, paperWidth: 80 },
    { vid: 0x1504, pid: 0x001C, brand: 'Bixolon', model: 'SRP-350III', type: 'thermal', baudRate: 115200, paperWidth: 80 },

    // ── XPRINTER ─────────────────────────────────────────────────────────────
    { vid: 0x0FE6, pid: 0x811E, brand: 'Xprinter', model: 'XP-58 / XP-80',     type: 'thermal', baudRate: 9600,  paperWidth: 58 },
    { vid: 0x28E9, pid: 0x0289, brand: 'Xprinter', model: 'XP-58III / XP-80III', type: 'thermal', baudRate: 9600, paperWidth: 58 },

    // ── HPRT ─────────────────────────────────────────────────────────────────
    { vid: 0x0456, pid: 0x0808, brand: 'HPRT', model: 'TP808 / TP810', type: 'thermal', baudRate: 115200, paperWidth: 80 },
    { vid: 0x0456, pid: 0x0002, brand: 'HPRT', model: 'TP58 / TP80',   type: 'thermal', baudRate: 9600,   paperWidth: 58 },

    // ── CITIZEN ──────────────────────────────────────────────────────────────
    { vid: 0x1D90, pid: 0x2060, brand: 'Citizen', model: 'CT-S310 / CT-S315', type: 'thermal', baudRate: 115200, paperWidth: 80 },
    { vid: 0x1D90, pid: 0x2050, brand: 'Citizen', model: 'CT-S280',            type: 'thermal', baudRate: 115200, paperWidth: 58 },

    // ── SEWOO ────────────────────────────────────────────────────────────────
    { vid: 0x154F, pid: 0x0303, brand: 'Sewoo', model: 'LK-T210 / T310', type: 'thermal', baudRate: 115200, paperWidth: 58 },

    // ── POSTEK ───────────────────────────────────────────────────────────────
    { vid: 0x0DD4, pid: 0x0186, brand: 'Postek', model: 'Serie C / G / Q', type: 'thermal', baudRate: 9600, paperWidth: 80 },

    // ── COL-POS (Colombia/Venezuela) ─────────────────────────────────────────
    // Las impresoras COL-POS usan distintos chips USB-serial según el modelo.
    // Se listan los VID/PID conocidos con los defaults correctos para este hardware.
    { vid: 0x1A86, pid: 0x7523, brand: 'COL-POS / Genérica',  model: 'Térmica 58mm (CH340)',  type: 'thermal_serial', baudRate: 9600, paperWidth: 58 },
    { vid: 0x1A86, pid: 0x5523, brand: 'COL-POS / Genérica',  model: 'Térmica 58mm (CH341)',  type: 'thermal_serial', baudRate: 9600, paperWidth: 58 },
    { vid: 0x0FE6, pid: 0x811E, brand: 'COL-POS / Xprinter',  model: 'Térmica 58mm USB',      type: 'thermal',        baudRate: 9600, paperWidth: 58 },
    { vid: 0x0FE6, pid: 0x9900, brand: 'COL-POS / Genérica',  model: 'Térmica 58mm USB',      type: 'thermal',        baudRate: 9600, paperWidth: 58 },
    { vid: 0x10C4, pid: 0xEA60, brand: 'COL-POS / Genérica',  model: 'Térmica 58mm (CP2102)', type: 'thermal_serial', baudRate: 9600, paperWidth: 58 },
    { vid: 0x067B, pid: 0x2303, brand: 'COL-POS / Genérica',  model: 'Térmica 58mm (PL2303)', type: 'thermal_serial', baudRate: 9600, paperWidth: 58 },

    // ── FC-588 / Impresoras genéricas 58mm (USB/Bluetooth) ────────────────────
    // La FC-588 usa distintos chips USB según el lote de fabricación.
    // STM32 CDC (común en FC-588, FC-58H, FC-58L):
    { vid: 0x0483, pid: 0x5740, brand: 'FC-588 / Genérica', model: 'Térmica 58mm (STM32)', type: 'thermal', baudRate: 9600, paperWidth: 58 },
    // NXP LPC (variantes FC-588):
    { vid: 0x1FC9, pid: 0x2016, brand: 'FC-588 / Genérica', model: 'Térmica 58mm (NXP)',   type: 'thermal', baudRate: 9600, paperWidth: 58 },
    // QinHeng (algunas FC-588 usan CH340 igual que COL-POS, ya cubierto arriba)

    // ── ZJIANG (impresoras chinas genéricas) ─────────────────────────────────
    { vid: 0x0416, pid: 0x5011, brand: 'Zjiang', model: 'ZJ-5804 / ZJ-5808', type: 'thermal', baudRate: 9600, paperWidth: 58 },

    // ── USB-TO-SERIAL CHIPS (genéricos sin marca identificada) ──────────────
    // Si no matchea con un modelo conocido arriba, cae aquí.
    { vid: 0x0403, pid: 0x6001, brand: 'FTDI',         model: 'USB-Serial FT232R',   type: 'thermal_serial', baudRate: 9600, paperWidth: 58, note: 'Adaptador USB-Serial' },
    { vid: 0x0403, pid: 0x6015, brand: 'FTDI',         model: 'USB-Serial FT231X',   type: 'thermal_serial', baudRate: 9600, paperWidth: 58 },

    // ── INKJET / LASER → window.print() ──────────────────────────────────────
    // pid: null = coincide con cualquier PID del vendor si no hay match exacto
    { vid: 0x04B8, pid: null, brand: 'Epson',     model: 'Inkjet / EcoTank / L-Series', type: 'system', baudRate: null, paperWidth: null },
    { vid: 0x03F0, pid: null, brand: 'HP',         model: 'Impresora HP',                type: 'system', baudRate: null, paperWidth: null },
    { vid: 0x04A9, pid: null, brand: 'Canon',      model: 'Impresora Canon',             type: 'system', baudRate: null, paperWidth: null },
    { vid: 0x04F9, pid: null, brand: 'Brother',    model: 'Impresora Brother',           type: 'system', baudRate: null, paperWidth: null },
    { vid: 0x04E8, pid: null, brand: 'Samsung',    model: 'Impresora Samsung',           type: 'system', baudRate: null, paperWidth: null },
    { vid: 0x043D, pid: null, brand: 'Lexmark',    model: 'Impresora Lexmark',           type: 'system', baudRate: null, paperWidth: null },
    { vid: 0x04DA, pid: null, brand: 'Panasonic',  model: 'Impresora Panasonic',         type: 'system', baudRate: null, paperWidth: null },
    { vid: 0x04B0, pid: null, brand: 'Kodak',      model: 'Impresora Kodak',             type: 'system', baudRate: null, paperWidth: null },
];

/**
 * Busca una impresora por VID/PID.
 * Primero intenta coincidencia exacta (vid + pid),
 * luego coincidencia por vendor (pid: null en la DB).
 */
export function lookupPrinter(vendorId, productId) {
    if (!vendorId) return null;

    // 1. Coincidencia exacta
    if (productId != null) {
        const exact = PRINTER_DB.find(p => p.vid === vendorId && p.pid === productId);
        if (exact) return exact;
    }

    // 2. Coincidencia por vendor (pid: null = cualquier producto de ese fabricante)
    const byVendor = PRINTER_DB.find(p => p.vid === vendorId && p.pid === null);
    if (byVendor) return byVendor;

    return null;
}

export const TYPE_LABELS = {
    thermal:        { label: 'Impresora Térmica',             color: 'emerald' },
    thermal_serial: { label: 'Impresora Térmica (Serial/USB)', color: 'emerald' },
    system:         { label: 'Impresora del Sistema',          color: 'indigo'  },
};
