import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RoomAvatar } from './RoomAvatar';

afterEach(cleanup);

describe('RoomAvatar', () => {
    it('render_withoutAvatarUrl_showsFirstLetterUppercased', () => {
        render(<RoomAvatar name="general" />);
        expect(screen.getByText('G')).toBeInTheDocument();
    });
});
