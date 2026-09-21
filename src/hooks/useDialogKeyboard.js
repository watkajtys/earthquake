import { useLayoutEffect, useRef } from 'react';

const openDialogs = [];
const focusableSelector = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function focusableControls(dialog) {
  return [...dialog.querySelectorAll(focusableSelector)].filter(element => {
    if (element.matches(':disabled') || element.tabIndex < 0 || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (ancestor === dialog) break;
    }
    return true;
  });
}

// Each mounted dialog has one keyboard owner, including while its panel changes
// from loading to content. New callback identities never reset the user's focus.
export function useDialogKeyboard({ dialogRef, initialFocusRef, onClose, active = true }) {
  const latestClose = useRef(onClose);
  const lastDialog = useRef(null);
  const entry = useRef(null);
  useLayoutEffect(() => { latestClose.current = onClose; });

  useLayoutEffect(() => {
    if (!active) return;
    const parentDialog = openDialogs.at(-1);
    const dialogEntry = { returnFocus: [document.activeElement, ...(parentDialog?.returnFocus || [])] };
    entry.current = dialogEntry;
    openDialogs.push(dialogEntry);
    const handleKeyDown = event => {
      if (openDialogs.at(-1) !== dialogEntry || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) latestClose.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const controls = focusableControls(dialog);
      const first = controls[0];
      const last = controls.at(-1);
      const focused = document.activeElement;
      if (!first) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && (focused === first || !controls.includes(focused))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (focused === last || !controls.includes(focused))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      const index = openDialogs.indexOf(dialogEntry);
      if (index !== -1) openDialogs.splice(index, 1);
      entry.current = null;
      lastDialog.current = null;
      // Wait until removed panels and newly opened sibling dialogs settle.
      queueMicrotask(() => {
        if (openDialogs.length && openDialogs.at(-1) !== parentDialog) return;
        const previous = dialogEntry.returnFocus.find(element => element?.isConnected && element !== document.body && typeof element.focus === 'function');
        if (previous) previous.focus({ preventScroll: true });
        else {
          const main = document.querySelector('main');
          if (main) {
            if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
            main.focus({ preventScroll: true });
          }
        }
      });
    };
  }, [active, dialogRef]);

  useLayoutEffect(() => {
    if (!active || openDialogs.at(-1) !== entry.current) return;
    const dialog = dialogRef.current;
    if (!dialog || dialog === lastDialog.current) return;
    lastDialog.current = dialog;
    if (!dialog.contains(document.activeElement)) {
      const target = initialFocusRef?.current || focusableControls(dialog)[0] || dialog;
      target.focus({ preventScroll: true });
    }
  });
}
