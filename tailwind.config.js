/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b0d11',
        navy: '#10131a',
        panel: '#161a22',
        panel2: '#1e242f',
        line: '#252c3a',
        accent: '#2f7bff',
        electric: '#2f7bff',
        cy: '#57c7ff',
        mute: '#8b94a7',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 18px 50px rgba(0,0,0,0.45)',
        card: '0 6px 24px rgba(0,0,0,0.28)',
        lift: '0 12px 32px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
};
