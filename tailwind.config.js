/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b0b0d',
        navy: '#101013',
        panel: '#151619',
        panel2: '#1e2025',
        line: '#26282f',
        accent: '#2f7bff',
        electric: '#2f7bff',
        cy: '#57c7ff',
        leaf: '#4ade80',
        mute: '#9a9ba4',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 18px 50px rgba(0,0,0,0.55)',
        card: '0 8px 28px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.05)',
        lift: '0 14px 36px rgba(0,0,0,0.5)',
        glow: '0 10px 30px rgba(47,123,255,0.32)',
      },
    },
  },
  plugins: [],
};
