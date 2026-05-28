import React, { useState, useEffect } from 'react';
import { Delete, CheckCircle } from 'lucide-react';

export default function PinPad({ onSubmit, onCancel, errorMsg }) {
    const [pin, setPin] = useState('');

    // Handle physical keyboard input
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (/^[0-9]$/.test(e.key) && pin.length < 4) {
                setPin(prev => prev + e.key);
            } else if (e.key === 'Backspace') {
                setPin(prev => prev.slice(0, -1));
            } else if (e.key === 'Enter' && pin.length === 4) {
                onSubmit(pin);
            } else if (e.key === 'Escape' && onCancel) {
                onCancel();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [pin, onSubmit, onCancel]);

    // Auto submit when 4 digits are reached
    useEffect(() => {
        if (pin.length === 4) {
            onSubmit(pin);
            // Brief visual feedback before reset, or clearing happens via parent
        }
    }, [pin, onSubmit]);

    const handleNumClick = (num) => {
        if (pin.length < 4) {
            setPin(prev => prev + num);
        }
    };

    const handleDelete = () => {
        setPin(prev => prev.slice(0, -1));
    };

    const renderDots = () => {
        const dots = [];
        for (let i = 0; i < 4; i++) {
            dots.push(
                <div 
                    key={i} 
                    className={`w-4 h-4 rounded-full transition-all duration-200 ${
                        i < pin.length 
                            ? 'bg-sky-500 scale-110 shadow-[0_0_10px_rgba(14,165,233,0.5)]' 
                            : 'bg-slate-200 border-2 border-slate-300'
                    }`}
                />
            );
        }
        return dots;
    };

    return (
        <div className="w-full max-w-xs mx-auto flex flex-col items-center">
            {/* PIN Display */}
            <div className="flex gap-4 mb-6">
                {renderDots()}
            </div>
            
            {errorMsg && (
                <p className="text-rose-500 text-sm font-medium mb-4 animate-shake">
                    {errorMsg}
                </p>
            )}

            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-3 w-full">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                    <button
                        key={num}
                        onClick={() => handleNumClick(num.toString())}
                        className="h-16 rounded-2xl bg-white shadow-sm border border-slate-200 text-2xl font-semibold text-slate-700 hover:bg-slate-50 hover:border-sky-300 active:scale-95 transition-all"
                    >
                        {num}
                    </button>
                ))}
                
                {onCancel ? (
                    <button
                        onClick={onCancel}
                        className="h-16 rounded-2xl bg-slate-100 text-sm font-semibold text-slate-500 hover:bg-slate-200 active:scale-95 transition-all"
                    >
                        Cancelar
                    </button>
                ) : (
                    <div></div>
                )}
                
                <button
                    onClick={() => handleNumClick('0')}
                    className="h-16 rounded-2xl bg-white shadow-sm border border-slate-200 text-2xl font-semibold text-slate-700 hover:bg-slate-50 hover:border-sky-300 active:scale-95 transition-all"
                >
                    0
                </button>
                
                <button
                    onClick={handleDelete}
                    className="h-16 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 hover:text-rose-500 active:scale-95 transition-all"
                >
                    <Delete className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
}
