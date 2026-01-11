import type { KeyEvent as KeyEventOriginal, TermEvent } from 'awrit-native-rs';
import type { WebContents } from 'electron';
import { handleEvent as handleKeyBinding } from './keybindings';
import { focusedView } from './windows';

const WHEEL_DELTA = 100;

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

const mouseEventTypes = ['mouseDown', 'mouseUp', 'mouseMove'] as const;
// this is a fix for Electron going back and forth on what's supported for modifiers, despite being case insensitive;
type KeyEventModifiers = Lowercase<KeyEventOriginal['modifiers'][number]>[];
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
        view.content.webContents.sendInputEvent({
          type: 'mouseWheel',
          wheelTicksY: kind === 'scrollUp' ? 1 : -1,
          wheelTicksX: 0,
          deltaX: 0,
          deltaY: kind === 'scrollUp' ? WHEEL_DELTA : -WHEEL_DELTA,
          modifiers,
          x: adjustedX,
          y: adjustedY,
          accelerationRatioY: 0.5,
          hasPreciseScrollingDeltas: false,
          canScroll: true,
        });
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
