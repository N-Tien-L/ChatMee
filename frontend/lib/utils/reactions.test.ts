import { describe, expect, it } from 'vitest';
import { applyMyReaction, fromRoomEvent, isReactionEvent, myReaction } from './reactions';

describe('reaction helpers (SPEC-015)', () => {
    it('applyMyReaction_firstReaction_addsChipWithMine', () => {
        expect(applyMyReaction(undefined, '👍')).toEqual([{ emoji: '👍', count: 1, reactedByMe: true }]);
    });

    it('applyMyReaction_existingEmoji_incrementsIt', () => {
        expect(applyMyReaction([{ emoji: '👍', count: 2, reactedByMe: false }], '👍'))
            .toEqual([{ emoji: '👍', count: 3, reactedByMe: true }]);
    });

    it('applyMyReaction_change_movesTheOneReaction', () => {
        expect(applyMyReaction([{ emoji: '👍', count: 1, reactedByMe: true }, { emoji: '😂', count: 1, reactedByMe: false }], '😂'))
            .toEqual([{ emoji: '😂', count: 2, reactedByMe: true }]);
    });

    it('applyMyReaction_remove_dropsZeroCounts', () => {
        expect(applyMyReaction([{ emoji: '👍', count: 1, reactedByMe: true }], null)).toEqual([]);
        expect(myReaction([{ emoji: '👍', count: 1, reactedByMe: true }])).toBe('👍');
    });

    it('fromRoomEvent_keepsOwnChoiceOnly', () => {
        expect(fromRoomEvent([{ emoji: '❤️', count: 1, reactedByMe: true }],
            { event: 'REACTION_UPDATED', messageId: 'm1', summary: [{ emoji: '❤️', count: 2 }, { emoji: '👍', count: 1 }] }))
            .toEqual([{ emoji: '❤️', count: 2, reactedByMe: true }, { emoji: '👍', count: 1, reactedByMe: false }]);
    });

    it('isReactionEvent_messageFrame_isNotAnEvent', () => {
        expect(isReactionEvent({ event: 'REACTION_UPDATED', messageId: 'm1', summary: [] })).toBe(true);
        expect(isReactionEvent({ id: 'm1', content: 'hi' })).toBe(false);
        expect(isReactionEvent({ event: 'SOMETHING_NEW', messageId: 'm1' })).toBe(false);
    });
});
