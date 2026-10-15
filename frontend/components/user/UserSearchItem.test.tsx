import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import UserSearchItem from './UserSearchItem';

afterEach(cleanup);

const bob = { id: 'u2', name: 'Bob', avatarUrl: '' };

describe('UserSearchItem', () => {
    it('block_withOnBlock_callsBlockWithoutTheMainAction', () => {
        const onAdd = vi.fn();
        const onBlock = vi.fn();
        render(<UserSearchItem user={bob} onAdd={onAdd} isAdded={false} actionLabel="Message" onBlock={onBlock} />);

        fireEvent.click(screen.getByRole('button', { name: 'Block Bob' }));

        expect(onBlock).toHaveBeenCalledTimes(1);
        expect(onAdd).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Message Bob' })).toBeInTheDocument();
    });

    it('render_withoutOnBlock_hasNoBlockAction', () => {
        render(<UserSearchItem user={bob} onAdd={vi.fn()} isAdded={false} />);
        expect(screen.queryByRole('button', { name: 'Block Bob' })).toBeNull();
    });
});
