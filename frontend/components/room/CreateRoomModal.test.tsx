import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CreateRoomModal } from './CreateRoomModal';
import { useChatRoomsStore } from '@/lib/stores/chatRoomsStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { RoomType } from '@/lib/types';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
    push.mockReset();
    useAuthStore.setState({ user: { id: 'u1', name: 'Nguyen Van A', avatarUrl: '' } } as never);
    useChatRoomsStore.setState({ rooms: [], createRoom: vi.fn().mockResolvedValue(null) } as never);
});
afterEach(cleanup);

describe('CreateRoomModal', () => {
    it('render_detailsStep_showsNoUnsupportedSettings', () => {
        render(<CreateRoomModal isOpen onClose={vi.fn()} />);

        expect(screen.queryByText(/welcome message/i)).toBeNull();
        expect(screen.queryByText(/file sharing/i)).toBeNull();
        expect(screen.queryByText(/moderation/i)).toBeNull();
        expect(screen.queryByText(/guest/i)).toBeNull();
        expect(screen.queryByRole('button', { name: /more options/i })).toBeNull();
        expect(screen.queryByRole('checkbox')).toBeNull();
    });

    it('create_publicRoom_sendsOnlySupportedOptions', async () => {
        const createRoom = vi.fn().mockResolvedValue({ id: 'created-1' });
        useChatRoomsStore.setState({ createRoom } as never);
        render(<CreateRoomModal isOpen onClose={vi.fn()} />);

        fireEvent.change(screen.getByLabelText('Room name'), { target: { value: '  weekend-hike ' } });
        fireEvent.click(screen.getByText('Public'));
        fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'Trails' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create room' }));

        await waitFor(() => expect(createRoom).toHaveBeenCalledTimes(1));
        expect(createRoom).toHaveBeenCalledWith({
            roomName: 'weekend-hike',
            description: 'Trails',
            roomType: RoomType.PUBLIC,
            maxUsers: 50,
        });
        expect(createRoom.mock.calls[0][0]).not.toHaveProperty('settings');
        await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard?roomId=created-1', { scroll: false }));
    });
});
