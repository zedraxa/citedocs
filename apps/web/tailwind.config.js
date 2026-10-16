/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        docs: {
          blue: "#1a73e8",
          hover: "#f1f3f4",
          border: "#dadce0",
          bg: "#f8f9fa",
        },
      },
      boxShadow: {
        page: "0 1px 3px 1px rgba(60,64,67,.15), 0 1px 2px 0 rgba(60,64,67,.3)",
      },
    },
  },
  plugins: [],
};
