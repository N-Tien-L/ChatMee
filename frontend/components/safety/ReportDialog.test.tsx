import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { ReportDialog, REPORT_NOTE_MAX } from './ReportDialog';
import { reportApi } from '@/lib/api/reportApi';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api/reportApi', () => ({ reportApi: { create: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const send = () => screen.getByRole('button', { name: 'Send report' });

describe('ReportDialog', () => {
    it('submit_noReason_isDisabled', () => {
        render(<ReportDialog target={{ type: 'USER', id: 'u2', label: 'Bob' }} onClose={vi.fn()} />);
        expect(screen.getByRole('dialog', { name: 'Report Bob' })).toBeInTheDocument();
        expect(send()).toBeDisabled();
    });

    it('note_over500Characters_showsErrorAndBlocksSubmit', () => {
        render(<ReportDialog target={{ type: 'USER', id: 'u2' }} onClose={vi.fn()} />);
        fireEvent.click(screen.getByLabelText('Spam'));
        fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'x'.repeat(REPORT_NOTE_MAX + 1) } });

        expect(screen.getByText(/Keep the note to 500 characters/)).toBeInTheDocument();
        expect(screen.getByLabelText('Note (optional)')).toHaveAttribute('aria-invalid', 'true');
        expect(send()).toBeDisabled();

        fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'x'.repeat(REPORT_NOTE_MAX) } });
        expect(send()).not.toBeDisabled();
    });

    it.each([
        ['USER', 'u2'],
        ['MESSAGE', 'm7'],
        ['ROOM', 'r1'],
    ] as const)('submit_%sTarget_postsTargetReasonAndNote', async (type, id) => {
        vi.mocked(reportApi.create).mockResolvedValue(undefined);
        const onClose = vi.fn();
        render(<ReportDialog target={{ type, id }} onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('Harassment'));
        fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: '  rude  ' } });
        fireEvent.click(send());

        await waitFor(() =>
            expect(reportApi.create).toHaveBeenCalledWith({ targetType: type, targetId: id, reason: 'HARASSMENT', note: 'rude' })
        );
        expect(toast.success).toHaveBeenCalledWith('Thanks. Your report was sent.');
        expect(onClose).toHaveBeenCalled();
    });

    it('submit_emptyNote_omitsNote', async () => {
        vi.mocked(reportApi.create).mockResolvedValue(undefined);
        render(<ReportDialog target={{ type: 'ROOM', id: 'r1' }} onClose={vi.fn()} />);
        fireEvent.click(screen.getByLabelText('Something else'));
        fireEvent.click(send());
        await waitFor(() => expect(reportApi.create).toHaveBeenCalledWith({ targetType: 'ROOM', targetId: 'r1', reason: 'OTHER' }));
    });

    it('submit_serverError_showsErrorToastAndStaysOpen', async () => {
        vi.mocked(reportApi.create).mockRejectedValue(new Error('Too many reports today'));
        const onClose = vi.fn();
        render(<ReportDialog target={{ type: 'USER', id: 'u2' }} onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('Spam'));
        fireEvent.click(send());
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Too many reports today'));
        expect(onClose).not.toHaveBeenCalled();
    });
});
