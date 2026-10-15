import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import ChatInterface from './ChatInterface';
import { useChatRoomsStore } from '@/lib/stores/chatRoomsStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { ChatRoom, Message, MessageType, RoomSettings, RoomType } from '@/lib/types';

// Sender view of a pending DM request (SPEC-009 AC-009-10/12, Reviewer B B-04).
const hook = vi.hoisted(() => ({ messages: [] as unknown[], sendMessage: vi.fn() }));

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/useRoomMessage', () => ({
    useRoomMessages: () => ({
        messages: hook.messages, connected: true, sendMessage: hook.sendMessage, resendMessage: vi.fn(), discardMessage: vi.fn(),
        reload: vi.fn(), loadOlder: vi.fn(), loading: false, error: null, hasMoreMessages: false,
        loadingOlder: false, olderError: null,
    }),
    useRoomMemberNames: () => ({}),
}));
vi.mock('@/hooks/useWebSocket', () => ({
    useWebSocket: () => ({ sendTyping: vi.fn(), subscribeTyping: () => () => {}, connected: true }),
}));
vi.mock('./MessageList', () => ({ default: () => null }));
vi.mock('./TypingIndicator', () => ({ default: () => null }));
vi.mock('@/components/room/RoomPanel', () => ({ RoomPanel: () => null }));

const dm = (overrides: Partial<ChatRoom> = {}): ChatRoom => ({
    id: 'dm1',
    roomName: '',
    displayName: 'Bob',
    roomType: RoomType.DIRECT_MESSAGE,
    createdAt: '2026-10-15T00:00:00Z',
    createdBy: 'me',
    maxUsers: 2,
    settings: {} as unknown as RoomSettings,
    participants: ['me'],
    counterpart: { id: 'u2', name: 'Bob', avatarUrl: '' },
    unreadCount: 0,
    state: 'REQUESTED',
    ...overrides,
});

const ownMessage = (status: Message['status']): Message => ({
    id: 'm1', chatRoomId: 'dm1', senderId: 'me', type: MessageType.TEXT, content: 'Hi Bob',
    createdAt: '2026-10-15T00:01:00Z', updatedAt: '2026-10-15T00:01:00Z', isUpdated: false, isDeleted: false, status,
});

const field = () => screen.getByRole('textbox', { name: 'Message' });
const send = () => screen.getByRole('button', { name: 'Send message' });
const type = (text: string) => fireEvent.change(field(), { target: { value: text } });

beforeEach(() => {
    hook.messages = [];
    hook.sendMessage.mockClear();
    useAuthStore.setState({ user: { id: 'me', name: 'Me', avatarUrl: '' } } as never);
    useChatRoomsStore.setState({ rooms: [dm()], filteredRooms: [], endedRooms: {}, activeRoomId: 'dm1' });
});
afterEach(cleanup);

describe('ChatInterface pending DM request (sender)', () => {
    it('render_requestedDm_showsWaitingBannerWithCounterpartName', () => {
        render(<ChatInterface roomId="dm1" />);
        expect(screen.getByText('Waiting for Bob to accept')).toBeInTheDocument();
    });

    it('send_requestedDmBeforeFirstMessage_allowsTheOneMessage', () => {
        render(<ChatInterface roomId="dm1" />);
        type('Hi Bob');
        expect(field()).toBeEnabled();
        expect(send()).toBeEnabled();
        fireEvent.click(send());
        expect(hook.sendMessage).toHaveBeenCalledWith('Hi Bob');
    });

    it('render_requestedDmWithOwnLastMessage_disablesInputAndExplains', () => {
        useChatRoomsStore.setState({
            rooms: [dm({ lastMessage: { id: 'm1', senderId: 'me', preview: 'Hi Bob', createdAt: '2026-10-15T00:01:00Z' } })],
        });
        render(<ChatInterface roomId="dm1" />);
        expect(field()).toBeDisabled();
        expect(send()).toBeDisabled();
        expect(screen.getByRole('status')).toHaveTextContent('Request sent. You can send more messages once Bob accepts.');
    });

    it('render_requestedDmWithOwnMessageStillSending_locksBeforeTheEcho', () => {
        hook.messages = [ownMessage('sending')];
        render(<ChatInterface roomId="dm1" />);
        expect(field()).toBeDisabled();
        expect(send()).toBeDisabled();
    });

    it('render_requestedDmWithOnlyFailedOwnMessage_keepsTheAllowance', () => {
        hook.messages = [ownMessage('failed')];
        render(<ChatInterface roomId="dm1" />);
        type('Hi again');
        expect(field()).toBeEnabled();
        expect(send()).toBeEnabled();
    });

    it('roomUpdatedActive_afterTheOneMessage_reenablesSending', async () => {
        hook.messages = [ownMessage('sent')];
        render(<ChatInterface roomId="dm1" />);
        expect(field()).toBeDisabled();

        await act(() =>
            useChatRoomsStore.getState().handleUserEvent({
                type: 'ROOM_UPDATED', payload: { room: dm({ state: 'ACTIVE', participants: ['me', 'u2'] }) }, occurredAt: '',
            })
        );

        expect(screen.queryByText('Waiting for Bob to accept')).toBeNull();
        type('Thanks for accepting');
        expect(field()).toBeEnabled();
        expect(send()).toBeEnabled();
        fireEvent.click(send());
        expect(hook.sendMessage).toHaveBeenCalledWith('Thanks for accepting');
    });

    it('render_activeDmWithHistory_isNotLocked', () => {
        useChatRoomsStore.setState({ rooms: [dm({ state: 'ACTIVE', lastMessage: { id: 'm1', senderId: 'me', preview: 'Hi', createdAt: '' } })] });
        hook.messages = [ownMessage('sent')];
        render(<ChatInterface roomId="dm1" />);
        expect(field()).toBeEnabled();
        expect(screen.queryByText(/Waiting for/)).toBeNull();
    });
});
