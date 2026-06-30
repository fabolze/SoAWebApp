import { describe, expect, it } from 'vitest';
import { formatDragonEraYear, parseDragonEraYear, parseNumberByType } from './helpers';

describe('Dragon-era year helpers', () => {
  it('parses before-Dragons formatted years as negative integer offsets', () => {
    expect(parseDragonEraYear('-50.000 b.D.')).toBe(-50000);
    expect(parseDragonEraYear('50.000 b.D.')).toBe(-50000);
    expect(parseNumberByType('-50.000 b.D.', 'integer', 'dragon_era_year')).toBe(-50000);
  });

  it('parses after-Dragons formatted years as positive integer offsets', () => {
    expect(parseDragonEraYear('10.000 a.D.')).toBe(10000);
    expect(parseDragonEraYear('0 a.D.')).toBe(0);
  });

  it('keeps plain signed years usable', () => {
    expect(parseDragonEraYear('-50000')).toBe(-50000);
    expect(parseDragonEraYear('10000')).toBe(10000);
  });

  it('rejects negative after-Dragons contradictions', () => {
    expect(parseDragonEraYear('-10 a.D.')).toBeNull();
  });

  it('formats integer offsets with Dragon-era suffixes', () => {
    expect(formatDragonEraYear(-50000)).toBe('-50.000 b.D.');
    expect(formatDragonEraYear(10000)).toBe('10.000 a.D.');
    expect(formatDragonEraYear(0)).toBe('0 a.D.');
  });
});
