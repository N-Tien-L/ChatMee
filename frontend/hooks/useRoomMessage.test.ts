import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRoomMessages, resetRoomMessageCache } from './useRoomMessage';
import { Message, MessageResponse } from '@/lib/types';
import { MessageType } from '@/lib/types/entities/chat/enums';
import { messageApi } from '@/lib/api/messageApi';
import { chatRoomApi } from '@/lib/api/chatRoomApi';
import { useChatRoomsStore } from '@/lib/stores/chatRoomsStore';
import { ChatRoom } from '@/lib/types';

const transport = vi.hoisted(() => ({
    connected: true, connecting: false,
    sendMessage: vi.fn<(roomId: string, content: string, tempId?: string) => boolean>(() => true),
    subscribeRoom: vi.fn<(roomId: string, onMessage: (message: Message) => void) => () => void>(() => () => {}),
    subscribeErrors: vi.fn<(handler: (error: { tempId?: string; code?: string; message: string }) => void) => () => void>(() => () => {}),
    onReconnect: vi.fn<(listener: () => void) => () => void>(() => () => {}),
    getLastReconnectAt: vi.fn(() => 0),
}));
vi.mock('./useWebSocket', () => ({ useWebSocket: () => transport }));
const identity = vi.hoisted(() => ({ user: { id: 'u1', name: 'Alice' } as { id: string; name: string } | null }));
vi.mock('@/lib/stores/authStore', () => ({ useAuthStore: () => identity }));
vi.mock('@/lib/api/messageApi', () => ({
    messageApi: { getMessages: vi.fn().mockResolvedValue({ success: true, data: { messages: [], nextCursor: null, hasMore: false } }) },
}));

vi.mock('@/lib/api/chatRoomApi', () => ({ chatRoomApi: { getChatRoomById: vi.fn(), getMembers: vi.fn() } }));

const base = {
    chatRoomId: 'r1', senderId: 'u1', type: MessageType.TEXT, content: 'hello',
    createdAt: '2026-10-09T10:00:00Z', updatedAt: '2026-10-09T10:00:00Z', isUpdated: false, isDeleted: false,
};

describe('useRoomMessages client ids (SPEC-008 AC-008-13)', () => {
    let sequence = 0;
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        transport.sendMessage.mockImplementation(() => true);
    });
    afterEach(() => { vi.useRealTimers(); });

    async function mountRoom() {
        const roomId = `client-id-room-${++sequence}`;
        const hook = renderHook(() => useRoomMessages(roomId));
        await act(async () => {});
        return { ...hook, roomId };
    }

    it('resync_lostEchoMoreThanTheMatchWindowAgo_showsStoredMessageOnce', async () => {
        const { result, roomId } = await mountRoom();
        act(() => { void result.current.sendMessage('hello'); });
        const pending = result.current.messages[0];
        // Five minutes later the content heuristic cannot match; only the stored client id can.
        const storedAt = new Date(Date.parse(pending.createdAt) + 5 * 60_000).toISOString();
        // History carries clientMessageId (not tempId): the stored client id is the only link to the pending copy.
        const saved: MessageResponse = { ...base, id: 's1', chatRoomId: roomId, clientMessageId: pending.tempId, createdAt: storedAt, updatedAt: storedAt };
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce({ success: true, message: 'ok', data: { messages: [saved], nextCursor: null, hasMore: false } });

        const reconnected = transport.onReconnect.mock.calls.at(-1)![0];
        await act(async () => { reconnected(); });

        expect(result.current.messages.map(m => m.id)).toEqual(['s1']);
        expect(result.current.messages[0].status).toBe('sent');
    });

    it('resend_afterTimedOutSend_reusesClientIdAndStoredCopyConfirmsIt', async () => {
        const { result } = await mountRoom();
        act(() => { void result.current.sendMessage('hello'); });
        const first = result.current.messages[0];
        act(() => { vi.advanceTimersByTime(10_000); });
        expect(result.current.messages[0].status).toBe('failed');

        act(() => { result.current.resendMessage(first.tempId as string); });
        expect(transport.sendMessage).toHaveBeenLastCalledWith(expect.any(String), 'hello', first.tempId);

        // The server stored the first attempt; its broadcast carries the same client id and confirms the retry.
        const onMessage = transport.subscribeRoom.mock.calls.at(-1)![1];
        const echo: Message = { ...base, id: 's1', tempId: first.tempId, isOwn: true, status: 'sent' };
        act(() => { onMessage(echo); });
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0]).toMatchObject({ id: 's1', status: 'sent' });
    });

    it('sendMessage_twoNewSends_getDistinctClientIds', async () => {
        const { result } = await mountRoom();
        act(() => { void result.current.sendMessage('one'); });
        act(() => { void result.current.sendMessage('two'); });

        const [first, second] = result.current.messages;
        expect(first.tempId).toBeTruthy();
        expect(second.tempId).not.toBe(first.tempId);
        expect(transport.sendMessage).toHaveBeenNthCalledWith(1, expect.any(String), 'one', first.tempId);
        expect(transport.sendMessage).toHaveBeenNthCalledWith(2, expect.any(String), 'two', second.tempId);
    });
});

describe('useRoomMessages membership system messages (CM-090)', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('open_roomWithStaleParticipants_refreshesRoomFromServer', async () => {
        const room = { id: 'open-room', roomName: 'Room', participants: ['u1'] } as unknown as ChatRoom;
        useChatRoomsStore.setState({ rooms: [room], filteredRooms: [] });
        vi.mocked(chatRoomApi.getChatRoomById).mockResolvedValue({
            success: true, message: 'ok', data: { ...room, participants: ['u1', 'u2'] } as never,
        });

        renderHook(() => useRoomMessages('open-room'));
        await act(async () => {});

        expect(chatRoomApi.getChatRoomById).toHaveBeenCalledWith('open-room');
        expect(useChatRoomsStore.getState().rooms[0].participants).toEqual(['u1', 'u2']);
    });

    it('systemMessage_memberJoined_refreshesRoomParticipants', async () => {
        const room = { id: 'sys-room', roomName: 'Room', participants: ['u1'] } as unknown as ChatRoom;
        useChatRoomsStore.setState({ rooms: [room], filteredRooms: [] });
        vi.mocked(chatRoomApi.getChatRoomById).mockResolvedValue({
            success: true, message: 'ok', data: { ...room, participants: ['u1', 'u2'] } as never,
        });
        renderHook(() => useRoomMessages('sys-room'));
        await act(async () => {});
        const onMessage = transport.subscribeRoom.mock.calls.find((call) => call[0] === 'sys-room')![1];

        await act(async () => {
            onMessage({ ...base, id: 'm1', chatRoomId: 'sys-room', type: MessageType.SYSTEM, senderId: 'u2', content: 'Bob joined' } as Message);
        });

        expect(chatRoomApi.getChatRoomById).toHaveBeenCalledWith('sys-room');
        expect(useChatRoomsStore.getState().rooms[0].participants).toEqual(['u1', 'u2']);
    });
});

describe('CM-095 reconnect gap recovery', () => {
    const saved = (n: number): MessageResponse => ({ ...base, id: `server-${n}`, createdAt: new Date(1700000000000 + n * 1000).toISOString() });
    const page = (start: number, end: number, cursor: string | null) => ({ success: true, message: 'ok', data: {
        messages: Array.from({ length: end - start + 1 }, (_, i) => saved(start + i)), nextCursor: cursor, hasMore: cursor !== null,
    } });
    it('reconnect_moreThanOnePage_recoversEveryMessageOnce', async () => {
        vi.mocked(messageApi.getMessages).mockReset().mockResolvedValueOnce(page(0, 0, null));
        const { result } = renderHook(() => useRoomMessages('gap-over-100'));
        await act(async () => {});
        vi.mocked(messageApi.getMessages)
            .mockResolvedValueOnce(page(101, 150, 'before-101'))
            .mockResolvedValueOnce(page(51, 100, 'before-51'))
            .mockResolvedValueOnce(page(1, 50, 'before-1'))
            .mockResolvedValueOnce(page(0, 0, null));
        await act(async () => { transport.onReconnect.mock.calls.at(-1)![0](); });
        expect(result.current.messages.map(m => m.id)).toEqual(Array.from({ length: 151 }, (_, n) => `server-${n}`));
        expect(messageApi.getMessages).toHaveBeenLastCalledWith('gap-over-100', { before: 'before-1' });
    });
});


describe('CM-095 recovery boundaries', () => {
    const saved = (id: string, clientMessageId?: string): MessageResponse => ({ ...base, id, clientMessageId });
    const page = (ids: string[], nextCursor: string | null = null) => ({ success: true, message: 'ok', data: {
        messages: ids.map(id => saved(id)), nextCursor, hasMore: nextCursor !== null,
    } });
    const reconnect = () => transport.onReconnect.mock.calls.at(-1)![0]();
    const deferred = () => {
        let resolve!: (value: ReturnType<typeof page>) => void;
        const promise = new Promise<ReturnType<typeof page>>(done => { resolve = done; });
        return { promise, resolve };
    };
    beforeEach(() => {
        resetRoomMessageCache();
        vi.clearAllMocks();
        vi.mocked(messageApi.getMessages).mockReset().mockResolvedValue(page(['a'], 'older-a'));
        identity.user = { id: 'u1', name: 'Alice' };
    });
    afterEach(() => { vi.useRealTimers(); });
    async function mount() {
        const hook = renderHook(({ room }) => useRoomMessages(room), { initialProps: { room: 'recovery-room' } });
        await act(async () => {});
        return hook;
    }
    it('reconnect_tiedTimestampsAndLostEcho_keepsOneOrderedCopy', async () => {
        const { result } = await mount();
        act(() => { void result.current.sendMessage('hello'); });
        const pending = result.current.messages.at(-1)!;
        const next = deferred();
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page(['d'], 'cursor-d')).mockReturnValueOnce(next.promise);
        await act(async () => { reconnect(); });
        act(() => { transport.subscribeRoom.mock.calls.at(-1)![1]({ ...saved('e'), isOwn: false }); });
        expect(result.current.recovery).toBe('loading');
        await act(async () => { next.resolve({ ...page([]), data: { messages: [saved('a'), saved('b', pending.tempId), saved('c')], nextCursor: 'older-a', hasMore: true } }); });
        expect(result.current.messages.map(m => m.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
        expect(result.current.messages.some(m => m.isOptimistic)).toBe(false);
        expect(result.current.nextCursor).toBe('older-a');
    });
    it('reconnect_optimisticOnly_loadsOnePageAndRestoresCursor', async () => {
        vi.mocked(messageApi.getMessages).mockRejectedValueOnce(new Error('offline'));
        const { result } = await mount();
        act(() => { void result.current.sendMessage('hello'); });
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page(['b'], 'older-b'));
        await act(async () => { reconnect(); });
        expect(messageApi.getMessages).toHaveBeenCalledTimes(2);
        expect(result.current.nextCursor).toBe('older-b');
        expect(result.current.hasMoreMessages).toBe(true);
        expect(result.current.error).toBeNull();
        await act(async () => { await result.current.loadOlder(); });
        expect(messageApi.getMessages).toHaveBeenLastCalledWith('recovery-room', { before: 'older-b' });
    });
    it('reconnect_boundedRecovery_continuesFromCursorWithoutPublishingGap', async () => {
        const { result } = await mount();
        for (let n = 10; n > 0; n--) vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page([`z${n}`], `cursor-${n}`));
        await act(async () => { reconnect(); });
        expect(result.current.recovery).toBe('incomplete');
        expect(messageApi.getMessages).toHaveBeenCalledTimes(11);
        expect(result.current.messages.map(m => m.id)).toEqual(['a']);
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page(['a']));
        await act(async () => { result.current.continueRecovery(); });
        expect(messageApi.getMessages).toHaveBeenLastCalledWith('recovery-room', { before: 'cursor-1' });
        expect(result.current.messages).toHaveLength(11);
        expect(result.current.recovery).toBe('idle');
    });
    it.each([500, 429])('reconnect_pageFailure%s_retriesSavedCursorAndHonorsRetryAfter', async status => {
        vi.useFakeTimers();
        const { result } = await mount();
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page(['c'], 'cursor-c'))
            .mockRejectedValueOnce(new Error('unavailable', { cause: { response: { status, headers: { 'retry-after': '5' } } } }));
        await act(async () => { reconnect(); });
        expect(result.current.recovery).toBe('error');
        expect(result.current.messages.map(m => m.id)).toEqual(['a']);
        if (status === 429) {
            await act(async () => { result.current.continueRecovery(); });
            expect(messageApi.getMessages).toHaveBeenCalledTimes(3);
            act(() => { vi.advanceTimersByTime(5000); });
        }
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page(['a', 'b']));
        await act(async () => { result.current.continueRecovery(); });
        expect(messageApi.getMessages).toHaveBeenLastCalledWith('recovery-room', { before: 'cursor-c' });
        expect(result.current.messages.map(m => m.id)).toEqual(['a', 'b', 'c']);
    });
    it('reconnect_duringRetryAfter_restartsAtHeadAfterCooldown', async () => {
        vi.useFakeTimers();
        const { result } = await mount();
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page(['c'], 'cursor-c'))
            .mockRejectedValueOnce(new Error('limited', { cause: { response: { status: 429, headers: { 'retry-after': '5' } } } }));
        await act(async () => { reconnect(); });
        await act(async () => { reconnect(); });
        expect(messageApi.getMessages).toHaveBeenCalledTimes(3);
        act(() => { vi.advanceTimersByTime(5000); });
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page(['a', 'b', 'c', 'd']));
        await act(async () => { result.current.continueRecovery(); });
        // A new socket generation may have missed messages above the old recovered head.
        expect(messageApi.getMessages).toHaveBeenLastCalledWith('recovery-room');
        expect(result.current.messages.map(m => m.id)).toEqual(['a', 'b', 'c', 'd']);
    });
    it('reconnect_supersedesPendingOlderPage_doesNotBlockFurtherPaging', async () => {
        const { result } = await mount();
        const old = deferred();
        vi.mocked(messageApi.getMessages).mockReturnValueOnce(old.promise);
        act(() => { void result.current.loadOlder(); });
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page(['a', 'b']));
        await act(async () => { reconnect(); });
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page(['0']));
        await act(async () => { await result.current.loadOlder(); });
        expect(result.current.messages.map(m => m.id)).toEqual(['0', 'a', 'b']);
        await act(async () => { old.resolve(page(['stale-older'])); });
        expect(result.current.messages.some(m => m.id === 'stale-older')).toBe(false);
    });
    it('reconnect_repeatedCursor_stopsWithoutLoop', async () => {
        const { result } = await mount();
        vi.mocked(messageApi.getMessages).mockResolvedValue(page(['c'], 'same'));
        await act(async () => { reconnect(); });
        expect(result.current.recovery).toBe('error');
        expect(messageApi.getMessages).toHaveBeenCalledTimes(3);
    });
    it.each([401, 403, 404])('reconnect_denied%s_stopsRecovery', async status => {
        const { result } = await mount();
        vi.mocked(messageApi.getMessages).mockRejectedValueOnce(new Error('denied', { cause: { response: { status } } }));
        await act(async () => { reconnect(); });
        expect(result.current.recovery).toBe('stopped');
        await act(async () => { result.current.continueRecovery(); reconnect(); });
        expect(messageApi.getMessages).toHaveBeenCalledTimes(2);
    });
    it.each(['room', 'account', 'logout', 'reconnect', 'cache-reset'])('reconnect_staleGeneration_%s_dropsResponse', async change => {
        const { result, rerender } = await mount();
        const old = deferred();
        vi.mocked(messageApi.getMessages).mockReturnValueOnce(old.promise);
        await act(async () => { reconnect(); });
        if (change === 'room') rerender({ room: 'other-room' });
        if (change === 'account') { identity.user = { id: 'u2', name: 'Bob' }; rerender({ room: 'recovery-room' }); }
        if (change === 'logout') { identity.user = null; resetRoomMessageCache(); rerender({ room: 'recovery-room' }); }
        if (change === 'cache-reset') resetRoomMessageCache();
        if (change === 'reconnect') await act(async () => { reconnect(); });
        await act(async () => { old.resolve(page(['private-old-response'])); });
        expect(result.current.messages.some(m => m.id === 'private-old-response')).toBe(false);
    });
    it('reconnect_againDuringGap_keepsOriginalAnchor', async () => {
        const { result } = await mount();
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page(['d'], 'cursor-d')).mockRejectedValueOnce(new Error('offline'));
        await act(async () => { reconnect(); });
        act(() => { transport.subscribeRoom.mock.calls.at(-1)![1]({ ...saved('e'), isOwn: false }); });
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page(['e'], 'cursor-e')).mockResolvedValueOnce(page(['a', 'b', 'c', 'd']));
        await act(async () => { reconnect(); });
        expect(result.current.messages.map(m => m.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    });
    it('reconnect_emptyInitialHistory_initializesOlderCursor', async () => {
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page([]));
        const { result } = await mount();
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page(['z'], 'older-z'));
        await act(async () => { reconnect(); });
        expect(result.current.nextCursor).toBe('older-z');
        expect(messageApi.getMessages).toHaveBeenCalledTimes(2);
    });
    it('reconnect_pendingInitialRequest_cannotOverwriteRecoveryCursor', async () => {
        const initial = deferred();
        vi.mocked(messageApi.getMessages).mockReturnValueOnce(initial.promise);
        const { result } = await mount();
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page(['z'], 'older-z'));
        await act(async () => { reconnect(); });
        await act(async () => { initial.resolve(page(['stale'], 'stale-cursor')); });
        expect(result.current.messages.map(m => m.id)).toEqual(['z']);
        expect(result.current.nextCursor).toBe('older-z');
    });
    it('reconnect_anchorMissing_exhaustsHistoryAndPreservesLoadedOlderPages', async () => {
        const { result } = await mount();
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page(['0']));
        await act(async () => { await result.current.loadOlder(); });
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page(['c'], 'cursor-c')).mockResolvedValueOnce(page(['b']));
        await act(async () => { reconnect(); });
        expect(result.current.messages.map(m => m.id)).toEqual(['0', 'a', 'b', 'c']);
        expect(result.current.recovery).toBe('idle');
    });
    it('reconnect_liveAndResponseInSameTurn_preservesCacheOnReopen', async () => {
        const hook = await mount();
        const response = deferred();
        vi.mocked(messageApi.getMessages).mockReturnValueOnce(response.promise);
        await act(async () => { reconnect(); });
        await act(async () => {
            transport.subscribeRoom.mock.calls.at(-1)![1]({ ...saved('c'), isOwn: false });
            response.resolve(page(['a', 'b']));
        });
        expect(hook.result.current.messages.map(m => m.id)).toEqual(['a', 'b', 'c']);
        hook.unmount();
        const reopened = await mount();
        expect(reopened.result.current.messages.map(m => m.id)).toEqual(['a', 'b', 'c']);
    });
    it('reconnect_lateWriteBehindAnchor_isOutsideCurrentRecoveryContract', async () => {
        const { result } = await mount();
        // A write committed later with an earlier app timestamp is behind the overlap.
        vi.mocked(messageApi.getMessages).mockResolvedValueOnce(page(['a', 'b'], 'late-write-behind-a'))
            .mockResolvedValueOnce({ ...page([]), data: { messages: [{ ...saved('late-behind'), createdAt: '2026-10-09T09:00:00Z' }], nextCursor: null, hasMore: false } });
        await act(async () => { reconnect(); });
        expect(result.current.messages.map(m => m.id)).toEqual(['a', 'b']);
        expect(messageApi.getMessages).toHaveBeenCalledTimes(2);
    });
});
