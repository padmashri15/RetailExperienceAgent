import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/client/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        cloud: "#F5F7FB",
        graphite: "#5E687C",
        pine: "#1D6B57",
        coral: "#D7634F",
        iris: "#5867B3",
        saffron: "#C8962E"
      },
      boxShadow: {
        panel: "0 18px 50px rgba(23, 32, 51, 0.08)"
      }
    }
  },
  plugins: []
} satisfies Config;
