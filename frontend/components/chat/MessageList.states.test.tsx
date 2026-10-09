import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React, { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { Message } from '@/lib/types';
import { MessageType } from '@/lib/types/entities/chat/enums';

beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const props = {
    onlineUsers: new Set<string>(),
    formatDate: () => 'Today',
    formatTime: () => '10:00',
    messagesEndRef: createRef<HTMLDivElement>(),
};

const failed: Message = {
    id: 'optimistic-t1', tempId: 't1', chatRoomId: 'r1', senderId: 'u1', type: MessageType.TEXT,
    content: 'hello', createdAt: '2026-10-09T10:00:00Z', updatedAt: '', isUpdated: false, isDeleted: false,
    isOwn: true, isOptimistic: true, status: 'failed', errorMessage: 'Too many messages. Try again in 3 s',
};

describe('MessageList states', () => {
    it('render_loadingWithoutMessages_showsBusyStatus', () => {
        render(<MessageList {...props} messages={[]} loading />);
        expect(screen.getByRole('status', { name: 'Loading messages' })).toHaveAttribute('aria-busy', 'true');
    });

    it('render_loadError_showsErrorAndRetryCallsHandler', () => {
        const onRetryLoad = vi.fn();
        render(<MessageList {...props} messages={[]} error="Network Error" onRetryLoad={onRetryLoad} />);
        expect(screen.getByRole('alert')).toHaveTextContent('Network Error');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetryLoad).toHaveBeenCalledTimes(1);
    });

    it('render_noMessages_showsEmptyStateInsideLiveLog', () => {
        render(<MessageList {...props} messages={[]} />);
        const log = screen.getByRole('log', { name: 'Messages' });
        expect(log).toHaveAttribute('aria-live', 'polite');
        expect(log).toHaveTextContent('No messages yet');
    });

    it('render_failedMessage_showsServerTextResendAndDiscard', () => {
        const onResend = vi.fn();
        const onDiscard = vi.fn();
        render(<MessageList {...props} messages={[failed]} onResend={onResend} onDiscard={onDiscard} />);
        expect(screen.getByText('Too many messages. Try again in 3 s')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Resend' }));
        fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
        expect(onResend).toHaveBeenCalledWith('t1');
        expect(onDiscard).toHaveBeenCalledWith('t1');
    });

    it('render_failedMessageWhileDisconnected_resendDisabled', () => {
        render(<MessageList {...props} messages={[failed]} onResend={vi.fn()} canResend={false} />);
        expect(screen.getByRole('button', { name: 'Resend' })).toBeDisabled();
    });
});

describe('MessageInput keyboard', () => {
    function setup(disabled = false) {
        const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
        render(<MessageInput value="hi" onChange={vi.fn()} onSubmit={onSubmit} disabled={disabled}
            sending={false} inputRef={createRef<HTMLTextAreaElement>()} />);
        return { onSubmit, input: screen.getByLabelText('Message') };
    }

    it('keyDown_enter_submits', () => {
        const { onSubmit, input } = setup();
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('keyDown_shiftEnter_doesNotSubmit', () => {
        const { onSubmit, input } = setup();
        fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('render_sendButton_hasAccessibleName', () => {
        setup(true);
        expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    });
});
