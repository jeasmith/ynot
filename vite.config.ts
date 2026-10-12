import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite-plus';
import { previewHeadersFrom, type VercelConfig } from './scripts/vercelHeaders.ts';

const vercel = JSON.parse(
  readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'),
) as VercelConfig;

// Agent tooling, specs and prose are not formatted or linted by `vp check`.
const nonCodeIgnores = [
  '.agents/**',
  '.claude/**',
  '.codex/**',
  '.cursor/**',
  '.opal/**',
  'docs/**',
  '**/*.md',
  'skills-lock.json',
];

const storageNames = ['localStorage', 'sessionStorage', 'indexedDB', 'caches'];
const storageMessage =
  'Browser storage is banned (Req 1.3). Only src/session/patStorage.ts may touch localStorage.';
const restrictedStorageGlobals = storageNames.map((name) => ({ name, message: storageMessage }));
// The globals rule only sees bare identifiers, so also ban reaching storage through these objects.
const restrictedStorageProperties = ['window', 'globalThis', 'self'].flatMap((object) =>
  storageNames.map((property) => ({ object, property, message: storageMessage })),
);

export default defineConfig({
  build: {
    // No inline polyfill script and no data: URIs, so the build runs under the strict CSP.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
  // `vp preview` serves the production CSP and security headers from vercel.json.
  preview: {
    headers: previewHeadersFrom(vercel),
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
  fmt: {
    singleQuote: true,
    ignorePatterns: [
      ...nonCodeIgnores,
      'dist/**',
      'openapi/**',
      'src/ynab/openapi.generated.ts',
      'pnpm-lock.yaml',
    ],
  },
  lint: {
    ignorePatterns: [...nonCodeIgnores, 'dist/**', 'src/ynab/openapi.generated.ts'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      {
        files: ['src/**'],
        rules: {
          'no-console': 'error',
          'no-restricted-globals': ['error', ...restrictedStorageGlobals],
          'no-restricted-properties': ['error', ...restrictedStorageProperties],
        },
      },
      {
        // The one module allowed to store a Remembered PAT (ADR 0006).
        files: ['src/session/patStorage.ts', 'src/session/patStorage.test.ts'],
        rules: {
          'no-restricted-globals': [
            'error',
            ...restrictedStorageGlobals.filter(({ name }) => name !== 'localStorage'),
          ],
          'no-restricted-properties': [
            'error',
            ...restrictedStorageProperties.filter(({ property }) => property !== 'localStorage'),
          ],
        },
      },
    ],
  },
  staged: {
    '*.{js,ts,tsx,css,json}': 'vp check --fix',
  },
});
