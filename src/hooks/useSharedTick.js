import { useEffect, useState } from 'react';

let listeners = new Set();
let intervalId = null;
let currentTick = Date.now();

function subscribe(listener) {
    listeners.add(listener);
    if (!intervalId) {
        intervalId = setInterval(() => {
            currentTick = Date.now();
            listeners.forEach(l => l(currentTick));
        }, 1000);
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    };
}

export function useSharedTick() {
    const [tick, setTick] = useState(currentTick);

    useEffect(() => {
        return subscribe(t => setTick(t));
    }, []);

    return tick;
}
