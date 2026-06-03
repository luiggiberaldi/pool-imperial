import { useState, useRef } from 'react';
import { storageService } from '../utils/storageService';
import { showToast } from '../components/Toast';
import { buildProductPayload } from '../utils/productProcessor';
import { round2, mulR, divR } from '../utils/dinero';

export function useProductForm({ products, effectiveRate, setProducts, broadcastProductDelta, triggerHaptic, auditLog, onClose }) {
    const [editingId, setEditingId] = useState(null);
    const [name, setName] = useState('');
    const [barcode, setBarcode] = useState('');
    const [priceUsd, setPriceUsd] = useState('');
    const [costUsd, setCostUsd] = useState('');
    const [stock, setStock] = useState('');
    const [unit, setUnit] = useState('unidad');
    const [unitsPerPackage, setUnitsPerPackage] = useState('');
    const [sellByUnit, setSellByUnit] = useState(false);
    const [unitPriceUsd, setUnitPriceUsd] = useState('');
    const [category, setCategory] = useState('otros');
    const [lowStockAlert, setLowStockAlert] = useState('5');
    const [image, setImage] = useState(null);
    const [packagingType, setPackagingType] = useState('suelto');
    const [stockInLotes, setStockInLotes] = useState('');
    const [granelUnit, setGranelUnit] = useState('kg');
    const [isCombo, setIsCombo] = useState(false);
    const [linkedProductId, setLinkedProductId] = useState(null);
    const [linkedQty, setLinkedQty] = useState('1');
    const [isFormShaking, setIsFormShaking] = useState(false);
    const [productMovements, setProductMovements] = useState([]);
    const [taxType, setTaxType] = useState('exento');
    const [taxMode, setTaxMode] = useState('inclusive');
    const fileInputRef = useRef(null);

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 400;
                let width = img.width, height = img.height;
                if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } }
                else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                setImage(canvas.toDataURL('image/webp', 0.7));
            };
        };
    };

    const handlePriceUsdChange = (val) => {
        setPriceUsd(val);
    };

    const handleCostUsdChange = (val) => {
        setCostUsd(val);
    };

    const handleClose = () => {
        setName(''); setBarcode(''); setPriceUsd(''); setCostUsd('');
        setStock(''); setUnit('unidad'); setUnitsPerPackage(''); setSellByUnit(false); setUnitPriceUsd('');
        setCategory('otros'); setLowStockAlert('5'); setImage(null); setEditingId(null);
        setPackagingType('suelto'); setStockInLotes(''); setGranelUnit('kg');
        setIsCombo(false); setLinkedProductId(null); setLinkedQty('1');
        setProductMovements([]);
        setTaxType('exento'); setTaxMode('inclusive');
    };

    const handleSave = () => {
        triggerHaptic && triggerHaptic();
        if (!name || !priceUsd) {
            setIsFormShaking(true);
            setTimeout(() => setIsFormShaking(false), 500);
            return showToast('Nombre y precio requeridos', 'warning');
        }
        const hasCost = parseFloat(costUsd) > 0;
        if (!hasCost) {
            showToast('Sin costo registrado — la ganancia no se calculará correctamente', 'warning');
        }
        const productData = buildProductPayload({
            name, barcode, priceUsd, priceBs: '', costUsd, costBs: '', stock, stockInLotes,
            packagingType, unitsPerPackage, granelUnit, sellByUnit, unitPriceUsd,
            category, lowStockAlert, taxType, taxMode
        }, effectiveRate);

        if (editingId) {
            const oldProduct = products.find(p => p.id === editingId);
            const oldPrice = oldProduct?.priceUsdt ?? 0;
            const newPrice = productData.priceUsdt ?? 0;
            const meta = { productoId: editingId, productName: name };
            if (oldPrice !== newPrice) { meta.oldPrice = oldPrice; meta.newPrice = newPrice; }
            const updatedProduct = { ...oldProduct, ...productData, image: image || oldProduct?.image };
            setProducts(products.map(p => p.id === editingId ? updatedProduct : p));
            // Broadcast instantáneo (sin imagen para reducir tamaño del mensaje)
            if (broadcastProductDelta) {
                const { image: _img, ...productWithoutImage } = updatedProduct;
                broadcastProductDelta('product_update', { product: productWithoutImage });
            }
            auditLog('INVENTARIO', 'PRODUCTO_EDITADO', `Producto "${name}" editado${oldPrice !== newPrice ? ` (precio: $${oldPrice} → $${newPrice})` : ''}`, meta);
        } else {
            const newProduct = { id: crypto.randomUUID(), ...productData, image, createdAt: new Date().toISOString() };
            setProducts([newProduct, ...products]);
            // Broadcast instantáneo del nuevo producto
            if (broadcastProductDelta) {
                const { image: _img, ...productWithoutImage } = newProduct;
                broadcastProductDelta('product_added', { product: productWithoutImage });
            }
            auditLog('INVENTARIO', 'PRODUCTO_CREADO', `Producto "${name}" creado - $${priceUsd || '0'}`);
        }
        handleClose();
        onClose && onClose();
    };

    const handleEdit = async (product) => {
        triggerHaptic && triggerHaptic();
        setEditingId(product.id);
        setName(product.name);
        setBarcode(product.barcode || '');

        const currentPriceUsd = product.priceUsdt || 0;
        setPriceUsd(currentPriceUsd > 0 ? currentPriceUsd.toString() : '');

        const storedCostUsd = product.costUsd || 0;
        setCostUsd(storedCostUsd > 0 ? String(round2(storedCostUsd)) : '');

        setStock(product.stock ?? '');
        setUnit(product.unit || 'unidad');
        setUnitsPerPackage(product.unitsPerPackage || '');
        setSellByUnit(product.sellByUnit || false);
        setUnitPriceUsd(product.unitPriceUsd ? product.unitPriceUsd.toString() : '');
        setCategory(product.category || 'otros');
        setLowStockAlert(product.lowStockAlert ?? 5);
        setImage(product.image);

        const u = product.unit || 'unidad';
        if (product.packagingType) {
            setPackagingType(product.packagingType);
        } else if (u === 'paquete') {
            setPackagingType('lote');
        } else if (u === 'kg' || u === 'litro') {
            setPackagingType('granel');
            setGranelUnit(u);
        } else {
            setPackagingType('suelto');
        }

        if (product.stockInLotes) {
            setStockInLotes(product.stockInLotes.toString());
        } else if (u === 'paquete' && product.unitsPerPackage && product.stock) {
            setStockInLotes(Math.floor(product.stock / (product.unitsPerPackage || 1)).toString());
        } else {
            setStockInLotes('');
        }

        if (u === 'kg' || u === 'litro') setGranelUnit(u);

        // Restaurar datos de combo si existen
        setIsCombo(!!product.isCombo);
        setLinkedProductId(product.linkedProductId || null);
        setLinkedQty(product.linkedQty ? String(product.linkedQty) : '1');
        setTaxType(product.taxType || 'exento');
        setTaxMode(product.taxMode || 'inclusive');

        try {
            const allSales = await storageService.getItem('bodega_sales_v1', []);
            const movements = allSales
                .filter(s => (s.items || []).some(i => i.id === product.id || i.name === product.name))
                .map(s => {
                    const item = (s.items || []).find(i => i.id === product.id || i.name === product.name);
                    return { id: s.id, timestamp: s.timestamp, tipo: s.tipo || 'VENTA', qty: item?.qty, clienteName: s.clienteName || null };
                })
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 20);
            setProductMovements(movements);
        } catch (e) {
            setProductMovements([]);
        }
    };

    return {
        editingId, name, setName, barcode, setBarcode,
        priceUsd, costUsd, stock, setStock,
        unit, setUnit, unitsPerPackage, setUnitsPerPackage,
        sellByUnit, setSellByUnit, unitPriceUsd, setUnitPriceUsd,
        category, setCategory, lowStockAlert, setLowStockAlert,
        image, setImage, packagingType, setPackagingType,
        stockInLotes, setStockInLotes, granelUnit, setGranelUnit,
        isFormShaking, productMovements,
        isCombo, setIsCombo, linkedProductId, setLinkedProductId,
        linkedQty, setLinkedQty,
        taxType, setTaxType, taxMode, setTaxMode,
        fileInputRef,
        handleImageUpload, handlePriceUsdChange,
        handleCostUsdChange,
        handleSave, handleEdit, handleClose,
    };
}
