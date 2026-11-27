/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#08080d',
        navy: '#0e0e15',
        panel: '#14141e',
        panel2: '#1c1c29',
        line: '#262636',
        accent: '#7c6cff',
        electric: '#7c6cff',
        cy: '#a78bfa',
        mute: '#9797a8',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 18px 50px rgba(0,0,0,0.5)',
        card: '0 8px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
        lift: '0 14px 36px rgba(0,0,0,0.45)',
        glow: '0 10px 30px rgba(124,108,255,0.35)',
      },
    },
  },
  plugins: [],
};
