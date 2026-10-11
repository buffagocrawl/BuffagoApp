// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/**', '.expo/**', 'output/**', '.tmp/**'],
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs}', 'tests/**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
]);
