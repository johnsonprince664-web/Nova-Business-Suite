/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        legacy: {
          50: "#eff9fb",
          100: "#d7f0f5",
          200: "#b4e2ea",
          300: "#7fcedb",
          400: "#43b1c4",
          500: "#278fa7",
          600: "#22748a",
          700: "#215e70",
          800: "#214f5d",
          900: "#1f434f",
          950: "#0d2b36"
        },
        gold: {
          50: "#fffbeb",
          100: "#fff3c6",
          200: "#ffe588",
          300: "#ffd04a",
          400: "#f7b925",
          500: "#dc9710",
          600: "#bd740b",
          700: "#98530d",
          800: "#7d4212",
          900: "#693712"
        }
      },
      boxShadow: {
        soft: "0 18px 60px rgba(15, 45, 58, 0.10)",
        glow: "0 15px 40px rgba(39, 143, 167, 0.22)"
      },
      backgroundImage: {
        "legacy-gradient": "linear-gradient(135deg, #0d2b36 0%, #144c5c 55%, #278fa7 100%)"
      }
    }
  },
  plugins: []
};
