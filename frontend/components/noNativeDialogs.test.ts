import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// SPEC-008 AC-008-10 / CM-066: no native alert/confirm/prompt and no placeholder links outside components/ui.
const root = join(__dirname, '..');
const forbidden = /\balert\(|window\.confirm\(|window\.prompt\(|href="#"/;
// SPEC-008 AC-008-10 / CM-067: no dead call or video controls and no "coming soon" / "later update" copy.
const deadControls = [
    /\b(Phone|PhoneCall|PhoneIcon|Video|VideoIcon|VideoOff|Camera)\b/, // lucide call/video icons
    /\b(voice|video|audio) call\b/i,
    /aria-label=["'][^"']*\b(call|video)\b/i,
    /coming soon/i,
    /later update/i,
];

const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return path.endsWith(join('components', 'ui')) ? [] : sources(path);
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });

const appSources = () => [...sources(join(root, 'app')), ...sources(join(root, 'components'))];

describe('no native dialogs', () => {
    it('sources_appAndComponents_containNoAlertConfirmPromptOrHashLinks', () => {
        const offenders = appSources()
            .filter((path) => forbidden.test(readFileSync(path, 'utf-8')))
            .map((path) => relative(root, path));
        expect(offenders).toEqual([]);
    });

    it('sources_appAndComponents_containNoCallVideoControlsOrComingSoonCopy', () => {
        const offenders = appSources()
            .filter((path) => {
                const text = readFileSync(path, 'utf-8');
                return deadControls.some((pattern) => pattern.test(text));
            })
            .map((path) => relative(root, path));
        expect(offenders).toEqual([]);
    });

    it.each([
        ['import { Phone, Video } from "lucide-react";'],
        ['<Button aria-label="Start video">'],
        ['<p>Voice call</p>'],
        ['<span>Coming soon</span>'],
        ['<span>Available in a later update</span>'],
    ])('deadControlPatterns_sample%#_isDetected', (sample) => {
        expect(deadControls.some((pattern) => pattern.test(sample))).toBe(true);
    });
});
