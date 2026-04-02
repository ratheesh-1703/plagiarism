import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        slateNight: "#0D1B2A",
        aquaMist: "#E0FBFC",
        coral: "#EE6C4D",
        petrol: "#005F73",
        gold: "#FFB703",
      },
    },
  },
  plugins: [],
};

export default config;
