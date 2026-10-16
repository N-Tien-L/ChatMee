import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

afterEach(cleanup);

describe('EmptyState', () => {
    it('render_titleDescriptionAction_showsAll', () => {
        render(<EmptyState title="No rooms yet" description="Create one." action={<button>Create</button>} />);
        expect(screen.getByRole('heading', { name: 'No rooms yet' })).toBeInTheDocument();
        expect(screen.getByText('Create one.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    });
});
