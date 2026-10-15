import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// SPEC-008 AC-008-10 / CM-066: no native alert/confirm/prompt and no placeholder links outside components/ui.
const root = join(__dirname, '..');
const forbidden = /\balert\(|window\.confirm\(|window\.prompt\(|href="#"/;

const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return path.endsWith(join('components', 'ui')) ? [] : sources(path);
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });

describe('no native dialogs', () => {
    it('sources_appAndComponents_containNoAlertConfirmPromptOrHashLinks', () => {
        const offenders = [...sources(join(root, 'app')), ...sources(join(root, 'components'))]
            .filter((path) => forbidden.test(readFileSync(path, 'utf-8')))
            .map((path) => relative(root, path));
        expect(offenders).toEqual([]);
    });
});
