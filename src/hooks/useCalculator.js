import { useState, useMemo, useCallback } from 'react';

import { CurrencyService } from '../services/CurrencyService'; // [NEW]

export function useCalculator(rates) {
  const [amountTop, setAmountTop] = useState('');
  const [amountBot, setAmountBot] = useState('');
  const [from, setFrom] = useState('BCV');
  const [to, setTo] = useState('VES');
  const [lastEdited, setLastEdited] = useState('top');

  const currencies = [
    { id: 'VES', label: 'Bs.', icon: '🇻🇪', rate: 1 },
    { id: 'BCV', label: 'USD', icon: '💵', rate: rates.bcv.price },
    { id: 'EUR', label: 'Euro', icon: '💶', rate: rates.euro.price },
  ];

  // --- LÓGICA DE CONVERSIÓN (Derivada durante render, sin efecto) ---
  const rateFrom = currencies.find(c => c.id === from)?.rate || 0;
  const rateTo = currencies.find(c => c.id === to)?.rate || 0;

  const derivedAmountBot = useMemo(() => {
    if (lastEdited !== 'top' || rateTo === 0 || rateFrom === 0) return null;
    if (!amountTop) return '';
    const res = CurrencyService.calculateExchange(CurrencyService.safeParse(amountTop), rateFrom, rateTo);
    return CurrencyService.applyRoundingRule(res, to);
  }, [amountTop, from, to, rates, lastEdited, rateFrom, rateTo]);

  const derivedAmountTop = useMemo(() => {
    if (lastEdited !== 'bot' || rateTo === 0 || rateFrom === 0) return null;
    if (!amountBot) return '';
    const res = CurrencyService.calculateExchange(CurrencyService.safeParse(amountBot), rateTo, rateFrom);
    return CurrencyService.applyRoundingRule(res, from);
  }, [amountBot, from, to, rates, lastEdited, rateFrom, rateTo]);

  const displayAmountTop = lastEdited === 'bot' && derivedAmountTop !== null ? derivedAmountTop : amountTop;
  const displayAmountBot = lastEdited === 'top' && derivedAmountBot !== null ? derivedAmountBot : amountBot;

  // --- HANDLERS ---
  const handleAmountChange = useCallback((val, source) => {
    const currentCurrency = source === 'top' ? from : to;
    // Validación: Si es VES solo enteros, si no, decimales
    const isValid = currentCurrency === 'VES'
      ? /^\d*$/.test(val)
      : /^\d*\.?\d{0,2}$/.test(val.replace(/,/g, '.'));

    if (isValid) {
      if (source === 'top') { setAmountTop(val); setLastEdited('top'); }
      else { setAmountBot(val); setLastEdited('bot'); }
    }
  }, [from, to]);

  const handleSwap = useCallback(() => {
    setFrom(to);
    setTo(from);
    setAmountTop(amountBot);
    setLastEdited('top');
  }, [from, to, amountBot]);

  const handleQuickAdd = useCallback((val) => {
    const current = CurrencyService.safeParse(amountTop);
    const newVal = current + val;
    // Aplicar redondeo si la moneda origen es VES
    const finalVal = from === 'VES' ? Math.ceil(newVal).toString() : newVal.toFixed(0);
    setAmountTop(finalVal);
    setLastEdited('top');
  }, [amountTop, from]);

  const clear = useCallback(() => { setAmountTop(''); setAmountBot(''); }, []);

  return {
    amountTop: displayAmountTop, amountBot: displayAmountBot, from, to, currencies,
    setFrom, setTo,
    handleAmountChange, handleSwap, handleQuickAdd, clear,
    safeParse: CurrencyService.safeParse // Exportamos para usar en utilidades
  };
}
