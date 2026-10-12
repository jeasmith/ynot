/**
 * Reads the header rules in `vercel.json` for local servers (`vp preview`, and the
 * Playwright static server if one is ever needed), so local runs use the production CSP.
 */

export interface VercelHeaderRule {
  readonly source: string;
  readonly headers: readonly { readonly key: string; readonly value: string }[];
}

export interface VercelConfig {
  readonly rewrites?: readonly { readonly source: string; readonly destination: string }[];
  readonly headers?: readonly VercelHeaderRule[];
}

/** The `source` that matches every path in `vercel.json`. */
export const CATCH_ALL_SOURCE = '/(.*)';

/**
 * Headers from the catch-all rule as a flat record. `preview.headers` applies to every
 * response, so path-specific rules (such as the asset `Cache-Control`) are not forwarded.
 */
export function previewHeadersFrom(config: VercelConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const rule of config.headers ?? []) {
    if (rule.source !== CATCH_ALL_SOURCE) continue;
    for (const { key, value } of rule.headers) headers[key] = value;
  }
  return headers;
}
