import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { RoomInfoDialog } from './RoomInfoDialog';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/stores/authStore', () => ({ useAuthStore: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/api/chatRoomApi', () => ({
    chatRoomApi: {
        getChatRoomById: vi.fn().mockResolvedValue({
            success: true,
            data: {
                id: 'r1', name: 'Room', type: 'PUBLIC', createdBy: 'u1', createdAt: '2026-10-09T10:00:00Z',
                participants: ['u1', 'gone'],
            },
        }),
    },
}));
vi.mock('@/lib/api/userApi', () => ({
    userApi: {
        getUserById: vi.fn((id: string) => Promise.resolve({
            success: true,
            data: id === 'u1' ? { id: 'u1', name: 'Alice', avatarUrl: null } : { id, name: '', avatarUrl: 'x.png' },
        })),
    },
}));

afterEach(cleanup);

describe('RoomInfoDialog members', () => {
    it('render_memberWithoutName_showsDeletedUserWithNeutralAvatar', async () => {
        render(<RoomInfoDialog roomId="r1" isOpen onClose={() => {}} />);
        const avatar = await screen.findByRole('img', { name: 'Deleted user' });
        expect(screen.getByText('Deleted user')).toBeInTheDocument();
        expect(avatar.querySelector('.bg-muted')).not.toBeNull();
        expect(avatar.querySelector('img')).toBeNull();
        expect(screen.getByRole('img', { name: 'Alice' }).querySelector('.bg-muted')).toBeNull();
    });
});
