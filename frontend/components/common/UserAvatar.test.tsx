import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { UserAvatar } from './UserAvatar';

afterEach(cleanup);

describe('UserAvatar', () => {
    it('render_withoutAvatarUrl_showsInitials', () => {
        render(<UserAvatar name="Ada Lovelace" />);
        expect(screen.getByText('AL')).toBeInTheDocument();
    });

    it('render_singleWordName_showsOneInitial', () => {
        render(<UserAvatar name="ada" />);
        expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('render_neutralVariant_showsNoInitialsAndLabelsDeletedUser', () => {
        render(<UserAvatar name="Deleted user" variant="neutral" />);
        expect(screen.queryByText('DU')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Deleted user')).toBeInTheDocument();
    });

    it('render_missingName_fallsBackToQuestionMark', () => {
        render(<UserAvatar name={undefined} />);
        expect(screen.getByText('?')).toBeInTheDocument();
    });
});
