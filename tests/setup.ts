import '@testing-library/jest-dom/vitest';

if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(
      this: HTMLDialogElement,
      returnValue?: string,
    ) {
      if (returnValue !== undefined) {
        this.returnValue = returnValue;
      }
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }

  // Polyfill browser top-layer Escape -> 'cancel' event dispatch on the topmost open <dialog> in jsdom
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const openDialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
    const topDialog = openDialogs[openDialogs.length - 1];
    if (!topDialog) return;
    e.preventDefault();
    const cancelEvent = new Event('cancel', { cancelable: true });
    const notCancelled = topDialog.dispatchEvent(cancelEvent);
    if (notCancelled) {
      topDialog.close();
    }
  });
}
