import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NewMessageDialog } from './NewMessageDialog';
import { useChatRoomsStore } from '@/lib/stores/chatRoomsStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { RoomType } from '@/lib/types';

const person = { id: 'u2', name: 'Bob Tran', avatarUrl: '' };

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/user/UserSearchList', () => ({
    default: ({ onUserAdd }: { onUserAdd: (user: typeof person) => void }) => (
        <button type="button" onClick={() => onUserAdd(person)}>Pick Bob</button>
    ),
}));

beforeEach(() => {
    useAuthStore.setState({ user: { id: 'u1', name: 'Nguyen Van A', avatarUrl: '' } } as never);
    useChatRoomsStore.setState({
        rooms: [],
        createRoom: vi.fn().mockResolvedValue(false),
    } as never);
});
afterEach(cleanup);

describe('NewMessageDialog', () => {
    it('start_newPerson_createsDirectMessageWithoutRoomName', async () => {
        const createRoom = vi.fn().mockResolvedValue(false);
        useChatRoomsStore.setState({ createRoom } as never);
        render(<NewMessageDialog isOpen onClose={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Pick Bob' }));

        await waitFor(() => expect(createRoom).toHaveBeenCalledTimes(1));
        expect(createRoom).toHaveBeenCalledWith({
            roomType: RoomType.DIRECT_MESSAGE,
            participantId: 'u2',
            maxUsers: 2,
        });
        expect(createRoom.mock.calls[0][0]).not.toHaveProperty('roomName');
    });
});
