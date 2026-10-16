import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { UnreadBadge } from './UnreadBadge';

afterEach(cleanup);

describe('UnreadBadge', () => {
    it('render_countZero_rendersNothing', () => {
        const { container } = render(<UnreadBadge count={0} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('render_smallCount_showsExactCount', () => {
        render(<UnreadBadge count={7} />);
        expect(screen.getByText('7')).toBeInTheDocument();
    });

    it('render_count99_showsExactCount', () => {
        render(<UnreadBadge count={99} />);
        expect(screen.getByText('99')).toBeInTheDocument();
    });

    it('render_countAbove99_capsAt99Plus', () => {
        render(<UnreadBadge count={250} />);
        expect(screen.getByText('99+')).toBeInTheDocument();
        expect(screen.getByLabelText('250 unread messages')).toBeInTheDocument();
    });
});
