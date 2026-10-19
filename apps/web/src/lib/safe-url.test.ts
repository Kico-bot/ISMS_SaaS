import { describe, expect, it } from 'vitest';
import { externalHref } from './safe-url';

describe('externalHref', () => {
  it('lässt http und https als Verweis durch', () => {
    expect(externalHref('https://intranet.example/bericht')).toBe('https://intranet.example/bericht');
    expect(externalHref('HTTP://intranet.example/')).toBe('HTTP://intranet.example/');
  });

  it('macht aus anderen Schemata keinen Verweis', () => {
    // Ältere Einträge können solche Werte noch tragen; die API nimmt sie erst seit T24 nicht mehr an.
    expect(externalHref('javascript:alert(1)')).toBeNull();
    expect(externalHref(' javascript:alert(1)')).toBeNull();
    expect(externalHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(externalHref('//fremd.example/')).toBeNull();
    expect(externalHref(null)).toBeNull();
  });
});
