/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/client/pages/**/*.{js,ts,jsx,tsx}', './src/client/components/**/*.{js,ts,jsx,tsx}', './src/client/App.tsx'],
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
}
