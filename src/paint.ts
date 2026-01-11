import { getWindowSize, ShmGraphicBuffer } from 'awrit-native-rs';
import type { BrowserWindow, NativeImage, Rectangle } from 'electron';
import { abort } from './abort';
import { options } from './args';
import { console_ } from './console';
import { features } from './features';
import type { LayoutNode } from './layout';
import {
  type AnimationFrame,
  type InitialFrame,
  type PaintedImage,
  paintImage,
} from './tty/kittyGraphics';

// Minimum time between frames (ms) - ~60fps for smooth scrolling
const MIN_FRAME_TIME_MS = 16;

type PaintedContent = {
  frame?: AnimationFrame;
  buffer?: ShmGraphicBuffer;
  size?: number;
  expectedWinSize?: {
    width: number;
    height: number;
  };
  destroy(): void;
};

const weakPaintedContents_ = new WeakMap<BrowserWindow, PaintedContent>();

// assumes animation is supported
export function registerPaintedContent(
  containerFrame: InitialFrame,
  w: BrowserWindow,
  layoutNode: LayoutNode,
): PaintedContent {
  const contents = w.webContents;
  const frameNumber = 2 + containerFrame.paintedContent++;

  w.on('resize', () => {
    // result.frame?.delete();
    // result.frame = containerFrame.loadFrame(2, compositeName, bounds);
    // console_.error('bounds-changed', id, bounds);
  });

  if (!features.current) {
    console_.error('No features available');
    abort();
  }

  // Frame throttling state
  let lastPaintTime = 0;
  let pendingFrame: { bitmap: Buffer; imageSize: { width: number; height: number } } | null = null;
  let frameScheduled = false;

  const result: PaintedContent = {
    destroy() {
      contents.off('paint', paint);
      this.buffer = undefined;
      this.frame?.delete();
      this.frame = undefined;
    },
  };

  function renderFrame(bitmap: Buffer, imageSize: { width: number; height: number }) {
    const imageBufferSize = imageSize.width * imageSize.height * 4;
    if (result.buffer == null) {
      result.buffer = new ShmGraphicBuffer(imageBufferSize);
      result.size = imageBufferSize;
    }
    if (options['debug-paint']) {
      console_.error('paint', result.buffer.nameBase64, imageSize);
    }
    if (options['no-paint']) {
      return;
    }

    if (result.size != null && imageBufferSize > result.size) {
      if (options['debug-paint']) {
        console_.error('replace buffer', result.buffer.nameBase64, result.size, imageBufferSize);
      }
      result.buffer = new ShmGraphicBuffer(imageBufferSize);
      result.size = imageBufferSize;
    }

    result.buffer.write(bitmap, imageSize.width);
    containerFrame
      .loadFrame(frameNumber, result.buffer, imageSize)
      .composite(layoutNode.deviceLayout);

    lastPaintTime = performance.now();
  }

  function paint(_: any, _dirty: Rectangle, image: NativeImage) {
    // Capture bitmap immediately - NativeImage becomes invalid after handler returns
    const bitmap = image.toBitmap();
    const imageSize = image.getSize();

    const now = performance.now();
    const timeSinceLastPaint = now - lastPaintTime;

    // If enough time has passed, render immediately
    if (timeSinceLastPaint >= MIN_FRAME_TIME_MS) {
      renderFrame(bitmap, imageSize);
      pendingFrame = null;
      return;
    }

    // Otherwise, store this frame and schedule a deferred render
    pendingFrame = { bitmap, imageSize };

    if (!frameScheduled) {
      frameScheduled = true;
      const delay = MIN_FRAME_TIME_MS - timeSinceLastPaint;
      setTimeout(() => {
        frameScheduled = false;
        if (pendingFrame) {
          renderFrame(pendingFrame.bitmap, pendingFrame.imageSize);
          pendingFrame = null;
        }
      }, delay);
    }
  }

  contents.on('paint', paint);

  weakPaintedContents_.set(w, result);
  return result;
}

function coordsFromPx(cellToPx: number, px: number) {
  return {
    cell: Math.ceil(px / cellToPx),
    px: Math.ceil(px % cellToPx),
  };
}

export function registerPaintedContentFallback(
  w: BrowserWindow,
  layoutNode: LayoutNode,
): PaintedContent {
  const contents = w.webContents;
  const termSize = getWindowSize();
  const cellToPxX = termSize.width / termSize.cols;
  const cellToPxY = termSize.height / termSize.rows;
  let paintedImage: PaintedImage | undefined;

  // Frame throttling state
  let lastPaintTime = 0;
  let pendingFrame: { bitmap: Buffer; imageSize: { width: number; height: number } } | null = null;
  let frameScheduled = false;

  const result: PaintedContent = {
    destroy() {
      contents.off('paint', paint);
      this.buffer = undefined;
      paintedImage?.free();
      paintedImage = undefined;
    },
  };

  function renderFrame(bitmap: Buffer, imageSize: { width: number; height: number }) {
    const imageBufferSize = imageSize.width * imageSize.height * 4;

    const position = {
      x: coordsFromPx(cellToPxX, layoutNode.deviceLayout.x),
      y: coordsFromPx(cellToPxY, layoutNode.deviceLayout.y),
    };

    let replace = true;
    if (result.buffer == null || (result.size != null && imageBufferSize > result.size)) {
      replace = false;
      const buffer = new ShmGraphicBuffer(imageBufferSize);
      paintedImage?.free();
      buffer.write(bitmap, imageSize.width);
      paintedImage = paintImage(buffer, imageSize, position);

      result.buffer = buffer;
      result.size = imageBufferSize;
    }
    if (options['debug-paint']) {
      console_.error('paint', result.buffer.nameBase64, imageSize);
    }
    if (options['no-paint']) {
      return;
    }

    if (replace && paintedImage) {
      paintedImage.replace(bitmap);
    }

    lastPaintTime = performance.now();
  }

  function paint(_: any, _dirty: Rectangle, image: NativeImage) {
    // Capture bitmap immediately - NativeImage becomes invalid after handler returns
    const bitmap = image.toBitmap();
    const imageSize = image.getSize();

    const now = performance.now();
    const timeSinceLastPaint = now - lastPaintTime;

    // If enough time has passed, render immediately
    if (timeSinceLastPaint >= MIN_FRAME_TIME_MS) {
      renderFrame(bitmap, imageSize);
      pendingFrame = null;
      return;
    }

    // Otherwise, store this frame and schedule a deferred render
    pendingFrame = { bitmap, imageSize };

    if (!frameScheduled) {
      frameScheduled = true;
      const delay = MIN_FRAME_TIME_MS - timeSinceLastPaint;
      setTimeout(() => {
        frameScheduled = false;
        if (pendingFrame) {
          renderFrame(pendingFrame.bitmap, pendingFrame.imageSize);
          pendingFrame = null;
        }
      }, delay);
    }
  }

  contents.on('paint', paint);

  weakPaintedContents_.set(w, result);
  return result;
}
