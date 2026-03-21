/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e6f2ef',
          100: '#b3d9d0',
          200: '#80c0b1',
          300: '#4da792',
          400: '#268e7a',
          500: '#085041',
          600: '#074a3b',
          700: '#063d31',
          800: '#052f26',
          900: '#03221c',
        },
        gold: {
          50: '#faf6eb',
          100: '#f0e5c2',
          200: '#e5d499',
          300: '#dbc370',
          400: '#d1b35c',
          500: '#C9A84C',
          600: '#b59643',
          700: '#967c38',
          800: '#78632d',
          900: '#5a4a22',
        },
      },
    },
  },
  plugins: [],
};
