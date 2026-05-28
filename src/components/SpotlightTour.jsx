import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export default function SpotlightTour({ steps, onComplete, onSkip }) {
    const [currentStep, setCurrentStep] = useState(0);
    const [rect, setRect] = useState(null);

    useEffect(() => {
        setCurrentStep(0);
    }, [steps]);

    useEffect(() => {
        const updateRect = () => {
            const targetSelector = steps[currentStep]?.target;
            if (!targetSelector) {
                setRect('center');
                return;
            }
            const el = document.querySelector(targetSelector);
            if (el) {
                const r = el.getBoundingClientRect();
                setRect(r);
            } else {
                setRect('center');
            }
        };

        const t = setTimeout(updateRect, 300);
        window.addEventListener('resize', updateRect);

        return () => {
            clearTimeout(t);
            window.removeEventListener('resize', updateRect);
        };
    }, [currentStep, steps]);

    if (!rect) return null;

    const isCenter = rect === 'center';
    const step = steps[currentStep];
    const isLast = currentStep === steps.length - 1;

    const handleNext = () => {
        if (!isLast) setCurrentStep(c => c + 1);
        else onComplete && onComplete();
    };

    const handleSkip = () => {
        (onSkip || onComplete)?.();
    };

    return (
        <div className="fixed inset-0 z-[9999] pointer-events-none animate-in fade-in duration-500">
            {/* Dark overlay with spotlight hole */}
            <div
                className="absolute w-full h-full pointer-events-auto transition-all duration-500 ease-in-out"
                onClick={isCenter ? undefined : handleNext}
                style={{
                    clipPath: isCenter
                        ? `polygon(0% 0%, 0% 100%, 0% 100%, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 100%, 100% 100%, 100% 0%)`
                        : `polygon(0% 0%, 0% 100%, ${rect.left - 8}px 100%, ${rect.left - 8}px ${rect.top - 8}px, ${rect.right + 8}px ${rect.top - 8}px, ${rect.right + 8}px ${rect.bottom + 8}px, ${rect.left - 8}px ${rect.bottom + 8}px, ${rect.left - 8}px 100%, 100% 100%, 100% 0%)`,
                    backgroundColor: 'rgba(15, 23, 42, 0.80)',
                    backdropFilter: 'blur(4px)'
                }}
            />

            {/* Spotlight border glow */}
            {!isCenter && (
                <div
                    className="absolute rounded-xl border-2 border-emerald-400/60 shadow-[0_0_20px_rgba(52,211,153,0.4)] pointer-events-none transition-all duration-500"
                    style={{
                        top: rect.top - 8,
                        left: rect.left - 8,
                        width: rect.width + 16,
                        height: rect.height + 16,
                    }}
                />
            )}

            {/* Popover card */}
            <div
                className={`absolute z-10 bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-2xl border border-slate-100 dark:border-slate-800 w-[calc(100vw-32px)] max-w-xs pointer-events-auto transition-all duration-500 ease-out ${isCenter ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' : ''}`}
                style={isCenter ? {} : {
                    top: rect.bottom + 20 > window.innerHeight - 180
                        ? Math.max(8, rect.top - 180 - 20)
                        : rect.bottom + 20,
                    left: Math.max(16, Math.min(rect.left + (rect.width / 2) - 144, window.innerWidth - 304)),
                }}
            >
                {/* Step counter badge */}
                <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black text-sm shadow-lg shadow-emerald-500/40">
                    {currentStep + 1}
                </div>

                {/* Skip button */}
                <button
                    onClick={handleSkip}
                    className="absolute top-3 right-3 w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors"
                    aria-label="Saltar tour"
                >
                    <X size={14} />
                </button>

                {/* Emoji (for welcome steps) */}
                {step.emoji && (
                    <div className="text-3xl mb-3 ml-4">{step.emoji}</div>
                )}

                <h3 className="font-black text-lg text-slate-800 dark:text-white mb-2 ml-4 pr-6 tracking-tight leading-tight">
                    {step.title}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
                    {step.text}
                </p>

                <div className="flex justify-between items-center">
                    {/* Progress dots */}
                    <div className="flex gap-1">
                        {steps.map((_, i) => (
                            <div
                                key={i}
                                className={`h-1.5 rounded-full transition-all duration-300 ${i === currentStep ? 'w-4 bg-emerald-500' : i < currentStep ? 'w-1.5 bg-emerald-200' : 'w-1.5 bg-slate-200 dark:bg-slate-700'}`}
                            />
                        ))}
                    </div>

                    {/* Next / Finish button */}
                    <button
                        onClick={handleNext}
                        className="bg-emerald-500 hover:bg-emerald-400 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                    >
                        {isLast ? '¡Empezar!' : 'Siguiente →'}
                    </button>
                </div>
            </div>
        </div>
    );
}
