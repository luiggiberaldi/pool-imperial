import path from 'node:path';

export async function resolve(specifier, context, nextResolve) {
    try {
        return await nextResolve(specifier, context);
    } catch (error) {
        if (!specifier.startsWith('.') || path.extname(specifier)) throw error;
        for (const extension of ['.js', '.jsx']) {
            try {
                return await nextResolve(`${specifier}${extension}`, context);
            } catch {
                // Probar la siguiente extensión.
            }
        }
        throw error;
    }
}
