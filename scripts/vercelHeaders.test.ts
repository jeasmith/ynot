import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { previewHeadersFrom, type VercelConfig } from './vercelHeaders.ts';

const vercel = JSON.parse(
  readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
) as VercelConfig;

describe('previewHeadersFrom', () => {
  it('flattens the catch-all header block into a name to value record', () => {
    const headers = previewHeadersFrom({
      headers: [
        {
          source: '/(.*)',
          headers: [
            { key: 'X-A', value: '1' },
            { key: 'X-B', value: '2' },
          ],
        },
        { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'immutable' }] },
      ],
    });
    expect(headers).toEqual({ 'X-A': '1', 'X-B': '2' });
  });

  it('returns nothing when there is no catch-all block', () => {
    expect(previewHeadersFrom({ headers: [] })).toEqual({});
    expect(previewHeadersFrom({})).toEqual({});
  });
});

describe('vercel.json deployment headers (Req 1.7, 1.8, 1.9)', () => {
  const headers = previewHeadersFrom(vercel);
  const csp = headers['Content-Security-Policy'] ?? '';
  const directives = new Map(
    csp.split(';').map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values] as const;
    }),
  );

  it('forwards the catch-all security headers to the preview server', () => {
    expect(Object.keys(headers).sort()).toEqual(
      [
        'Content-Security-Policy',
        'Cross-Origin-Opener-Policy',
        'Permissions-Policy',
        'Referrer-Policy',
        'Strict-Transport-Security',
        'X-Content-Type-Options',
        'X-Frame-Options',
      ].sort(),
    );
  });

  it('is fail-closed: default-src none and no unsafe sources', () => {
    expect(directives.get('default-src')).toEqual(["'none'"]);
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|data:|blob:|\*/);
  });

  it('allows scripts and styles only from self, and network only to api.ynab.com', () => {
    expect(directives.get('script-src')).toEqual(["'self'"]);
    expect(directives.get('style-src')).toEqual(["'self'"]);
    expect(directives.get('connect-src')).toEqual(['https://api.ynab.com']);
  });

  it('forbids framing, plugins, forms and base URIs', () => {
    expect(directives.get('frame-ancestors')).toEqual(["'none'"]);
    expect(directives.get('object-src')).toEqual(["'none'"]);
    expect(directives.get('form-action')).toEqual(["'none'"]);
    expect(directives.get('base-uri')).toEqual(["'none'"]);
  });

  it('keeps the SPA rewrite and long-lived caching for hashed assets only', () => {
    expect(vercel.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }]);
    const cache = (vercel.headers ?? []).filter((h) =>
      h.headers.some((x) => x.key === 'Cache-Control'),
    );
    expect(cache.map((h) => h.source)).toEqual(['/assets/(.*)', '/index.html']);
  });
});
