import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUsersStore } from '@/lib/stores/usersStore';
import UserSearchList from './UserSearchList';

const originalFetch = useUsersStore.getState().fetchUsers;
const person = { id: 'person-1', name: 'Bob Tran', avatarUrl: '' };

beforeEach(() => {
  useUsersStore.setState({
    users: [person], filteredUsers: [person], searchQuery: 'Bob',
    loading: false, error: null, fetchUsers: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  useUsersStore.setState({ fetchUsers: originalFetch });
});

describe('UserSearchList loading feedback', () => {
  it('search_refresh_keepsExistingRowMountedWithoutFlashingSkeletons', () => {
    const { container } = render(<UserSearchList onUserAdd={vi.fn()} actionLabel="Message" />);
    const row = screen.getByRole('button', { name: 'Message Bob Tran' });

    act(() => useUsersStore.setState({ searchQuery: 'Bobb', loading: true }));

    expect(screen.getByRole('button', { name: 'Message Bob Tran' })).toBe(row);
    expect(row).toBeDisabled();
    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Searching users' })).toBeInTheDocument();

    act(() => useUsersStore.setState({ loading: false }));
    expect(screen.getByRole('button', { name: 'Message Bob Tran' })).toBe(row);
    expect(row).toBeEnabled();
  });

  it('search_emptyResults_doesNotFlashSkeletonsDuringEachRequest', () => {
    useUsersStore.setState({ users: [], filteredUsers: [], loading: true });
    const { container } = render(<UserSearchList onUserAdd={vi.fn()} />);

    expect(container.querySelector('.animate-pulse')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Searching users' })).toBeInTheDocument();
    expect(screen.getByText(/No users found matching/)).toBeInTheDocument();
  });
});
