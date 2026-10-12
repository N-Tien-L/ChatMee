import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RelativeTime, formatRelativeTime } from './RelativeTime';

afterEach(cleanup);

const NOW = new Date('2026-01-10T12:00:00Z');

describe('formatRelativeTime', () => {
    it.each([
        ['2026-01-10T11:59:40Z', 'just now'],
        ['2026-01-10T11:55:00Z', '5m ago'],
        ['2026-01-10T09:00:00Z', '3h ago'],
        ['2026-01-08T12:00:00Z', '2d ago'],
    ])('formatRelativeTime_%s_returns_%s', (value, expected) => {
        expect(formatRelativeTime(new Date(value), NOW)).toBe(expected);
    });

    it('formatRelativeTime_olderThanAWeek_returnsDate', () => {
        expect(formatRelativeTime(new Date('2025-12-01T12:00:00Z'), NOW)).not.toMatch(/ago$/);
    });

    it('formatRelativeTime_future_returnsJustNow', () => {
        expect(formatRelativeTime(new Date('2026-01-10T12:05:00Z'), NOW)).toBe('just now');
    });
});

describe('RelativeTime', () => {
    it('render_validValue_rendersTimeElementWithIsoDateTime', () => {
        render(<RelativeTime value="2026-01-10T11:55:00Z" now={NOW} />);
        const el = screen.getByText('5m ago');
        expect(el.tagName).toBe('TIME');
        expect(el).toHaveAttribute('datetime', '2026-01-10T11:55:00.000Z');
    });

    it('render_invalidValue_rendersNothing', () => {
        const { container } = render(<RelativeTime value="not-a-date" now={NOW} />);
        expect(container).toBeEmptyDOMElement();
    });
});
