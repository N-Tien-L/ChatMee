import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InboxButton } from './InboxButton';
import { useInboxStore } from '@/lib/stores/inboxStore';
import { DmRequestResponse, InvitationResponse } from '@/lib/types';

beforeEach(() => {
    useInboxStore.setState({ invitations: [], requests: [], open: vi.fn() });
});
afterEach(cleanup);

describe('InboxButton', () => {
    it('render_noItems_showsPlainLabelWithoutCount', () => {
        render(<InboxButton />);
        expect(screen.getByRole('button', { name: 'Inbox' })).not.toHaveTextContent(/\d/);
    });

    it('render_invitationsAndRequests_showsTheirTotalCount', () => {
        useInboxStore.setState({
            invitations: [{ id: 'i1' } as InvitationResponse],
            requests: [{ roomId: 'dm1' } as DmRequestResponse, { roomId: 'dm2' } as DmRequestResponse],
        });
        render(<InboxButton />);
        expect(screen.getByRole('button', { name: 'Inbox, 3 waiting' })).toHaveTextContent('3');
    });

    it('click_opensTheInbox', () => {
        const open = vi.fn();
        useInboxStore.setState({ open });
        render(<InboxButton />);
        fireEvent.click(screen.getByRole('button', { name: 'Inbox' }));
        expect(open).toHaveBeenCalledTimes(1);
    });
});
