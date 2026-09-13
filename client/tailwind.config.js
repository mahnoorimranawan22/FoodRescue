/** @type {import('tailwindcss').Config} */
//
// FoodRescue — Give Good Food Another Chance
// Brand design tokens:
//   • Cream        → warm neutral page/service surfaces
//   • Forest Green → primary brand (trust, sustainability, produce)
//   • Warm Orange  → action/CTA color (energy, warmth, urgency)
//
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  // Class-based dark mode: <html class="dark"> toggled by SettingsContext
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Warm cream neutrals — page background and soft surfaces
        cream: {
          50: "#FAF8F5",
          100: "#F5F0EB",
          200: "#E8DFD5",
        },
        // Forest Green — headings, logo, primary identity
        forest: {
          500: "#2D5A27",
          600: "#1E3F1A",
          700: "#142B12",
        },
        // Warm Orange — CTAs, highlights, accents
        "warm-orange": {
          500: "#E06D3B",
          600: "#C85A28",
        },
        // Night surfaces — deep green-charcoal so brand glows in dark mode
        night: {
          50: "#1C241B",
          100: "#182018",
          200: "#131A12",
          300: "#0F140E",
        },
      },
      fontFamily: {
        // Body / default UI font
        sans: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        // Headings / display font
        heading: [
          "Bricolage Grotesque",
          "Plus Jakarta Sans",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "none" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "none" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "none" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(100%)" },
          to: { opacity: "1", transform: "none" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-14px)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in-slow": "fade-in 0.9s cubic-bezier(0.22, 1, 0.36, 1) both",
        "scale-in": "scale-in 0.3s cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-in-right":
          "slide-in-right 0.35s cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-up": "slide-up 0.35s cubic-bezier(0.22, 1, 0.36, 1) both",
        marquee: "marquee 32s linear infinite",
        "float-slow": "float-slow 7s ease-in-out infinite",
        "pulse-soft": "pulse-soft 2.2s ease-in-out infinite",
      },
      boxShadow: {
        // Soft brand-tinted glows for cards and CTAs
        "forest-glow": "0 10px 30px -12px rgba(45, 90, 39, 0.35)",
        "orange-glow": "0 10px 30px -12px rgba(224, 109, 59, 0.45)",
      },
    },
  },
  plugins: [],
};
