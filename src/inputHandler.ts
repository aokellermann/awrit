import type { KeyEvent as KeyEventOriginal, TermEvent } from 'awrit-native-rs';
import type { WebContents } from 'electron';
import { handleEvent as handleKeyBinding } from './keybindings';
import { focusedView } from './windows';

const WHEEL_DELTA = 100;

// Scroll throttling configuration
const SCROLL_THROTTLE_MS = 16; // ~60fps

// Swipe gesture configuration
const SWIPE_THRESHOLD = 300; // Accumulated delta to trigger navigation
const SWIPE_TIMEOUT_MS = 500; // Reset swipe state after inactivity

// Scroll accumulator state
interface ScrollState {
  deltaY: number;
  x: number;
  y: number;
  modifiers: KeyEventModifiers;
  target: WebContents | null;
  scheduled: boolean;
}

// Swipe gesture state for back/forward navigation
interface SwipeState {
  deltaX: number;
  lastEventTime: number;
  triggered: boolean;
}

// this is a fix for Electron going back and forth on what's supported for modifiers, despite being case insensitive;
type KeyEventModifiers = Lowercase<KeyEventOriginal['modifiers'][number]>[];

const scrollState: ScrollState = {
  deltaY: 0,
  x: 0,
  y: 0,
  modifiers: [],
  target: null,
  scheduled: false,
};

const swipeState: SwipeState = {
  deltaX: 0,
  lastEventTime: 0,
  triggered: false,
};

// Multi-click detection configuration
const MULTI_CLICK_TIME_MS = 500; // Max time between clicks for multi-click
const MULTI_CLICK_DISTANCE_PX = 4; // Max distance between clicks for multi-click

// State for tracking multi-click sequences
interface ClickState {
  x: number;
  y: number;
  time: number;
  count: number;
  button: string;
  target: WebContents | null;
}

let lastClick: ClickState = {
  x: 0,
  y: 0,
  time: 0,
  count: 0,
  button: '',
  target: null,
};

function getClickCount(
  x: number,
  y: number,
  button: string,
  target: WebContents,
): number {
  const now = Date.now();
  const timeDelta = now - lastClick.time;
  const distance = Math.sqrt((x - lastClick.x) ** 2 + (y - lastClick.y) ** 2);

  let clickCount: number;
  if (
    timeDelta < MULTI_CLICK_TIME_MS &&
    distance < MULTI_CLICK_DISTANCE_PX &&
    button === lastClick.button &&
    target === lastClick.target
  ) {
    // Continuation of multi-click sequence
    clickCount = lastClick.count + 1;
  } else {
    // Start new click sequence
    clickCount = 1;
  }

  // Update state
  lastClick = {
    x,
    y,
    time: now,
    count: clickCount,
    button,
    target,
  };

  return clickCount;
}

function flushScroll() {
  if (scrollState.deltaY === 0 || !scrollState.target) {
    scrollState.scheduled = false;
    return;
  }

  scrollState.target.sendInputEvent({
    type: 'mouseWheel',
    wheelTicksY: 0,
    wheelTicksX: 0,
    deltaX: 0,
    deltaY: scrollState.deltaY,
    modifiers: scrollState.modifiers,
    x: scrollState.x,
    y: scrollState.y,
    hasPreciseScrollingDeltas: true,
    canScroll: true,
  });

  // Reset accumulator
  scrollState.deltaY = 0;
  scrollState.scheduled = false;
}

const mouseEventTypes = ['mouseDown', 'mouseUp', 'mouseMove'] as const;
type KeyEvent = Omit<KeyEventOriginal, 'modifiers'> & {
  modifiers: KeyEventModifiers;
};

function isSimpleMouseEvent(kind: unknown): kind is (typeof mouseEventTypes)[number] {
  return mouseEventTypes.includes(kind as (typeof mouseEventTypes)[number]);
}

export function handleInput(evt: TermEvent) {
  const view = focusedView.current;
  if (!view) {
    handleKeyBinding(evt);
    return;
  }

  switch (evt.eventType) {
    case 'key': {
      // First check if this is a keybinding
      if (handleKeyBinding(evt, view)) {
        return;
      }

      const webContents = view.focusedContent;
      const { code: keyCode, modifiers, down, isCharEvent } = evt.keyEvent as KeyEvent;

      if (isCharEvent && down) {
        webContents.sendInputEvent({
          type: 'rawKeyDown',
          keyCode,
          modifiers,
        });
        webContents.sendInputEvent({
          type: 'char',
          keyCode,
          modifiers,
        });
      } else {
        webContents.sendInputEvent({
          type: down ? 'keyDown' : 'keyUp',
          keyCode,
          modifiers,
        });
      }
      break;
    }

    case 'mouse': {
      const { kind, button, x, y, modifiers } = evt.mouseEvent;
      if (
        (kind === 'mouseUp' || kind === 'mouseDown') &&
        button &&
        ['fourth', 'fifth'].includes(button ?? '')
      ) {
        handleKeyBinding(evt, view);
        return;
      }

      const DPI_SCALE = view.layoutContainer.devicePixelRatio;
      const rawX = x ?? 0;
      const rawY = y ?? 0;

      // Determine which region we're in based on layout
      const { toolbarNode, contentNode } = view;
      const isInToolbar = rawY < contentNode.deviceLayout.y;

      // Calculate position relative to the target component
      const adjustedX = Math.floor(rawX / DPI_SCALE);
      const adjustedY = Math.floor(
        (rawY - (isInToolbar ? 0 : toolbarNode.deviceLayout.height)) / DPI_SCALE,
      );

      const focusedContent = isInToolbar ? view.toolbar.webContents : view.content.webContents;

      if (kind === 'scrollUp' || kind === 'scrollDown') {
        // Accumulate scroll delta
        const delta = kind === 'scrollUp' ? WHEEL_DELTA : -WHEEL_DELTA;
        scrollState.deltaY += delta;
        scrollState.x = adjustedX;
        scrollState.y = adjustedY;
        scrollState.modifiers = modifiers;
        scrollState.target = view.content.webContents;

        // Schedule flush if not already scheduled
        if (!scrollState.scheduled) {
          scrollState.scheduled = true;
          setTimeout(flushScroll, SCROLL_THROTTLE_MS);
        }
        break;
      }

      if (kind === 'scrollLeft' || kind === 'scrollRight') {
        const now = Date.now();

        // Reset swipe state if too much time has passed
        if (now - swipeState.lastEventTime > SWIPE_TIMEOUT_MS) {
          swipeState.deltaX = 0;
          swipeState.triggered = false;
        }

        // Accumulate horizontal delta (left is positive for back, right is negative for forward)
        const delta = kind === 'scrollLeft' ? WHEEL_DELTA : -WHEEL_DELTA;
        swipeState.deltaX += delta;
        swipeState.lastEventTime = now;

        // Check if threshold is crossed and navigation hasn't been triggered yet
        if (!swipeState.triggered) {
          if (swipeState.deltaX >= SWIPE_THRESHOLD) {
            // Swipe left -> go back
            view.back();
            swipeState.triggered = true;
            swipeState.deltaX = 0;
          } else if (swipeState.deltaX <= -SWIPE_THRESHOLD) {
            // Swipe right -> go forward
            view.forward();
            swipeState.triggered = true;
            swipeState.deltaX = 0;
          }
        }
        break;
      }

      if (!isSimpleMouseEvent(kind)) {
        break;
      }
      if (!button && kind !== 'mouseMove') {
        break;
      }

      const electronButton =
        button === 'fourth' || button === 'fifth' || button == null ? undefined : button;

      const clickCount =
        kind === 'mouseDown' && electronButton
          ? getClickCount(adjustedX, adjustedY, electronButton, focusedContent)
          : 0;

      focusedContent.sendInputEvent({
        type: kind,
        x: adjustedX,
        y: adjustedY,
        button: electronButton,
        modifiers,
        clickCount,
      });

      if (kind === 'mouseDown' && button === 'left') {
        if (focusedContent !== view.focusedContent) {
          if (focusedContent === view.content.webContents) {
            view.toolbar.blurWebView();
            view.content.focusOnWebView();
          } else {
            view.content.blurWebView();
            view.toolbar.focusOnWebView();
          }
          view.focusedContent = focusedContent;
        }
      }
      break;
    }
  }
}
