import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRoomMessages } from './useRoomMessage';
import { Message, MessageResponse, ReactionUpdatedEvent } from '@/lib/types';
import { MessageType } from '@/lib/types/entities/chat/enums';
import { messageApi } from '@/lib/api/messageApi';

const transport = vi.hoisted(() => ({
    connected: true, connecting: false,
    sendMessage: vi.fn(() => true),
    subscribeRoom: vi.fn<(roomId: string, onMessage: (message: Message) => void,
        onReaction?: (event: ReactionUpdatedEvent) => void) => () => void>(() => () => {}),
    subscribeErrors: vi.fn(() => () => {}),
    onReconnect: vi.fn<(listener: () => void) => () => void>(() => () => {}),
    getLastReconnectAt: vi.fn(() => 0),
}));
vi.mock('./useWebSocket', () => ({ useWebSocket: () => transport }));
vi.mock('@/lib/stores/authStore', () => ({ useAuthStore: () => ({ user: { id: 'u1', name: 'Alice' } }) }));
vi.mock('@/lib/api/messageApi', () => ({
    messageApi: { getMessages: vi.fn(), react: vi.fn(), unreact: vi.fn() },
}));
vi.mock('@/lib/api/chatRoomApi', () => ({ chatRoomApi: { getChatRoomById: vi.fn(), getMembers: vi.fn() } }));

const stored = (reactions: MessageResponse['reactions'], id = 'm1'): MessageResponse => ({
    id, chatRoomId: 'r1', senderId: 'u2', senderName: 'Bob', type: MessageType.TEXT, content: 'hi',
    createdAt: '2026-11-03T10:00:00Z', updatedAt: '2026-11-03T10:00:00Z', isUpdated: false, isDeleted: false, reactions,
});
const page = (messages: MessageResponse[]) =>
    ({ success: true, message: 'ok', data: { messages, nextCursor: null, hasMore: false } });
const reacted = (reactions: NonNullable<MessageResponse['reactions']>) =>
    ({ success: true, message: 'ok', data: { messageId: 'm1', reactions } });

let sequence = 0;
async function mountWith(reactions: MessageResponse['reactions']) {
    vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page([stored(reactions)]));
    const roomId = `reaction-room-${++sequence}`;
    const hook = renderHook(() => useRoomMessages(roomId));
    await act(async () => {});
    return { ...hook, roomId };
}
const reactionsOf = (messages: Message[]) => messages.find(m => m.id === 'm1')?.reactions;

describe('useRoomMessages reactions (SPEC-015)', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('reactions_selectOther_changes', async () => {
        const { result, roomId } = await mountWith([{ emoji: '👍', count: 2, reactedByMe: true }]);
        let settle!: (value: ReturnType<typeof reacted>) => void;
        vi.mocked(messageApi.react).mockReturnValueOnce(new Promise(resolve => { settle = resolve; }));

        let pending!: Promise<string | null>;
        act(() => { pending = result.current.toggleReaction('m1', '❤️'); });
        // Optimistic: one reaction per user, so the old one loses a count and the new one gains it (AC-015-1).
        expect(reactionsOf(result.current.messages)).toEqual([
            { emoji: '👍', count: 1, reactedByMe: false },
            { emoji: '❤️', count: 1, reactedByMe: true },
        ]);
        expect(messageApi.react).toHaveBeenCalledWith(roomId, 'm1', '❤️');

        await act(async () => {
            settle(reacted([{ emoji: '❤️', count: 3, reactedByMe: true }, { emoji: '👍', count: 1, reactedByMe: false }]));
            await pending;
        });
        // The response is authoritative.
        expect(reactionsOf(result.current.messages)).toEqual([
            { emoji: '❤️', count: 3, reactedByMe: true },
            { emoji: '👍', count: 1, reactedByMe: false },
        ]);
    });

    it('reactions_reselectSame_removes', async () => {
        const { result, roomId } = await mountWith([{ emoji: '👍', count: 1, reactedByMe: true }]);
        vi.mocked(messageApi.unreact).mockResolvedValueOnce(reacted([]));

        await act(async () => { await result.current.toggleReaction('m1', '👍'); });

        expect(messageApi.unreact).toHaveBeenCalledWith(roomId, 'm1');
        expect(messageApi.react).not.toHaveBeenCalled();
        expect(reactionsOf(result.current.messages)).toEqual([]);
    });

    it('reactions_optimisticRollbackOnError', async () => {
        const before = [{ emoji: '😂', count: 1, reactedByMe: false }];
        const { result } = await mountWith(before);
        vi.mocked(messageApi.react).mockRejectedValueOnce({ response: { data: { detail: 'Too many requests' } } });

        let error: string | null = null;
        await act(async () => { error = await result.current.toggleReaction('m1', '😂'); });

        expect(error).toBe('Too many requests');
        expect(reactionsOf(result.current.messages)).toEqual(before);
    });

    it('reactions_roomEvent_appliesCountsAndKeepsMine', async () => {
        const { result } = await mountWith([{ emoji: '👍', count: 1, reactedByMe: true }]);
        const onReaction = transport.subscribeRoom.mock.calls.at(-1)![2]!;

        act(() => {
            onReaction({ event: 'REACTION_UPDATED', messageId: 'm1', summary: [{ emoji: '😮', count: 2 }, { emoji: '👍', count: 1 }] });
        });

        // Counts come from the event; reactedByMe stays with the current user's own choice (AC-015-7).
        expect(reactionsOf(result.current.messages)).toEqual([
            { emoji: '😮', count: 2, reactedByMe: false },
            { emoji: '👍', count: 1, reactedByMe: true },
        ]);
    });

    it('reactions_roomEventDuringOwnRequest_waitsForResponse', async () => {
        const { result } = await mountWith([]);
        let settle!: (value: ReturnType<typeof reacted>) => void;
        vi.mocked(messageApi.react).mockReturnValueOnce(new Promise(resolve => { settle = resolve; }));
        const onReaction = transport.subscribeRoom.mock.calls.at(-1)![2]!;

        let pending!: Promise<string | null>;
        act(() => { pending = result.current.toggleReaction('m1', '👍'); });
        // A frame from before our write must not wipe the optimistic pick.
        act(() => { onReaction({ event: 'REACTION_UPDATED', messageId: 'm1', summary: [] }); });
        expect(reactionsOf(result.current.messages)).toEqual([{ emoji: '👍', count: 1, reactedByMe: true }]);

        await act(async () => { settle(reacted([{ emoji: '👍', count: 1, reactedByMe: true }])); await pending; });
        expect(reactionsOf(result.current.messages)).toEqual([{ emoji: '👍', count: 1, reactedByMe: true }]);
    });

    it('reactions_reconnect_converges', async () => {
        const { result } = await mountWith([{ emoji: '👍', count: 1, reactedByMe: true }]);
        // Changes made while offline: the history refetch is authoritative for loaded messages (AC-015-9).
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce(
            page([stored([{ emoji: '❤️', count: 4, reactedByMe: false }])]));

        const reconnected = transport.onReconnect.mock.calls.at(-1)![0];
        await act(async () => { reconnected(); });

        expect(reactionsOf(result.current.messages)).toEqual([{ emoji: '❤️', count: 4, reactedByMe: false }]);
    });
});
