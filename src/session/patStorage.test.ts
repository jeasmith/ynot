import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { forgetPat, readRememberedPat, rememberPat } from './patStorage.ts';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
  };
}

function throwingStorage(): Storage {
  const fail = () => {
    throw new DOMException('storage is blocked', 'SecurityError');
  };
  return {
    length: 0,
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  } as unknown as Storage;
}

describe('patStorage', () => {
  let store: Storage;

  beforeEach(() => {
    store = memoryStorage();
    vi.stubGlobal('localStorage', store);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips a remembered PAT under the ynot.pat key', () => {
    expect(readRememberedPat()).toBeNull();

    rememberPat('pat-123');
    expect(readRememberedPat()).toBe('pat-123');
    expect(store.getItem('ynot.pat')).toBe('pat-123');

    rememberPat('pat-456');
    expect(readRememberedPat()).toBe('pat-456');

    forgetPat();
    expect(readRememberedPat()).toBeNull();
    expect(store.getItem('ynot.pat')).toBeNull();
  });

  it('never throws and reads as null when every storage call throws', () => {
    vi.stubGlobal('localStorage', throwingStorage());

    expect(() => rememberPat('pat-123')).not.toThrow();
    expect(() => forgetPat()).not.toThrow();
    expect(readRememberedPat()).toBeNull();
  });

  it('never throws when reading the localStorage accessor itself throws', () => {
    vi.unstubAllGlobals();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('cookies are blocked', 'SecurityError');
      },
    });
    try {
      expect(() => rememberPat('pat-123')).not.toThrow();
      expect(() => forgetPat()).not.toThrow();
      expect(readRememberedPat()).toBeNull();
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
