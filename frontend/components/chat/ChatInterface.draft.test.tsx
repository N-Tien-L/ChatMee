import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ChatInterface from './ChatInterface';
import { useChatRoomsStore } from '@/lib/stores/chatRoomsStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { useDraftStore, resetDraftMemory } from '@/lib/stores/draftStore';
import { ChatRoom, RoomSettings, RoomType } from '@/lib/types';

const sendMessage = vi.fn();
let messages: unknown[] = [];

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/useRoomMessage', () => ({
    useRoomMessages: () => ({
        messages, connected: true, sendMessage, resendMessage: vi.fn(), discardMessage: vi.fn(),
        reload: vi.fn(), loadOlder: vi.fn(), loading: false, error: null, hasMoreMessages: false,
        loadingOlder: false, olderError: null,
    }),
    useRoomMemberNames: () => ({}),
}));
vi.mock('@/hooks/useWebSocket', () => ({
    useWebSocket: () => ({ sendTyping: vi.fn(), subscribeTyping: () => () => {}, connected: true }),
}));
vi.mock('./ChatHeader', () => ({ default: () => null }));
vi.mock('./MessageList', () => ({ default: () => null }));
vi.mock('./TypingIndicator', () => ({ default: () => null }));
vi.mock('@/components/room/RoomPanel', () => ({ RoomPanel: () => null }));

const room = (id: string, blocked = false): ChatRoom => ({
    id,
    roomName: id,
    roomType: blocked ? RoomType.DIRECT_MESSAGE : RoomType.PUBLIC,
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'me',
    maxUsers: 10,
    settings: {} as unknown as RoomSettings,
    participants: ['me', 'bob'],
    counterpart: blocked ? { id: 'bob', name: 'Bob', avatarUrl: '' } : undefined,
    unreadCount: 0,
    blocked,
});

const KEY = (roomId: string) => `chatmee:draft:v1:me:${roomId}`;
const field = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const type = (text: string) => fireEvent.change(field(), { target: { value: text } });

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    messages = [];
    sessionStorage.clear();
    resetDraftMemory();
    useDraftStore.setState({ texts: {} });
    useAuthStore.setState({ user: { id: 'me', name: 'Me', avatarUrl: '' } } as never);
    useChatRoomsStore.setState({ rooms: [room('r1'), room('r2')], filteredRooms: [], endedRooms: {} });
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('ChatInterface drafts', () => {
    it('draft_switchRooms_restoresText', () => {
        const view = render(<ChatInterface roomId="r1" />);
        type('half written');
        view.unmount();
        expect(sessionStorage.getItem(KEY('r1'))).not.toBeNull();

        render(<ChatInterface roomId="r2" />);
        expect(field().value).toBe('');
        cleanup();
        render(<ChatInterface roomId="r1" />);
        expect(field().value).toBe('half written');
    });

    it('draft_typing_writesAfterDebounce', () => {
        render(<ChatInterface roomId="r1" />);
        type('abc');
        expect(sessionStorage.getItem(KEY('r1'))).toBeNull();
        vi.advanceTimersByTime(300);
        expect(JSON.parse(sessionStorage.getItem(KEY('r1')) as string).text).toBe('abc');
    });

    it('draft_failedSend_keepsText', () => {
        sendMessage.mockReturnValue('t1');
        render(<ChatInterface roomId="r1" />);
        type('keep me');
        fireEvent.submit(field().closest('form') as HTMLFormElement);
        expect(sendMessage).toHaveBeenCalledWith('keep me');
        expect(field().value).toBe('');
        vi.advanceTimersByTime(1000);
        expect(JSON.parse(sessionStorage.getItem(KEY('r1')) as string).text).toBe('keep me');
    });

    it('draft_confirmedSend_clears', () => {
        sendMessage.mockReturnValue('t1');
        const view = render(<ChatInterface roomId="r1" />);
        type('sent text');
        fireEvent.submit(field().closest('form') as HTMLFormElement);
        messages = [{ id: 's1', tempId: 't1', status: 'sent', isOptimistic: false }];
        view.rerender(<ChatInterface roomId="r1" />);
        expect(sessionStorage.getItem(KEY('r1'))).toBeNull();
        expect(useDraftStore.getState().texts).toEqual({});
    });

    it('draft_accessLost_cleared', () => {
        useDraftStore.getState().save('me', 'r1', 'stale');
        useChatRoomsStore.setState({ rooms: [room('r1')], endedRooms: {} });
        const view = render(<ChatInterface roomId="r1" />);
        useChatRoomsStore.setState({ rooms: [], endedRooms: { r1: 'REMOVED' } });
        view.rerender(<ChatInterface roomId="r1" />);
        expect(sessionStorage.getItem(KEY('r1'))).toBeNull();
    });

    it('draft_blockedDm_cleared', () => {
        useDraftStore.getState().save('me', 'dm', 'stale');
        useChatRoomsStore.setState({ rooms: [room('dm', true)], endedRooms: {} });
        render(<ChatInterface roomId="dm" />);
        vi.advanceTimersByTime(500);
        expect(sessionStorage.getItem(KEY('dm'))).toBeNull();
    });
});
