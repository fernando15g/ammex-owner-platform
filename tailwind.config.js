/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Ammex ecosystem palette — consistent across calculator + timecard apps
        steel: "#1c2127",
        graphite: "#272d35",
        safety: "#ff6a13",
        concrete: "#f4f3f0",
        rebar: "#9aa3af",
        line: "#39414c",
        ok: "#4a9e63",
        warn: "#e0a63b",
        info: "#2f73d8",
        danger: "#e5533c"
      }
    }
  },
  plugins: []
};
