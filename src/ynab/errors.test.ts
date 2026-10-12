import { describe, expect, it } from 'vite-plus/test';
import { abortFailure, classifyResponse, YnabError, ynabFailureOf } from './errors.ts';

const body = (id: string, name: string, detail: string) => ({ error: { id, name, detail } });

describe('classifyResponse', () => {
  it('maps 401 to unauthorized', () => {
    expect(classifyResponse(401, body('401', 'unauthorized', 'Unauthorized'))).toEqual({
      kind: 'unauthorized',
    });
  });

  it('maps 403 to forbidden and keeps the error id (data_limit_reached)', () => {
    expect(classifyResponse(403, body('403.1', 'subscription_lapsed', 'x'))).toEqual({
      kind: 'forbidden',
      id: '403.1',
    });
    expect(classifyResponse(403, body('403.2', 'trial_expired', 'x'))).toEqual({
      kind: 'forbidden',
      id: '403.2',
    });
    expect(classifyResponse(403, body('403.4', 'data_limit_reached', 'x'))).toEqual({
      kind: 'forbidden',
      id: '403.4',
    });
  });

  it('maps 403 without a readable body to forbidden with no id', () => {
    expect(classifyResponse(403, null)).toEqual({ kind: 'forbidden' });
    expect(classifyResponse(403, 'nope')).toEqual({ kind: 'forbidden' });
  });

  it('maps 404 to notFound', () => {
    expect(classifyResponse(404, body('404.2', 'resource_not_found', 'x'))).toEqual({
      kind: 'notFound',
    });
  });

  it('maps 400 to rejected and carries the detail', () => {
    expect(classifyResponse(400, body('400', 'bad_request', 'memo is too long'))).toEqual({
      kind: 'rejected',
      detail: 'memo is too long',
    });
  });

  it('gives a rejected failure a detail even when the body is unreadable', () => {
    const f = classifyResponse(400, undefined);
    expect(f.kind).toBe('rejected');
    expect(f.kind === 'rejected' && f.detail.length).toBeGreaterThan(0);
  });

  it('maps 429 to rateLimited', () => {
    expect(classifyResponse(429, body('429', 'too_many_requests', 'x'))).toEqual({
      kind: 'rateLimited',
    });
  });

  it('maps 5xx to server with the status', () => {
    expect(classifyResponse(500, null)).toEqual({ kind: 'server', status: 500 });
    expect(classifyResponse(503, null)).toEqual({ kind: 'server', status: 503 });
  });

  it('treats any other non-success status as rejected, never as success', () => {
    expect(classifyResponse(409, body('409', 'conflict', 'duplicate')).kind).toBe('rejected');
    expect(classifyResponse(302, null).kind).toBe('rejected');
  });
});

describe('abortFailure', () => {
  const timeoutReason = { private: 'timeout' };

  it('maps only the private timeout reason to timeout', () => {
    expect(abortFailure(timeoutReason, timeoutReason)).toEqual({ kind: 'timeout' });
  });

  it('maps every other reason to cancelled', () => {
    expect(abortFailure(new DOMException('x', 'AbortError'), timeoutReason)).toEqual({
      kind: 'cancelled',
    });
    expect(abortFailure(new DOMException('x', 'TimeoutError'), timeoutReason)).toEqual({
      kind: 'cancelled',
    });
    expect(abortFailure(undefined, timeoutReason)).toEqual({ kind: 'cancelled' });
    expect(abortFailure({ private: 'timeout' }, timeoutReason)).toEqual({ kind: 'cancelled' });
  });
});

describe('YnabError', () => {
  it('carries the failure and is recognised by ynabFailureOf', () => {
    const e = new YnabError({ kind: 'rateLimited' });
    expect(e).toBeInstanceOf(Error);
    expect(e.failure).toEqual({ kind: 'rateLimited' });
    expect(ynabFailureOf(e)).toEqual({ kind: 'rateLimited' });
  });

  it('returns null for any other thrown value', () => {
    expect(ynabFailureOf(new Error('boom'))).toBeNull();
    expect(ynabFailureOf('x')).toBeNull();
  });

  it('never puts request details in the message', () => {
    expect(new YnabError({ kind: 'unauthorized' }).message).toBe(
      'YNAB request failed: unauthorized',
    );
  });
});
