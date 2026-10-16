import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, readThemeChoice, setThemeChoice, THEME_STORAGE_KEY } from './theme';

const mockSystemDark = (dark: boolean) => {
    window.matchMedia = vi.fn().mockReturnValue({
        matches: dark, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
};

afterEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
});

describe('theme', () => {
    it('readThemeChoice_nothingStored_returnsSystem', () => {
        expect(readThemeChoice()).toBe('system');
    });

    it('setThemeChoice_dark_addsDarkClassAndRemembersChoice', () => {
        mockSystemDark(false);
        setThemeChoice('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    });

    it('applyTheme_systemWithDarkOs_addsDarkClass', () => {
        mockSystemDark(true);
        applyTheme('system');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('applyTheme_light_removesDarkClassEvenOnDarkOs', () => {
        mockSystemDark(true);
        document.documentElement.classList.add('dark');
        applyTheme('light');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
});
