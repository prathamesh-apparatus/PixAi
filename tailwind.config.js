/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#140d08',
        navy: '#1a110a',
        panel: '#211710',
        panel2: '#2c1e12',
        line: '#402d1d',
        accent: '#ff8a3c',
        electric: '#ff8a3c',
        cy: '#ffb020',
        leaf: '#4ade80',
        mute: '#b09a86',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 18px 50px rgba(0,0,0,0.55)',
        card: '0 8px 28px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,190,120,0.07)',
        lift: '0 14px 36px rgba(0,0,0,0.5)',
        glow: '0 10px 30px rgba(255,138,60,0.35)',
      },
    },
  },
  plugins: [],
};
