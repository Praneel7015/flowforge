/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        flowforge: {
          orange: '#fc6d26',
          purple: '#6b4fbb',
          dark: '#171321',
        },
      },
    },
  },
  plugins: [],
};
