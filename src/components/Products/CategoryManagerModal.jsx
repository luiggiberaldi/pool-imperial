import React, { useState } from 'react';
import { Plus, Trash2, X, Edit2, Check } from 'lucide-react';
import { Modal } from '../Modal';

export default function CategoryManagerModal({
    isOpen,
    onClose,
    categories,
    newCategoryName,
    setNewCategoryName,
    newCategoryIcon: _newCategoryIcon,
    setNewCategoryIcon: _setNewCategoryIcon,
    onAddCategory,
    onDeleteCategory,
    onEditCategory
}) {
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');

    const startEditing = (cat) => {
        setEditingId(cat.id);
        setEditName(cat.label);
    };

    const saveEdit = (catId) => {
        if(onEditCategory && editName.trim()) {
            onEditCategory(catId, editName);
        }
        setEditingId(null);
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Gestionar Categorías">
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 pb-4">
                {/* Nueva Categoría */}
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Crear Categoría</h4>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Nombre categoría"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            className="flex-1 form-input bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/50"
                        />
                        <button
                            onClick={onAddCategory}
                            disabled={!newCategoryName.trim()}
                            className="px-4 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                        >
                            <Plus size={18} />
                        </button>
                    </div>
                </div>

                {/* Lista de Categorías */}
                <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Tus Categorías</h4>
                    <div className="space-y-2">
                        {categories.map(cat => (
                            <div key={cat.id} className="flex justify-between items-center bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-xl shadow-sm">
                                {editingId === cat.id ? (
                                    <div className="flex flex-1 gap-2 items-center">
                                        <input 
                                            type="text" 
                                            value={editName} 
                                            onChange={e => setEditName(e.target.value)} 
                                            className="flex-1 form-input bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 font-bold"
                                            autoFocus
                                            onKeyDown={e => e.key === 'Enter' && saveEdit(cat.id)}
                                        />
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button onClick={() => saveEdit(cat.id)} className="p-2 text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors">
                                                <Check size={16} />
                                            </button>
                                            <button onClick={() => setEditingId(null)} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-3">
                                            <span className="font-bold text-slate-700 dark:text-slate-200">{cat.label}</span>
                                        </div>
                                        {cat.id !== 'todos' && cat.id !== 'otros' && (
                                            <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
                                                <button
                                                    onClick={() => startEditing(cat)}
                                                    className="p-2 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => onDeleteCategory(cat.id)}
                                                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
