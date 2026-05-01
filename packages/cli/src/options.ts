import { InvalidArgumentError } from "commander";

/**
 * Build a commander option-parser that requires an integer.
 * Surfaces a clean error from commander instead of letting `NaN` flow into
 * downstream code (where it silently becomes "no results" or crashes the SDK).
 */
export function intOption(
  name: string,
  opts: { min?: number; max?: number } = {},
): (value: string) => number {
  return (value: string): number => {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || String(n) !== value.trim()) {
      throw new InvalidArgumentError(`${name} must be an integer, got "${value}"`);
    }
    if (opts.min !== undefined && n < opts.min) {
      throw new InvalidArgumentError(`${name} must be ≥ ${opts.min}, got ${n}`);
    }
    if (opts.max !== undefined && n > opts.max) {
      throw new InvalidArgumentError(`${name} must be ≤ ${opts.max}, got ${n}`);
    }
    return n;
  };
}
