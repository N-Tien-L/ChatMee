import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MessageInput from './MessageInput';

afterEach(cleanup);

const renderInput = (value: string) => {
    const onChange = vi.fn();
    render(
        <MessageInput
            value={value}
            onChange={onChange}
            onSubmit={vi.fn()}
            disabled={false}
            inputRef={createRef<HTMLTextAreaElement>()}
        />
    );
    return { onChange, textarea: screen.getByPlaceholderText('Type a message...') as HTMLTextAreaElement };
};

describe('MessageInput length limit', () => {
    it('render_input_hasMaxLengthOf5000', () => {
        const { textarea } = renderInput('');
        expect(textarea).toHaveAttribute('maxLength', '5000');
    });

    it('render_shortMessage_hidesCounter', () => {
        renderInput('hello');
        expect(screen.queryByText(/\/ ?5000/)).not.toBeInTheDocument();
    });

    it('render_messageNearLimit_showsCounter', () => {
        renderInput('x'.repeat(4600));
        expect(screen.getByText('4600/5000')).toBeInTheDocument();
    });

    it('change_typingInput_reportsValueThroughOnChange', () => {
        const { onChange, textarea } = renderInput('');
        fireEvent.change(textarea, { target: { value: 'hi' } });
        expect(onChange).toHaveBeenCalledTimes(1);
    });
});
