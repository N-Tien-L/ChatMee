import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { InboxDialog } from './InboxDialog';
import { useInboxStore } from '@/lib/stores/inboxStore';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const person = { id: 'u2', name: 'Lan', avatarUrl: '' };
const invitation = {
    id: 'i1', room: { id: 'r1', name: 'guild', memberCount: 3 }, inviter: person, invitee: { id: 'me', name: 'Me', avatarUrl: '' },
    createdAt: '2026-10-15T00:00:00Z', expiresAt: '2026-10-22T00:00:00Z',
};
const request = { roomId: 'dm1', sender: person, preview: 'Hi, about the meetup', createdAt: '2026-10-15T00:00:00Z', expiresAt: '2026-10-29T00:00:00Z' };

beforeEach(() => {
    push.mockClear();
    useInboxStore.setState({
        invitations: [invitation], requests: [request], loading: false, error: null, isOpen: true, pending: [],
        fetchInbox: vi.fn().mockResolvedValue(undefined),
    });
});
afterEach(cleanup);

const section = (name: RegExp) => screen.getByRole('region', { name });

describe('InboxDialog', () => {
    it('render_dmRequestWithMessage_showsSenderAndFirstMessagePreview', () => {
        render(<InboxDialog />);
        const requests = section(/Message requests/);
        expect(within(requests).getByText('Lan')).toBeInTheDocument();
        expect(within(requests).getByText(/Hi, about the meetup/)).toBeInTheDocument();
    });

    it('render_dmRequestWithoutMessage_showsWantsToMessageYou', () => {
        useInboxStore.setState({ requests: [{ ...request, preview: null }] });
        render(<InboxDialog />);
        expect(screen.getByText(/Wants to message you/)).toBeInTheDocument();
    });

    it('acceptRequest_success_closesInboxAndOpensTheRoom', async () => {
        const acceptRequest = vi.fn().mockResolvedValue('dm1');
        useInboxStore.setState({ acceptRequest });
        render(<InboxDialog />);

        fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

        await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard?roomId=dm1', { scroll: false }));
        expect(acceptRequest).toHaveBeenCalledWith('dm1');
        expect(useInboxStore.getState().isOpen).toBe(false);
    });

    it('acceptRequest_failure_staysOnInboxWithoutNavigating', async () => {
        const acceptRequest = vi.fn().mockResolvedValue(null);
        useInboxStore.setState({ acceptRequest });
        render(<InboxDialog />);

        fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

        await waitFor(() => expect(acceptRequest).toHaveBeenCalled());
        expect(push).not.toHaveBeenCalled();
        expect(useInboxStore.getState().isOpen).toBe(true);
    });

    it('declineRequest_click_callsDeclineAndRemovesTheItem', async () => {
        const declineRequest = vi.fn(async (roomId: string) => {
            useInboxStore.setState((state) => ({ requests: state.requests.filter((r) => r.roomId !== roomId) }));
        });
        useInboxStore.setState({ declineRequest });
        render(<InboxDialog />);

        fireEvent.click(within(section(/Message requests/)).getByRole('button', { name: 'Decline' }));

        expect(declineRequest).toHaveBeenCalledWith('dm1');
        await waitFor(() => expect(screen.queryByText(/Hi, about the meetup/)).toBeNull());
        expect(push).not.toHaveBeenCalled();
    });

    it('acceptInvitation_success_opensTheRoom', async () => {
        const acceptInvitation = vi.fn().mockResolvedValue('r1');
        useInboxStore.setState({ acceptInvitation });
        render(<InboxDialog />);

        fireEvent.click(screen.getByRole('button', { name: 'Join' }));

        await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard?roomId=r1', { scroll: false }));
        expect(acceptInvitation).toHaveBeenCalledWith('i1');
    });

    it('declineInvitation_click_callsDecline', () => {
        const declineInvitation = vi.fn().mockResolvedValue(undefined);
        useInboxStore.setState({ declineInvitation });
        render(<InboxDialog />);

        fireEvent.click(within(section(/Room invitations/)).getByRole('button', { name: 'Decline' }));

        expect(declineInvitation).toHaveBeenCalledWith('i1');
    });

    it('render_itemInFlight_disablesOnlyItsButtons', () => {
        useInboxStore.setState({ pending: ['dm1'] });
        render(<InboxDialog />);
        expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled();
    });
});
