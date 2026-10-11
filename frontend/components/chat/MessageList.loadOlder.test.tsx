import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import MessageList from './MessageList';
import { useRoomMessages } from '@/hooks/useRoomMessage';
import { messageApi } from '@/lib/api/messageApi';
import { ApiResponse, Message, MessagePageResponse, MessageResponse } from '@/lib/types';
import { MessageType } from '@/lib/types/entities/chat/enums';

const transport = vi.hoisted(() => ({
    connected: true, connecting: false,
    sendMessage: vi.fn(() => true),
    subscribeRoom: vi.fn<(roomId: string, onMessage: (message: Message) => void) => () => void>(() => () => {}),
    subscribeErrors: vi.fn(() => () => {}),
    onReconnect: vi.fn<(listener: () => void) => () => void>(() => () => {}),
    getLastReconnectAt: vi.fn(() => 0),
}));
vi.mock('@/hooks/useWebSocket', () => ({ useWebSocket: () => transport }));
vi.mock('@/lib/stores/authStore', () => ({ useAuthStore: () => ({ user: { id: 'u1', name: 'Alice' } }) }));
vi.mock('@/lib/api/messageApi', () => ({ messageApi: { getMessages: vi.fn() } }));

beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const message = (id: string, createdAt: string, chatRoomId = 'r1'): MessageResponse => ({
    id, chatRoomId, senderId: 'u2', type: MessageType.TEXT, content: `text ${id}`,
    createdAt, updatedAt: '', isUpdated: false, isDeleted: false,
});
const page = (messages: MessageResponse[], nextCursor: string | null): ApiResponse<MessagePageResponse> =>
    ({ success: true, data: { messages, nextCursor, hasMore: nextCursor !== null } });

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

const endRef = createRef<HTMLDivElement>();
function Room({ roomId }: { roomId: string }) {
    const room = useRoomMessages(roomId);
    return (
        <MessageList messages={room.messages} onlineUsers={new Set()} formatDate={() => 'Today'}
            formatTime={() => '10:00'} messagesEndRef={endRef} loading={room.loading} error={room.error}
            hasMore={room.hasMoreMessages} loadingOlder={room.loadingOlder} olderError={room.olderError}
            onLoadOlder={room.loadOlder} />
    );
}
const scroller = () => screen.getByRole('log', { name: 'Messages' }).parentElement as HTMLElement;

describe('load older messages', () => {
    let sequence = 0;
    const getMessages = vi.mocked(messageApi.getMessages);
    beforeEach(() => { getMessages.mockReset(); });

    it('scrollTop_hasMore_requestsOlderPageOnce', async () => {
        const roomId = `older-room-${++sequence}`;
        const older = deferred<ApiResponse<MessagePageResponse>>();
        getMessages
            .mockResolvedValueOnce(page([message('s2', '2026-10-09T10:01:00Z')], 'c1'))
            .mockReturnValueOnce(older.promise);
        render(<Room roomId={roomId} />);
        await act(async () => {});

        fireEvent.scroll(scroller());
        fireEvent.scroll(scroller());
        expect(getMessages).toHaveBeenCalledTimes(2);
        expect(getMessages).toHaveBeenLastCalledWith(roomId, { before: 'c1' });
        expect(screen.getByRole('status')).toHaveTextContent('Loading older messages');

        await act(async () => { older.resolve(page([message('s1', '2026-10-09T10:00:00Z')], null)); });
        const log = screen.getByRole('log', { name: 'Messages' });
        expect(log.textContent?.indexOf('text s1')).toBeLessThan(log.textContent?.indexOf('text s2') ?? -1);
        expect(screen.getByText('Beginning of conversation')).toBeInTheDocument();
        fireEvent.scroll(scroller());
        expect(getMessages).toHaveBeenCalledTimes(2);
    });

    it('loadOlder_roomSwitched_ignoresLateResponse', async () => {
        const roomA = `older-room-${++sequence}`;
        const roomB = `older-room-${++sequence}`;
        const lateA = deferred<ApiResponse<MessagePageResponse>>();
        getMessages
            .mockResolvedValueOnce(page([message('a1', '2026-10-09T10:00:00Z', roomA)], 'cA'))
            .mockReturnValueOnce(lateA.promise)
            .mockResolvedValueOnce(page([message('b1', '2026-10-09T11:00:00Z', roomB)], 'cB'))
            .mockResolvedValueOnce(page([message('b0', '2026-10-09T10:30:00Z', roomB)], null));
        const { result, rerender } = renderHook(({ room }) => useRoomMessages(room), { initialProps: { room: roomA } });
        await act(async () => {});
        act(() => { void result.current.loadOlder(); });
        expect(result.current.loadingOlder).toBe(true);

        await act(async () => { rerender({ room: roomB }); });
        await act(async () => { lateA.resolve(page([message('a0', '2026-10-09T09:00:00Z', roomA)], null)); });
        expect(result.current.messages.map(m => m.id)).toEqual(['b1']);
        expect(result.current).toMatchObject({ loadingOlder: false, nextCursor: 'cB', hasMoreMessages: true });

        // The new room is not blocked by the old room's request.
        await act(async () => { await result.current.loadOlder(); });
        expect(getMessages).toHaveBeenLastCalledWith(roomB, { before: 'cB' });
        expect(result.current.messages.map(m => m.id)).toEqual(['b0', 'b1']);
    });

    it('render_loadOlderError_showsRetry', async () => {
        const roomId = `older-room-${++sequence}`;
        getMessages
            .mockResolvedValueOnce(page([message('s2', '2026-10-09T10:01:00Z')], 'c1'))
            .mockRejectedValueOnce(new Error('Network Error'))
            .mockResolvedValueOnce(page([message('s1', '2026-10-09T10:00:00Z')], null));
        render(<Room roomId={roomId} />);
        await act(async () => {});
        await act(async () => { fireEvent.scroll(scroller()); });

        expect(screen.getByRole('alert')).toHaveTextContent('Could not load older messages: Network Error');
        fireEvent.scroll(scroller());
        expect(getMessages).toHaveBeenCalledTimes(2);

        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
        expect(getMessages).toHaveBeenLastCalledWith(roomId, { before: 'c1' });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByRole('log', { name: 'Messages' })).toHaveTextContent('text s1');
    });
});
