import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#f5f6f8',
          1: '#ffffff',
          2: '#f0f1f3',
          3: '#e8eaed',
          hover: '#f7f8f9',
        },
        border: {
          DEFAULT: '#e0e2e6',
          subtle: '#eceef1',
        },
        text: {
          primary: '#1a1d21',
          secondary: '#4a5057',
          tertiary: '#8b9098',
        },
        accent: {
          DEFAULT: '#006fff',
          hover: '#0060e0',
          subtle: 'rgba(0, 111, 255, 0.06)',
          muted: 'rgba(0, 111, 255, 0.12)',
        },
        success: {
          DEFAULT: '#0f9960',
          subtle: 'rgba(15, 153, 96, 0.08)',
        },
        warning: {
          DEFAULT: '#d97706',
          subtle: 'rgba(217, 119, 6, 0.08)',
        },
        danger: {
          DEFAULT: '#dc2626',
          subtle: 'rgba(220, 38, 38, 0.06)',
        },
      },
    },
  },
  plugins: [],
}

export default config
