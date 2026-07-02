import { jsPDF } from 'jspdf';
import { capitalizeName } from './calculatorUtils';
import { FinancialEngine } from '../core/FinancialEngine';

const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

/**
 * Genera un PDF (A4) del historial de ventas YA FILTRADO en pantalla.
 * Refleja exactamente las ventas visibles (búsqueda + filtro + rango).
 *
 * @param {Array} sales  Lista de ventas filtradas (searchedSales)
 * @param {Object} meta  { rangeLabel, search, filterLabel, businessName }
 */
export function generateSalesReportPDF(sales = [], meta = {}) {
    const {
        rangeLabel = '',
        search = '',
        filterLabel = 'Todas',
        userName = '',
        commission = null,
        businessName = localStorage.getItem('business_name') || 'Pool Imperial',
    } = meta;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const M = 14;
    const RIGHT = PW - M;

    const INK = [33, 37, 41];
    const MUTED = [120, 128, 138];
    const RULE = [210, 215, 222];
    const RED = [200, 50, 60];
    const HEADBG = [238, 240, 245];

    // Totales (las anuladas no suman)
    const completed = sales.filter(s => s.status !== 'ANULADA');
    const voided = sales.filter(s => s.status === 'ANULADA');
    const totalRevenue = completed.reduce((a, s) => a + FinancialEngine.calculateSaleNetTotal(s), 0);

    let y = M;

    // ── Encabezado ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...INK);
    doc.text('Reporte de Ventas', M, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(businessName, RIGHT, y, { align: 'right' });
    y += 7;

    // ── Línea de filtros aplicados ──
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    const filtros = [];
    if (rangeLabel) filtros.push(`Periodo: ${rangeLabel}`);
    if (userName) filtros.push(`Usuario: ${capitalizeName(userName)}`);
    filtros.push(`Estado: ${filterLabel}`);
    if (search && search.trim()) filtros.push(`Búsqueda: "${search.trim()}"`);
    const generado = new Date().toLocaleString('es-CO');
    doc.text(filtros.join('   ·   '), M, y);
    y += 5;
    doc.text(`Generado: ${generado}`, M, y);
    y += 6;

    // ── Tarjeta resumen ──
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    doc.line(M, y, RIGHT, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(`Ventas: ${completed.length}`, M, y);
    doc.text(`Anuladas: ${voided.length}`, M + 45, y);
    doc.text(`Total ingresos: ${formatCOP(totalRevenue)}`, RIGHT, y, { align: 'right' });
    y += 7;

    // ── Comisiones del usuario (propinas) ──
    if (userName && commission != null) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...INK);
        doc.text(`Comisiones generadas por ${capitalizeName(userName)}:`, M, y);
        doc.setTextColor(16, 124, 65);
        doc.text(formatCOP(commission), RIGHT, y, { align: 'right' });
        doc.setTextColor(...INK);
        y += 7;
    }

    // ── Encabezado de tabla ──
    const COLS = {
        num: M + 2,
        fecha: M + 22,
        usuario: M + 62,
        cliente: M + 105,
        total: RIGHT - 26,
        estado: RIGHT,
    };
    const drawTableHeader = () => {
        doc.setFillColor(...HEADBG);
        doc.rect(M, y - 4, PW - M * 2, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text('N°', COLS.num, y);
        doc.text('FECHA', COLS.fecha, y);
        doc.text('USUARIO', COLS.usuario, y);
        doc.text('CLIENTE', COLS.cliente, y);
        doc.text('TOTAL', COLS.total, y, { align: 'right' });
        doc.text('ESTADO', COLS.estado, y, { align: 'right' });
        y += 7;
    };
    drawTableHeader();

    const trunc = (str, n) => {
        const s = String(str || '');
        return s.length > n ? s.substring(0, n - 1) + '…' : s;
    };

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);

    sales.forEach((s, i) => {
        if (y > PH - 18) {
            doc.addPage();
            y = M;
            drawTableHeader();
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
        }

        const isVoid = s.status === 'ANULADA';
        const d = new Date(s.timestamp);
        const fecha = `${d.toLocaleDateString('es-CO')} ${d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`;
        const num = s.saleNumber !== undefined ? '#' + String(s.saleNumber).padStart(5, '0') : (s.id || '').substring(0, 6).toUpperCase();
        const usuario = capitalizeName(s.meseroNombre || s.vendedorNombre || '—');
        const cliente = s.customerName || 'Consumidor Final';
        const total = FinancialEngine.calculateSaleNetTotal(s);

        // Fondo alterno
        if (i % 2 === 1) {
            doc.setFillColor(248, 249, 251);
            doc.rect(M, y - 4, PW - M * 2, 6.5, 'F');
        }

        doc.setTextColor(...(isVoid ? RED : INK));
        doc.text(num, COLS.num, y);
        doc.text(fecha, COLS.fecha, y);
        doc.text(trunc(usuario, 22), COLS.usuario, y);
        doc.text(trunc(cliente, 22), COLS.cliente, y);
        doc.text(formatCOP(total), COLS.total, y, { align: 'right' });
        doc.setTextColor(...(isVoid ? RED : MUTED));
        doc.text(isVoid ? 'ANULADA' : 'OK', COLS.estado, y, { align: 'right' });
        y += 6.5;
    });

    // ── Total final ──
    if (y > PH - 16) { doc.addPage(); y = M; }
    doc.setDrawColor(...RULE);
    doc.line(M, y, RIGHT, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(`Total de ${completed.length} venta(s):`, M, y);
    doc.text(formatCOP(totalRevenue), RIGHT, y, { align: 'right' });

    // ── Descargar / compartir ──
    const safe = (search && search.trim() ? '_' + search.trim().replace(/[^a-z0-9]/gi, '') : '');
    const filename = `reporte_ventas${safe}_${new Date().toISOString().slice(0, 10)}.pdf`;
    const blob = doc.output('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });

    const isMobile = 'ontouchstart' in window && window.innerWidth < 768;
    if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ title: 'Reporte de Ventas', files: [file] }).catch(() => doc.save(filename));
    } else {
        doc.save(filename);
    }
}

/**
 * Genera un PDF (A4) del reporte de ventas agrupadas por artículo.
 *
 * @param {Array} articles Lista de productos vendidos agrupados
 * @param {Object} meta { rangeLabel, search, businessName }
 */
export function generateArticlesReportPDF(articles = [], meta = {}) {
    const {
        rangeLabel = '',
        search = '',
        businessName = localStorage.getItem('business_name') || 'Pool Imperial',
    } = meta;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const M = 14;
    const RIGHT = PW - M;

    const INK = [33, 37, 41];
    const MUTED = [120, 128, 138];
    const RULE = [210, 215, 222];
    const HEADBG = [238, 240, 245];

    let y = M;

    // Encabezado
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...INK);
    doc.text('Reporte de Ventas por Artículo', M, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(businessName, RIGHT, y, { align: 'right' });
    y += 7;

    // Filtros
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    const filtros = [];
    if (rangeLabel) filtros.push(`Periodo: ${rangeLabel}`);
    if (search && search.trim()) filtros.push(`Búsqueda: "${search.trim()}"`);
    const generado = new Date().toLocaleString('es-CO');
    doc.text(filtros.join('   ·   '), M, y);
    y += 5;
    doc.text(`Generado: ${generado}`, M, y);
    y += 8;

    // Totales de resumen
    const totalQty = articles.reduce((a, p) => a + p.qty, 0);
    const totalRevenue = articles.reduce((a, p) => a + p.revenue, 0);

    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    doc.line(M, y, RIGHT, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(`Artículos vendidos: ${articles.length}`, M, y);
    doc.text(`Total unidades: ${totalQty.toFixed(0)}`, M + 60, y);
    doc.text(`Total ingresos: ${formatCOP(totalRevenue)}`, RIGHT, y, { align: 'right' });
    y += 7;

    // Tabla
    const COLS = {
        num: M + 2,
        product: M + 15,
        qty: RIGHT - 45,
        revenue: RIGHT,
    };

    const drawTableHeader = () => {
        doc.setFillColor(...HEADBG);
        doc.rect(M, y - 4, PW - M * 2, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...MUTED);
        doc.text('N°', COLS.num, y);
        doc.text('PRODUCTO', COLS.product, y);
        doc.text('CANTIDAD', COLS.qty, y, { align: 'right' });
        doc.text('INGRESO', COLS.revenue, y, { align: 'right' });
        y += 7;
    };
    drawTableHeader();

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    articles.forEach((p, i) => {
        if (y > PH - 18) {
            doc.addPage();
            y = M;
            drawTableHeader();
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
        }

        if (i % 2 === 1) {
            doc.setFillColor(248, 249, 251);
            doc.rect(M, y - 4, PW - M * 2, 6.5, 'F');
        }

        doc.setTextColor(...INK);
        doc.text(String(i + 1), COLS.num, y);
        doc.text(p.name, COLS.product, y);
        doc.text(p.isWeight ? p.qty.toFixed(2) + ' kg' : String(p.qty), COLS.qty, y, { align: 'right' });
        doc.text(formatCOP(p.revenue), COLS.revenue, y, { align: 'right' });

        y += 6.5;
    });

    // Total final
    if (y > PH - 16) { doc.addPage(); y = M; }
    doc.setDrawColor(...RULE);
    doc.line(M, y, RIGHT, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(`Total ingresos por artículos:`, M, y);
    doc.text(formatCOP(totalRevenue), RIGHT, y, { align: 'right' });

    // Descargar
    const safe = (search && search.trim() ? '_' + search.trim().replace(/[^a-z0-9]/gi, '') : '');
    const filename = `reporte_ventas_articulos${safe}_${new Date().toISOString().slice(0, 10)}.pdf`;
    const blob = doc.output('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });

    const isMobile = 'ontouchstart' in window && window.innerWidth < 768;
    if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ title: 'Reporte de Ventas por Artículo', files: [file] }).catch(() => doc.save(filename));
    } else {
        doc.save(filename);
    }
}

/**
 * Genera un PDF (A4) del reporte de cierres de caja históricos.
 *
 * @param {Array} closings Lista de cierres de caja agrupados
 * @param {Object} meta { rangeLabel, businessName }
 */
export function generateCierresListReportPDF(closings = [], meta = {}) {
    const {
        rangeLabel = '',
        businessName = localStorage.getItem('business_name') || 'Pool Imperial',
    } = meta;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const M = 14;
    const RIGHT = PW - M;

    const INK = [33, 37, 41];
    const MUTED = [120, 128, 138];
    const RULE = [210, 215, 222];
    const HEADBG = [238, 240, 245];

    let y = M;

    // Encabezado
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...INK);
    doc.text('Reporte de Historial de Cierres', M, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(businessName, RIGHT, y, { align: 'right' });
    y += 7;

    // Filtros
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    const filtros = [];
    if (rangeLabel) filtros.push(`Periodo: ${rangeLabel}`);
    const generado = new Date().toLocaleString('es-CO');
    doc.text(filtros.join('   ·   '), M, y);
    y += 5;
    doc.text(`Generado: ${generado}`, M, y);
    y += 8;

    // Totales de resumen
    const totalCierres = closings.length;
    const totalRecaudado = closings.reduce((a, c) => a + (c.totalCOP || 0), 0);
    const totalSales = closings.reduce((a, c) => a + (c.salesForStats?.length || 0), 0);

    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    doc.line(M, y, RIGHT, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(`Total Cierres: ${totalCierres}`, M, y);
    doc.text(`Ventas Totales: ${totalSales}`, M + 50, y);
    doc.text(`Total Recaudado: ${formatCOP(totalRecaudado)}`, RIGHT, y, { align: 'right' });
    y += 7;

    // Tabla
    const COLS = {
        num: M + 2,
        fecha: M + 12,
        cajero: M + 62,
        salesCount: M + 115,
        itemsCount: M + 138,
        total: RIGHT,
    };

    const drawTableHeader = () => {
        doc.setFillColor(...HEADBG);
        doc.rect(M, y - 4, PW - M * 2, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...MUTED);
        doc.text('N°', COLS.num, y);
        doc.text('FECHA/HORA CIERRE', COLS.fecha, y);
        doc.text('CAJERO', COLS.cajero, y);
        doc.text('VENTAS', COLS.salesCount, y, { align: 'right' });
        doc.text('ARTÍCULOS', COLS.itemsCount, y, { align: 'right' });
        doc.text('RECAUDADO', COLS.total, y, { align: 'right' });
        y += 7;
    };
    drawTableHeader();

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);

    closings.forEach((c, i) => {
        if (y > PH - 18) {
            doc.addPage();
            y = M;
            drawTableHeader();
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
        }

        if (i % 2 === 1) {
            doc.setFillColor(248, 249, 251);
            doc.rect(M, y - 4, PW - M * 2, 6.5, 'F');
        }

        const dateLabel = new Date(c.cierreId).toLocaleString('es-CO', { 
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit' 
        });
        const cajero = capitalizeName(c.apertura?.cajeroNombre || 'Sistema');
        const salesCount = String(c.salesForStats?.length || 0);
        const itemsCount = String(c.totalItems || 0);
        const recaudado = formatCOP(c.totalCOP || 0);

        doc.setTextColor(...INK);
        doc.text(String(i + 1), COLS.num, y);
        doc.text(dateLabel, COLS.fecha, y);
        doc.text(cajero, COLS.cajero, y);
        doc.text(salesCount, COLS.salesCount, y, { align: 'right' });
        doc.text(itemsCount, COLS.itemsCount, y, { align: 'right' });
        doc.text(recaudado, COLS.total, y, { align: 'right' });

        y += 6.5;
    });

    // Total final
    if (y > PH - 16) { doc.addPage(); y = M; }
    doc.setDrawColor(...RULE);
    doc.line(M, y, RIGHT, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(`Total acumulado cierres:`, M, y);
    doc.text(formatCOP(totalRecaudado), RIGHT, y, { align: 'right' });

    // Descargar
    const filename = `reporte_cierres_caja_${new Date().toISOString().slice(0, 10)}.pdf`;
    const blob = doc.output('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });

    const isMobile = 'ontouchstart' in window && window.innerWidth < 768;
    if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ title: 'Reporte Historial de Cierres', files: [file] }).catch(() => doc.save(filename));
    } else {
        doc.save(filename);
    }
}
