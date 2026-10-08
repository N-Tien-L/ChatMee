import { describe, it, expect } from 'vitest';
import { addIsOwnToMessages, deduplicateMessages, updateSessionCache } from './messageUtils';
import { MessageResponse } from '@/lib/types';
import { MessageType } from '@/lib/types/entities/chat/enums';

const baseMsg = {
    chatRoomId: 'r1',
    type: 'TEXT' as MessageType,
    createdAt: '',
    updatedAt: '',
    isUpdated: false,
    isDeleted: false,
    tempId: ''
};

describe('messageUtils', () => {
    describe('addIsOwnToMessages', () => {
        it('should correctly set isOwn based on userId', () => {
            const msgs: MessageResponse[] = [
                { ...baseMsg, id: '1', senderId: 'u1', content: 'A' },
                { ...baseMsg, id: '2', senderId: 'u2', content: 'B' }
            ];
            
            const result = addIsOwnToMessages(msgs, 'u1');
            
            expect(result).toHaveLength(2);
            expect(result[0].isOwn).toBe(true);
            expect(result[0].status).toBe('sent');
            expect(result[1].isOwn).toBe(false);
            expect(result[1].status).toBe('sent');
        });

        it('should handle empty list', () => {
            const result = addIsOwnToMessages([], 'u1');
            expect(result).toEqual([]);
        });
        
        it('should handle missing userId', () => {
            const msgs: MessageResponse[] = [
                { ...baseMsg, id: '1', senderId: 'u1', content: 'A' }
            ];
            const result = addIsOwnToMessages(msgs);
            expect(result[0].isOwn).toBe(false);
        });
    });

    describe('deduplicateMessages', () => {
        it('should remove duplicates keeping the first occurrence and preserving order', () => {
            const msgs = [
                { id: '1', text: 'A' },
                { id: '2', text: 'B' },
                { id: '1', text: 'C' },
                { id: '3', text: 'D' }
            ];
            const result = deduplicateMessages(msgs);
            
            expect(result).toHaveLength(3);
            expect(result[0]).toEqual({ id: '1', text: 'A' });
            expect(result[1]).toEqual({ id: '2', text: 'B' });
            expect(result[2]).toEqual({ id: '3', text: 'D' });
        });
    });

    describe('updateSessionCache', () => {
        it('should append and deduplicate messages in the cache for an existing room', () => {
            const cache = new Map();
            cache.set('r1', { messages: [{ id: '1' }, { id: '2' }], otherProp: 'value' });
            
            updateSessionCache(cache, 'r1', [{ id: '2' }, { id: '3' }]);
            
            const updated = cache.get('r1');
            expect(updated).toBeDefined();
            expect(updated.messages).toEqual([{ id: '1' }, { id: '2' }, { id: '3' }]);
            expect(updated.otherProp).toBe('value');
        });

        it('should do nothing if room is not in cache', () => {
            const cache = new Map();
            updateSessionCache(cache, 'r1', [{ id: '1' }]);
            expect(cache.has('r1')).toBe(false);
        });
    });
});
