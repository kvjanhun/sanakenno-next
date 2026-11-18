import { useRef } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useScrollBoundaryGuard } from '../../packages/web/src/features/gameplay/useScrollBoundaryGuard.js';

function ScrollGuardHarness() {
  const rootRef = useRef<HTMLDivElement>(null);
  useScrollBoundaryGuard(rootRef);
  return (
    <div ref={rootRef} data-testid="scroll-root">
      <div data-testid="inner-scroller" style={{ overflowY: 'auto' }}>
        Content
      </div>
    </div>
  );
}

function dispatchTouch(target: EventTarget, type: string, clientX: number, clientY: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', {
    value: {
      length: 1,
      item: (index: number) => (index === 0 ? { clientX, clientY } : null),
    },
  });
  target.dispatchEvent(event);
  return event;
}

function setScrollGeometry(
  el: HTMLElement,
  geometry: { scrollHeight: number; clientHeight: number; scrollTop: number },
) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: geometry.scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: geometry.clientHeight });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    writable: true,
    value: geometry.scrollTop,
  });
}

describe('useScrollBoundaryGuard', () => {
  it('blocks vertical pull on non-scrollable targets while allowing horizontal swipes', () => {
    const { getByTestId } = render(<ScrollGuardHarness />);
    const root = getByTestId('scroll-root');
    const scroller = getByTestId('inner-scroller');
    setScrollGeometry(root, { scrollHeight: 400, clientHeight: 400, scrollTop: 0 });
    setScrollGeometry(scroller, { scrollHeight: 200, clientHeight: 200, scrollTop: 0 });

    dispatchTouch(scroller, 'touchstart', 50, 100);
    // Horizontal swipe (|dx| > |dy|) is never blocked
    const horizontalMove = dispatchTouch(scroller, 'touchmove', 90, 105);
    expect(horizontalMove.defaultPrevented).toBe(false);

    // Vertical drag on non-scrollable container is prevented
    const verticalMove = dispatchTouch(scroller, 'touchmove', 90, 130);
    expect(verticalMove.defaultPrevented).toBe(true);

    dispatchTouch(scroller, 'touchend', 90, 130);
  });

  it('cancels overscroll at top and bottom boundaries while allowing mid-scroll gestures', () => {
    const { getByTestId } = render(<ScrollGuardHarness />);
    const scroller = getByTestId('inner-scroller');
    setScrollGeometry(scroller, { scrollHeight: 500, clientHeight: 200, scrollTop: 0 });

    // At top (scrollTop = 0): pulling down (deltaY > 0) triggers overscroll -> prevented
    dispatchTouch(scroller, 'touchstart', 50, 100);
    const pullDownAtTop = dispatchTouch(scroller, 'touchmove', 50, 125);
    expect(pullDownAtTop.defaultPrevented).toBe(true);

    // Pulling up (deltaY < 0) scrolls down into content -> allowed
    const scrollDownFromTop = dispatchTouch(scroller, 'touchmove', 50, 95);
    expect(scrollDownFromTop.defaultPrevented).toBe(false);

    // Mid-scroll (scrollTop = 100): pulling either direction is allowed
    scroller.scrollTop = 100;
    const midPullDown = dispatchTouch(scroller, 'touchmove', 50, 115);
    expect(midPullDown.defaultPrevented).toBe(false);

    // At bottom (scrollTop = 300 = 500 - 200): dragging up (deltaY < 0) overscrolls -> prevented
    scroller.scrollTop = 300;
    const dragUpAtBottom = dispatchTouch(scroller, 'touchmove', 50, 90);
    expect(dragUpAtBottom.defaultPrevented).toBe(true);
  });
});
