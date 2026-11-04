import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import ChatInterface from './ChatInterface';
import { useChatRoomsStore } from '@/lib/stores/chatRoomsStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { useDraftStore, resetDraftMemory } from '@/lib/stores/draftStore';
import { messageApi } from '@/lib/api/messageApi';
import { ChatRoom, Message, MessageType, RoomSettings, RoomType } from '@/lib/types';

const sendMessage = vi.fn();
let messages: Message[] = [];

vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/api/messageApi', () => ({ messageApi: { getContext: vi.fn(), getMessages: vi.fn() } }));
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
vi.mock('./TypingIndicator', () => ({ default: () => null }));
vi.mock('@/components/room/RoomPanel', () => ({ RoomPanel: () => null }));
// A stub list: one Reply and one Jump button per message, plus the focus request it was given.
vi.mock('./MessageList', () => ({
    default: (props: {
        messages: Message[]; onReply?: (m: Message) => void; onJumpToOriginal?: (id: string) => void;
        focusRequest?: { id: string } | null;
    }) => (
        <div data-testid="list" data-focus={props.focusRequest?.id ?? ''}>
            {props.messages.map((m) => (
                <div key={m.id}>
                    <span>{m.content}</span>
                    {props.onReply && <button onClick={() => props.onReply?.(m)}>{`reply ${m.id}`}</button>}
                    <button onClick={() => props.onJumpToOriginal?.(m.id)}>{`jump ${m.id}`}</button>
                </div>
            ))}
            <button onClick={() => props.onJumpToOriginal?.('far-away')}>jump far-away</button>
        </div>
    ),
}));

const room: ChatRoom = {
    id: 'r1', roomName: 'r1', roomType: RoomType.PUBLIC, createdAt: '2026-01-01T00:00:00Z', createdBy: 'me',
    maxUsers: 10, settings: {} as unknown as RoomSettings, participants: ['me', 'bob'], unreadCount: 0,
};
const msg = (id: string, content: string, extra: Partial<Message> = {}): Message => ({
    id, chatRoomId: 'r1', senderId: 'bob', senderName: 'Bob', type: MessageType.TEXT, content,
    createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', isUpdated: false, isDeleted: false, ...extra,
});
const field = () => screen.getByRole('textbox') as HTMLTextAreaElement;

beforeEach(() => {
    vi.clearAllMocks();
    messages = [msg('m1', 'original text')];
    sessionStorage.clear();
    resetDraftMemory();
    useDraftStore.setState({ texts: {} });
    useAuthStore.setState({ user: { id: 'me', name: 'Me', avatarUrl: '' } } as never);
    useChatRoomsStore.setState({ rooms: [room], filteredRooms: [], endedRooms: {} });
});
afterEach(() => cleanup());

describe('ChatInterface reply (SPEC-014)', () => {
    it('reply_chip_cancelAndKeepOnFailure', () => {
        sendMessage.mockReturnValue('t-1');
        const view = render(<ChatInterface roomId="r1" />);

        fireEvent.click(screen.getByText('reply m1'));
        expect(screen.getByText('Replying to Bob')).toBeInTheDocument();
        expect(field()).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
        expect(screen.queryByText('Replying to Bob')).toBeNull();

        // Escape in the composer cancels too.
        fireEvent.click(screen.getByText('reply m1'));
        fireEvent.keyDown(field(), { key: 'Escape' });
        expect(screen.queryByText('Replying to Bob')).toBeNull();

        fireEvent.click(screen.getByText('reply m1'));
        fireEvent.change(field(), { target: { value: 'my answer' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
        expect(sendMessage).toHaveBeenCalledWith('my answer', expect.objectContaining({
            messageId: 'm1', senderName: 'Bob', preview: 'original text', type: MessageType.TEXT,
        }));
        // Sending clears the chip.
        expect(screen.queryByText('Replying to Bob')).toBeNull();

        // The send fails: the chip comes back so the reply is not lost.
        messages = [...messages, msg('optimistic-t-1', 'my answer', {
            tempId: 't-1', senderId: 'me', isOwn: true, isOptimistic: true, status: 'failed',
        })];
        view.rerender(<ChatInterface roomId="r1" />);
        expect(screen.getByText('Replying to Bob')).toBeInTheDocument();
    });

    it('reply_confirmedSend_doesNotRestoreChip', () => {
        sendMessage.mockReturnValue('t-2');
        const view = render(<ChatInterface roomId="r1" />);
        fireEvent.click(screen.getByText('reply m1'));
        fireEvent.change(field(), { target: { value: 'ok' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
        messages = [...messages, msg('s2', 'ok', { tempId: 't-2', senderId: 'me', isOwn: true, status: 'sent' })];
        view.rerender(<ChatInterface roomId="r1" />);
        expect(screen.queryByText('Replying to Bob')).toBeNull();
    });

    it('reply_jumpLoaded_focusesWithoutRequest', () => {
        render(<ChatInterface roomId="r1" />);
        fireEvent.click(screen.getByText('jump m1'));
        expect(screen.getByTestId('list').dataset.focus).toBe('m1');
        expect(messageApi.getContext).not.toHaveBeenCalled();
    });

    it('reply_jumpUnloaded_loadsDetachedSegment', async () => {
        vi.mocked(messageApi.getContext).mockResolvedValue({
            success: true, message: 'ok',
            data: {
                messages: [msg('b1', 'before'), msg('far-away', 'the original'), msg('a1', 'after')],
                targetId: 'far-away', hasBefore: true, hasAfter: true, beforeCursor: 'c', afterCursor: 'd',
            },
        });
        render(<ChatInterface roomId="r1" />);

        await act(async () => { fireEvent.click(screen.getByText('jump far-away')); });

        expect(messageApi.getContext).toHaveBeenCalledWith('r1', 'far-away');
        // The segment replaces the live list rather than merging into it.
        expect(screen.getByText('the original')).toBeInTheDocument();
        expect(screen.queryByText('original text')).toBeNull();
        expect(screen.getByTestId('list').dataset.focus).toBe('far-away');
        expect(screen.getByText('Viewing an earlier part of the conversation.')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Jump to latest' }));
        expect(screen.getByText('original text')).toBeInTheDocument();
        expect(screen.queryByText('the original')).toBeNull();
        expect(screen.queryByText('Viewing an earlier part of the conversation.')).toBeNull();
    });

    it('reply_jumpToDeletedOriginal_showsUnavailableToast', async () => {
        const toast = (await import('react-hot-toast')).default;
        vi.mocked(messageApi.getContext).mockRejectedValue(
            Object.assign(new Error('Not found'), { cause: { response: { status: 404 } } }));
        render(<ChatInterface roomId="r1" />);

        await act(async () => { fireEvent.click(screen.getByText('jump far-away')); });

        expect(toast.error).toHaveBeenCalledWith('Original message unavailable');
        expect(screen.getByText('original text')).toBeInTheDocument();
    });
});
