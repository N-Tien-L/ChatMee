import { describe, it, expect } from 'vitest';
import {
    matchResyncedPending,
    mergeResyncedMessages,
    NOT_SENT_ERROR_CODE,
    TIMEOUT_ERROR_CODE,
} from './messageUtils';
import { Message, MessageResponse } from '@/lib/types';
import { MessageType } from '@/lib/types/entities/chat/enums';

const base = {
    chatRoomId: 'r1',
    type: MessageType.TEXT,
    updatedAt: '',
    isUpdated: false,
    isDeleted: false,
};

const pending = (tempId: string, content: string, createdAt: string, extra: Partial<Message> = {}): Message => ({
    ...base, id: `optimistic-${tempId}`, tempId, senderId: 'me', content, createdAt,
    isOwn: true, isOptimistic: true, status: 'sending', ...extra,
});

const saved = (id: string, content: string, createdAt: string, senderId = 'me'): MessageResponse => ({
    ...base, id, senderId, content, createdAt,
});

describe('matchResyncedPending', () => {
    it('matchResyncedPending_sameSenderContentWithinWindow_confirmsPending', () => {
        const current = [pending('t1', 'hello', '2026-10-09T10:00:00.000Z')];
        const matches = matchResyncedPending(current, [saved('s1', 'hello ', '2026-10-09T10:00:02Z')], 'me');
        expect(matches.get('t1')?.id).toBe('s1');
    });

    it('matchResyncedPending_outsideWindowOrOtherSenderOrContent_noMatch', () => {
        const current = [pending('t1', 'hello', '2026-10-09T10:00:00Z')];
        const latest = [
            saved('far', 'hello', '2026-10-09T10:00:31Z'),
            saved('other', 'hello', '2026-10-09T10:00:01Z', 'u2'),
            saved('diff', 'hi', '2026-10-09T10:00:01Z'),
        ];
        expect(matchResyncedPending(current, latest, 'me').size).toBe(0);
    });

    it('matchResyncedPending_messageAlreadyOnScreen_notReused', () => {
        const shown: Message = { ...saved('s1', 'ok', '2026-10-09T10:00:00Z'), isOwn: true, status: 'sent' };
        const current = [shown, pending('t1', 'ok', '2026-10-09T10:00:01Z')];
        expect(matchResyncedPending(current, [saved('s1', 'ok', '2026-10-09T10:00:00Z')], 'me').size).toBe(0);
    });

    it('matchResyncedPending_twoIdenticalPending_eachClaimsOneServerCopy', () => {
        const current = [
            pending('t1', 'ok', '2026-10-09T10:00:00Z'),
            pending('t2', 'ok', '2026-10-09T10:00:05Z'),
        ];
        const matches = matchResyncedPending(current, [saved('s1', 'ok', '2026-10-09T10:00:01Z')], 'me');
        expect(matches.size).toBe(1);
        expect(matches.get('t1')?.id).toBe('s1');
    });

    it('matchResyncedPending_sameClientMessageIdAfterLongDisconnect_confirmsPending', () => {
        const pending: Message = { ...base, id: 'optimistic-t-1', tempId: 't-1', senderId: 'u1', content: 'hello',
            createdAt: '2026-10-09T10:00:00Z', isOwn: true, isOptimistic: true, status: 'sending' };
        // Five minutes later: outside PENDING_MATCH_WINDOW_MS, so only the stored client id can confirm it.
        const saved: MessageResponse = { ...base, id: 's1', clientMessageId: 't-1', senderId: 'u1', content: 'hello',
            createdAt: '2026-10-09T10:05:00Z' };
        expect(matchResyncedPending([pending], [saved], 'u1').get('t-1')).toBe(saved);
    });

    it('matchResyncedPending_identicalTextWithOtherClientMessageId_doesNotConfirmPending', () => {
        const pending: Message = { ...base, id: 'optimistic-t-1', tempId: 't-1', senderId: 'u1', content: 'hello',
            createdAt: '2026-10-09T10:00:00Z', isOwn: true, isOptimistic: true, status: 'sending' };
        const otherSend: MessageResponse = { ...base, id: 's2', clientMessageId: 't-2', senderId: 'u1', content: 'hello',
            createdAt: '2026-10-09T10:00:01Z' };
        expect(matchResyncedPending([pending], [otherSend], 'u1').has('t-1')).toBe(false);
    });

    it('matchResyncedPending_failedByServerOrNotSent_neverMatched', () => {
        const current = [
            pending('t1', 'a', '2026-10-09T10:00:00Z', { status: 'failed', errorCode: 'RATE_LIMITED' }),
            pending('t2', 'a', '2026-10-09T10:00:00Z', { status: 'failed', errorCode: NOT_SENT_ERROR_CODE }),
        ];
        expect(matchResyncedPending(current, [saved('s1', 'a', '2026-10-09T10:00:01Z')], 'me').size).toBe(0);
    });

    it('matchResyncedPending_failedByTimeout_matched', () => {
        const current = [pending('t1', 'a', '2026-10-09T10:00:00Z', { status: 'failed', errorCode: TIMEOUT_ERROR_CODE })];
        expect(matchResyncedPending(current, [saved('s1', 'a', '2026-10-09T10:00:01Z')], 'me').get('t1')?.id).toBe('s1');
    });

    it('matchResyncedPending_noUser_noMatch', () => {
        const current = [pending('t1', 'a', '2026-10-09T10:00:00Z')];
        expect(matchResyncedPending(current, [saved('s1', 'a', '2026-10-09T10:00:00Z')]).size).toBe(0);
    });
});

describe('mergeResyncedMessages with lost confirmations', () => {
    it('mergeResyncedMessages_lostConfirmation_showsServerCopyOnce', () => {
        const current = [pending('t1', 'hello', '2026-10-09T10:00:00Z'), pending('t2', 'later', '2026-10-09T10:00:03Z')];
        const merged = mergeResyncedMessages(current, [saved('s1', 'hello', '2026-10-09T10:00:01Z')], 'me');
        expect(merged.map(m => m.id)).toEqual(['s1', 'optimistic-t2']);
        expect(merged[0]).toMatchObject({ isOwn: true, status: 'sent' });
        expect(merged[1].status).toBe('sending');
    });
});
