import { useRef, useCallback } from 'react';

/**
 * Cierra un modal SOLO si el gesto completo (pointerdown → pointerup) empezó
 * y terminó sobre el mismo elemento de fondo (backdrop).
 *
 * Por qué este patrón en vez de medir milisegundos con Date.now():
 *  - Agnóstico al tipo de entrada: funciona igual con `mouse` y con `touch`.
 *    (Las guardas anteriores dependían de onTouchStart/End, que NUNCA disparan
 *     con mouse → el bug solo aparecía en PCs con mouse / control remoto.)
 *  - Inmune a la latencia: no depende de ventanas de tiempo, así que la red
 *    lenta del escritorio remoto ya no rompe el cierre.
 *  - Evita el clic-fantasma al abrir: el clic que abre el modal nunca hizo
 *    pointerdown sobre el backdrop (no existía aún), así que no puede cerrarlo.
 *  - Evita cierres accidentales al arrastrar fuera del contenido.
 *
 * Uso: <div {...useBackdropClose(onClose)} >  ...contenido...  </div>
 * El contenido interno NO necesita stopPropagation: el chequeo
 * `target === currentTarget` ya ignora cualquier clic que venga de un hijo.
 */
export function useBackdropClose(onClose) {
    const downOnBackdrop = useRef(false);

    const onPointerDown = useCallback((e) => {
        // Solo cuenta si el gesto NACE directamente sobre el fondo.
        downOnBackdrop.current = e.target === e.currentTarget;
    }, []);

    const onPointerUp = useCallback((e) => {
        const shouldClose = downOnBackdrop.current && e.target === e.currentTarget;
        downOnBackdrop.current = false;
        if (shouldClose) onClose?.();
    }, [onClose]);

    return { onPointerDown, onPointerUp };
}
