import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// SPEC-008 AC-008-11 (CM-067): app components use the design tokens from globals.css, not the raw gray/blue palette.
// components/ui is shadcn code and is excluded, as in noNativeDialogs.test.ts.
const root = join(__dirname, '..');
const rawPalette = /(?<![\w-])(?:[\w-]+:)*[a-z]+(?:-[a-z]+)*-(?:gray|blue)-\d{2,3}(?:\/\d{1,3})?(?![\w-])/;

const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return path.endsWith(join('components', 'ui')) ? [] : sources(path);
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });

describe('no raw palette classes', () => {
    it('sources_appAndComponents_containNoGrayOrBlueTailwindClasses', () => {
        const offenders = [...sources(join(root, 'app')), ...sources(join(root, 'components'))]
            .filter((path) => rawPalette.test(readFileSync(path, 'utf-8')))
            .map((path) => relative(root, path));
        expect(offenders).toEqual([]);
    });

    it.each([
        ['className="bg-gray-100"', true],
        ['className="hover:text-blue-600"', true],
        ['className="dark:border-gray-800/50"', true],
        ['className="bg-muted text-foreground"', false],
        ['className="text-primary ring-ring"', false],
    ])('rawPalettePattern_sample%#_matchesExpectation', (sample, expected) => {
        expect(rawPalette.test(sample)).toBe(expected);
    });
});
