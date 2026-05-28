import { useState, useRef, useEffect } from 'react';
import { useProductFiltering } from './useProductFiltering';

function calculateGridItems() {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
    if (w >= 1536) return 30;
    if (w >= 1280) return 25;
    if (w >= 1024) return 24;
    if (w >= 768) return 18;
    return 14;
}

export function useProductPagination({ products, effectiveRate, triggerHaptic }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState(() => {
        const pending = localStorage.getItem('nav_inventory_filter');
        if (pending) {
            localStorage.removeItem('nav_inventory_filter');
            return pending;
        }
        return 'todos';
    });

    // Listen for navigation filter changes when already mounted
    useEffect(() => {
        const handler = () => {
            const pending = localStorage.getItem('nav_inventory_filter');
            if (pending) {
                localStorage.removeItem('nav_inventory_filter');
                setActiveCategory(pending);
                setCurrentPage(1);
            }
        };
        window.addEventListener('nav_inventory_filter', handler);
        return () => window.removeEventListener('nav_inventory_filter', handler);
    }, []);
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState(() => localStorage.getItem('bodega_inventory_view') || 'grid');
    const [sortField, setSortField] = useState(null);
    const [sortDir, setSortDir] = useState('asc');
    const [itemsPerPage, setItemsPerPage] = useState(() => {
        const mode = localStorage.getItem('bodega_inventory_view') || 'grid';
        return mode === 'list' ? 30 : calculateGridItems();
    });
    const categoryScrollRef = useRef(null);

    useEffect(() => {
        const handleResize = () => { if (viewMode === 'grid') setItemsPerPage(calculateGridItems()); };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [viewMode]);

    const { filteredProducts } = useProductFiltering(products, searchTerm, activeCategory, sortField, sortDir, effectiveRate);

    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    const paginatedProducts = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const lowStockCount = products.filter(p => (p.stock ?? 0) <= (p.lowStockAlert ?? 5) && (p.stock ?? 0) >= 0).length;

    const handleSetSearchTerm = (term) => { setSearchTerm(term); setCurrentPage(1); };
    const handleSetActiveCategory = (cat) => { setActiveCategory(cat); setCurrentPage(1); };

    const toggleViewMode = () => {
        const next = viewMode === 'grid' ? 'list' : 'grid';
        setViewMode(next);
        localStorage.setItem('bodega_inventory_view', next);
        setCurrentPage(1);
        setItemsPerPage(next === 'list' ? 25 : (window.innerWidth >= 1024 ? 12 : 8));
        triggerHaptic && triggerHaptic();
    };

    const handleSort = (field) => {
        if (sortField === field) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
        setCurrentPage(1);
    };

    return {
        searchTerm, handleSetSearchTerm,
        activeCategory, handleSetActiveCategory,
        currentPage, setCurrentPage,
        viewMode, toggleViewMode,
        sortField, sortDir, handleSort,
        itemsPerPage, filteredProducts, paginatedProducts, totalPages, lowStockCount,
        categoryScrollRef,
    };
}
