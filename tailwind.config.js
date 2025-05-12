// tailwind.config.js

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html", // Scans your main HTML file
    "./src/**/*.{js,ts,jsx,tsx}", // Scans all JavaScript, TypeScript, JSX, and TSX files within the src folder
  ],
  theme: {
    extend: {
      // You can add your custom theme extensions here if needed.
      // For example:
      // colors: {
      //   'brand-blue': '#1992d4',
      // },
      // fontFamily: {
      //   sans: ['Inter var', 'system-ui', ...],
      // },
    },
  },
  plugins: [
    // You can add any Tailwind CSS plugins here if you use them.
    // For example:
    // require('@tailwindcss/forms'),
    // require('@tailwindcss/typography'),
  ],
}