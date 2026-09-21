import React, { useRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useDialogKeyboard } from './useDialogKeyboard';

function Dialog({ name, onClose, hidden = false }) {
  const dialogRef = useRef(null);
  useDialogKeyboard({ dialogRef, onClose });
  return <div ref={dialogRef} role="dialog" aria-label={name} tabIndex={-1}>
    <button>{name} first</button>
    <button>{name} last</button>
    {hidden && <div style={{ display: 'none' }}><button>Hidden control</button></div>}
  </div>;
}

describe('useDialogKeyboard', () => {
  it('uses the current visible controls and falls back to main when the initiator no longer exists', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<main><button>Open dialog</button></main>);
    screen.getByRole('button', { name: 'Open dialog' }).focus();
    rerender(<main><Dialog name="Details" hidden /></main>);
    expect(screen.getByRole('button', { name: 'Details first' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Details last' })).toHaveFocus();
    rerender(<main>Destination page</main>);
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
  });

  it('lets only the top dialog dismiss and restores focus to a still-open parent', async () => {
    const user = userEvent.setup();
    const closeParent = vi.fn();
    const closeChild = vi.fn();
    const { rerender } = render(<><Dialog name="Parent" onClose={closeParent} /></>);
    screen.getByRole('button', { name: 'Parent last' }).focus();
    rerender(<><Dialog name="Parent" onClose={closeParent} /><Dialog name="Child" onClose={closeChild} /></>);
    await user.keyboard('{Escape}');
    expect(closeChild).toHaveBeenCalledTimes(1);
    expect(closeParent).not.toHaveBeenCalled();
    rerender(<><Dialog name="Parent" onClose={closeParent} /></>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Parent last' })).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(closeParent).toHaveBeenCalledTimes(1);
  });
});
