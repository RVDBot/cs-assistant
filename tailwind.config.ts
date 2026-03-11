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
        whatsapp: {
          teal: '#00a884',
          dark: '#111b21',
          panel: '#202c33',
          bubble: '#005c4b',
          received: '#202c33',
          input: '#2a3942',
          border: '#2a3942',
          text: '#e9edef',
          muted: '#8696a0',
        },
      },
    },
  },
  plugins: [],
}

export default config
