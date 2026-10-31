import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_TTL_MS, resetDraftMemory, useDraftStore } from './draftStore';

const KEY = 'chatmee:draft:v1:u1:r1';

beforeEach(() => {
    sessionStorage.clear();
    resetDraftMemory();
    useDraftStore.setState({ texts: {} });
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('draftStore', () => {
    it('draft_switchRooms_restoresText', () => {
        const s = useDraftStore.getState();
        s.save('u1', 'r1', 'half written');
        s.save('u1', 'r2', 'other');
        expect(s.load('u1', 'r1')).toBe('half written');
        expect(s.load('u1', 'r2')).toBe('other');
    });

    it('draft_write_storesTextOnlyUnderNamespacedKey', () => {
        useDraftStore.getState().save('u1', 'r1', 'hi');
        const stored = JSON.parse(sessionStorage.getItem(KEY) as string);
        expect(Object.keys(stored).sort()).toEqual(['text', 'updatedAt']);
        expect(stored.text).toBe('hi');
        expect(Number.isNaN(Date.parse(stored.updatedAt))).toBe(false);
    });

    it('draft_expiredAfter24h_discarded', () => {
        const old = new Date(Date.now() - DRAFT_TTL_MS - 1000).toISOString();
        sessionStorage.setItem(KEY, JSON.stringify({ text: 'old', updatedAt: old }));
        expect(useDraftStore.getState().load('u1', 'r1')).toBe('');
        expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it('draft_edit_refreshesExpiry', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-31T00:00:00Z'));
        useDraftStore.getState().save('u1', 'r1', 'a');
        vi.setSystemTime(new Date('2026-10-31T20:00:00Z'));
        useDraftStore.getState().save('u1', 'r1', 'ab');
        vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
        expect(useDraftStore.getState().load('u1', 'r1')).toBe('ab');
    });

    it('draft_clearText_removesEntry', () => {
        const s = useDraftStore.getState();
        s.save('u1', 'r1', 'x');
        s.save('u1', 'r1', '   ');
        expect(sessionStorage.getItem(KEY)).toBeNull();
        expect(useDraftStore.getState().texts).toEqual({});
    });

    it('draft_corruptEntry_ignoredAndRemoved', () => {
        sessionStorage.setItem(KEY, '{not json');
        expect(useDraftStore.getState().load('u1', 'r1')).toBe('');
        sessionStorage.setItem(KEY, JSON.stringify({ text: 5 }));
        expect(useDraftStore.getState().load('u1', 'r1')).toBe('');
        expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    it('draft_logout_clearsAccountNamespace', () => {
        const s = useDraftStore.getState();
        s.save('u1', 'r1', 'a');
        s.save('u1', 'r2', 'b');
        s.clearAll();
        expect(sessionStorage.length).toBe(0);
        expect(useDraftStore.getState().load('u1', 'r1')).toBe('');
    });

    it('draft_differentAccount_purgesOtherNamespace', () => {
        const s = useDraftStore.getState();
        s.save('u1', 'r1', 'mine');
        s.save('u2', 'r9', 'theirs');
        s.hydrate('u2');
        expect(sessionStorage.getItem(KEY)).toBeNull();
        expect(useDraftStore.getState().texts).toEqual({ r9: 'theirs' });
    });

    it('draft_sameAccount_hydrateKeepsDraftsAfterExpiredLogin', () => {
        useDraftStore.getState().save('u1', 'r1', 'keep');
        useDraftStore.getState().hydrate('u1');
        expect(useDraftStore.getState().texts).toEqual({ r1: 'keep' });
    });

    it('draft_accessLost_cleared', () => {
        const s = useDraftStore.getState();
        s.save('u1', 'r1', 'gone');
        s.clear('u1', 'r1');
        expect(s.load('u1', 'r1')).toBe('');
        expect(useDraftStore.getState().texts).toEqual({});
    });

    it('draft_storageUnavailable_fallsBackToMemory', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota');
        });
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('denied');
        });
        const s = useDraftStore.getState();
        expect(() => s.save('u1', 'r1', 'kept in memory')).not.toThrow();
        expect(s.load('u1', 'r1')).toBe('kept in memory');
    });
});
