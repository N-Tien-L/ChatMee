import { expect, test } from 'vitest';
import { cn } from './utils';

test('cn merges classes correctly', () => {
  expect(cn('base-class', 'added-class')).toBe('base-class added-class');
  expect(cn('base-class', { 'added-class': true, 'ignored-class': false })).toBe('base-class added-class');
  expect(cn('p-4 p-8')).toBe('p-8'); // tailwind merge test
});
