/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b0e17',
        navy: '#101527',
        panel: '#151b30',
        panel2: '#1a2138',
        line: '#26304d',
        accent: '#7c5cff',
        electric: '#3b82f6',
        cy: '#22d3ee',
        mute: '#8b94ad',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 8px 30px rgba(0,0,0,0.35)',
        card: '0 2px 12px rgba(0,0,0,0.25)',
      },
    },
  },
  plugins: [],
};
