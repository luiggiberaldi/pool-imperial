/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {

        // ─────────────────────────────────────────────────────
        // 🎨 Pool Imperial — PALETA SEMÁNTICA OFICIAL
        // Extraída del color oro del logo y marco de bronce de las mesas
        // ─────────────────────────────────────────────────────

        // 1. LA MARCA (Acción, Foco, Botones principales)
        primary: {
          DEFAULT: '#d97706', // Amber-600 — dorado insignia del logo
          hover:   '#b45309', // Amber-700 — hover states
          light:   '#fef3c7', // Amber-100 — fondos suaves, badges
          focus:   '#fde68a', // Amber-200 — anillo de foco en inputs
          dark:    '#78350f', // Amber-900 — pressed/active states
        },

        // 2. FONDOS DE PANTALLA
        app: {
          light: '#F8FAFC', // Gris Hielo — fondo general
          dark:  '#0F172A', // Azul Noche — modo oscuro (alias, no activo)
        },

        // 3. FONDOS DE TARJETAS / MODALES / SIDEBAR
        surface: {
          light: '#FFFFFF', // Blanco Puro
          dark:  '#1E293B', // Slate-800 modo oscuro
        },

        // 4. TEXTOS (Legibilidad)
        content: {
          main:      '#334155', // Slate-700 — Títulos, precios
          secondary: '#64748B', // Slate-500 — Subtítulos, etiquetas
          inverse:   '#F8FAFC', // Texto claro para fondos oscuros
        },

        // 5. ESTADOS SEMÁNTICOS
        status: {
          success:   '#10B981', // Emerald-500 — Venta OK
          successBg: '#D1FAE5', // Emerald-100
          danger:    '#F43F5E', // Rose-500 — Error, borrar, anular
          dangerBg:  '#FFE4E6', // Rose-100
          warning:   '#F59E0B', // Amber-500 — Alerta
          warningBg: '#FEF3C7', // Amber-100
        },

        // 6. BORDES Y SEPARADORES
        border: {
          subtle: '#E2E8F0', // Slate-200 — líneas finas
          focus:  '#d97706', // Amber-600 — borde activo en inputs
        },

        // ─────────────────────────────────────────────────────
        // 🔄 ALIASES RETROACTIVOS (Compatibilidad con código existente)
        // Redirigen las clases viejas al nuevo sistema semántico.
        // Efecto visual: toda la app cambia automáticamente.
        // ─────────────────────────────────────────────────────

        // brand (viejo token de color primario)
        brand: {
          light:   '#fef3c7',
          DEFAULT: '#d97706',
          dark:    '#b45309',
        },

        // background (viejo token de fondo)
        background: {
          light: '#F8FAFC',
          dark:  '#0F172A',
        },

        // blue → amber (todo bg-blue-* se vuelve amber/gold automáticamente)
        blue: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },

        // indigo → amber (compatibilidad con CloudAuthModal, spinner, etc)
        indigo: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },

        // purple → amber (activos de nav, badges)
        purple: {
          50:  '#fffbeb',
          100: '#fef3c7',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },

        // slate (neutros — sin cambios, son la base del sistema)
        slate: {
          50:  '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
          950: '#020617',
        },

        // emerald → success (ventas OK, stock disponible)
        emerald: {
          50:  '#ECFDF5',
          100: '#D1FAE5',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          900: '#064E3B',
        },

        // red → danger (errores, borrar)
        red: {
          50:  '#FFF1F2',
          100: '#FFE4E6',
          400: '#FB7185',
          500: '#F43F5E',
          600: '#E11D48',
          900: '#881337',
        },

        // amber → warning (alertas)
        amber: {
          50:  '#FFFBEB',
          100: '#FEF3C7',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          900: '#78350F',
        },
      },

      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },

      animation: {
        'fade-in':   'fadeIn 0.3s ease-out',
        'slide-up':  'slideUp 0.4s ease-out',
        'spin-slow': 'spin 1s linear infinite',
      },

      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        // Tabular nums para precios y tablas financieras
        '.font-numbers': {
          'font-variant-numeric': 'tabular-nums',
          'letter-spacing': '-0.02em',
        },
        // Ocultar scrollbar
        '.scrollbar-hide': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        },
        // Scrollbar personalizado fino
        '.custom-scrollbar': {
          '&::-webkit-scrollbar': { width: '4px', height: '4px' },
          '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: '#CBD5E1',
            borderRadius: '2px',
          },
        },
      });
    },
  ],
}