import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

export default function CustomSelect({
    value,
    onChange,
    className = '',
    disabled = false,
    children,
    placeholder = 'Seleccione una opción...'
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [openUpward, setOpenUpward] = useState(false);
    const containerRef = useRef(null);

    // Extract options from children (which are expected to be <option> tags)
    const options = React.Children.toArray(children)
        .filter(child => React.isValidElement(child))
        .map(child => ({
            value: child.props.value,
            label: child.props.children,
            disabled: child.props.disabled || false,
            className: child.props.className || ''
        }));

    // Find the currently selected option
    const selectedOption = options.find(opt => String(opt.value) === String(value));
    const displayLabel = selectedOption ? selectedOption.label : placeholder;

    // Handle click outside to close the dropdown
    useEffect(() => {
        function handleClickOutside(event) {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    // Check space below container to open upward if needed
    useEffect(() => {
        if (isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            // If space below is less than 220px and space above is larger, open upward
            if (spaceBelow < 220 && rect.top > 220) {
                setOpenUpward(true);
            } else {
                setOpenUpward(false);
            }
        }
    }, [isOpen]);

    const handleOptionSelect = (optValue, optDisabled) => {
        if (optDisabled) return;
        setIsOpen(false);
        if (onChange) {
            // Simulate standard HTML change event
            onChange({
                target: {
                    value: optValue
                }
            });
        }
    };

    return (
        <div ref={containerRef} className="relative w-full">
            <button
                type="button"
                disabled={disabled}
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between text-left transition-all ${
                    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                } ${className}`}
            >
                <span className="truncate">{displayLabel}</span>
                <ChevronDown
                    size={16}
                    className={`ml-2 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                    }`}
                />
            </button>

            {isOpen && !disabled && (
                <div 
                    className={`absolute left-0 right-0 z-[100] max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-xl animate-in fade-in duration-150 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 ${
                        openUpward 
                            ? 'bottom-full mb-1.5 slide-in-from-bottom-2' 
                            : 'top-full mt-1.5 slide-in-from-top-2'
                    }`}
                >
                    {options.length === 0 ? (
                        <div className="px-3 py-2 text-xs font-bold text-slate-400 dark:text-slate-500 text-center">
                            No hay opciones disponibles
                        </div>
                    ) : (
                        options.map((opt, idx) => {
                            const isSelected = String(opt.value) === String(value);
                            return (
                                <button
                                    key={idx}
                                    type="button"
                                    disabled={opt.disabled}
                                    onClick={() => handleOptionSelect(opt.value, opt.disabled)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors ${
                                        opt.disabled
                                            ? 'opacity-40 cursor-not-allowed text-slate-400'
                                            : isSelected
                                            ? 'bg-emerald-500 text-white'
                                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}
