import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#05070d",
        panel: "#0b1020",
        cyan: "#22d3ee",
        pink: "#ec4899",
        green: "#39ff88",
      },
    },
  },
  plugins: [],
}

export default config
