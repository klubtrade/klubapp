module.exports = {
  root: true,
  extends: ["next/core-web-vitals"],
  plugins: ["@typescript-eslint"],
  rules: {
    "@next/next/no-html-link-for-pages": "off",
  },
  ignorePatterns: [
    "**/dist/**",
    "**/.next/**",
    "**/coverage/**",
    "**/node_modules/**",
    "deck/**",
  ],
};
