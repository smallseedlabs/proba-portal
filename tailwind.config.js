/** @type {import('tailwindcss').Config} */
const token = (name) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1440px',
    },
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      // Type scale (size / line-height). Body copy is 14px, the enterprise default.
      fontSize: {
        caption: ['0.75rem', { lineHeight: '1rem' }],
        body: ['0.875rem', { lineHeight: '1.25rem' }],
        lead: ['1rem', { lineHeight: '1.5rem' }],
        title: ['1.125rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        heading: ['1.5rem', { lineHeight: '2rem', fontWeight: '600', letterSpacing: '-0.01em' }],
        display: ['2.25rem', { lineHeight: '2.75rem', fontWeight: '600', letterSpacing: '-0.02em' }],
      },
      colors: {
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
        background: token('background'),
        foreground: token('foreground'),
        surface: {
          DEFAULT: token('surface'),
          raised: token('surface-raised'),
          sunken: token('surface-sunken'),
        },
        primary: {
          DEFAULT: token('primary'),
          hover: token('primary-hover'),
          subtle: token('primary-subtle'),
          foreground: token('primary-foreground'),
        },
        secondary: {
          DEFAULT: token('secondary'),
          foreground: token('secondary-foreground'),
        },
        muted: {
          DEFAULT: token('muted'),
          foreground: token('muted-foreground'),
        },
        accent: {
          DEFAULT: token('accent'),
          foreground: token('accent-foreground'),
        },
        card: {
          DEFAULT: token('card'),
          foreground: token('card-foreground'),
        },
        destructive: {
          DEFAULT: token('danger'),
          hover: token('danger-hover'),
          subtle: token('danger-subtle'),
          foreground: token('danger-foreground'),
        },
        success: {
          DEFAULT: token('success'),
          subtle: token('success-subtle'),
          foreground: token('success-foreground'),
        },
        warning: {
          DEFAULT: token('warning'),
          subtle: token('warning-subtle'),
          foreground: token('warning-foreground'),
        },
        info: {
          DEFAULT: token('info'),
          subtle: token('info-subtle'),
          foreground: token('info-foreground'),
        },
        sidebar: {
          DEFAULT: token('sidebar'),
          foreground: token('sidebar-foreground'),
          muted: token('sidebar-muted'),
          active: token('sidebar-active'),
          border: token('sidebar-border'),
        },
        chart: {
          1: token('chart-1'),
          2: token('chart-2'),
          grid: token('chart-grid'),
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.05), 0 1px 3px 0 rgb(15 23 42 / 0.04)',
        overlay: '0 10px 30px -10px rgb(15 23 42 / 0.25), 0 4px 10px -6px rgb(15 23 42 / 0.12)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-up': 'slide-up 180ms ease-out',
      },
    },
  },
  plugins: [],
};
