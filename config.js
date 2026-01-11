/** Homepage
 * The page that's displayed by default when no URL is provided
 **/
const homepage = 'https://github.com/chase/awrit';

/** Keybindings
 *
 * @typedef {import('./src/keybindings').KeyBindingAction} KeyBindingAction
 */

/**
 * Keybindings configuration object that maps Neovim-style key sequences to actions.
 *
 * Keybinding Format:
 * - Single key: "a", "b", "1", etc.
 * - Special keys: "<Tab>", "<Enter>", etc.
 * - Modifiers:
 *   - <C-...> for Ctrl (e.g., <C-s> for Ctrl+S)
 *   - <A-...> for Alt
 *   - <S-...> for Shift
 *   - <M-...> for Meta/Command
 * - Multiple modifiers can be combined: <C-A-s> for Ctrl+Alt+S
 * - Multi-key sequences: <C-w>l for Ctrl+W followed by L
 *
 * Behavior:
 * - Single-key bindings execute immediately
 * - Multi-key bindings match exact sequences
 * - Modifier order is handled consistently (e.g., <C-A-s> matches both Ctrl+Alt+S and Alt+Ctrl+S)
 * - When a key sequence is a prefix of another binding:
 *   - The system waits for a timeout period
 *   - If the longer sequence is completed within the timeout, it executes
 *   - If no further keys are pressed within the timeout, the shorter binding executes
 *
 * Example:
 * ```js
 * {
 *   // Executes after timeout if no longer sequence
 *   '<C-a>': () => console.log('Select all'),
 *   // Executes after timeout if no longer sequence
 *   '<C-w>': () => console.log('Close window'),
 *   // Executes immediately if pressed within timeout
 *   '<C-w>l': () => console.log('Next window'),
 * }
 * ```
 *
 * @type {Record<string, KeyBindingAction> & {
 *   mac?: Record<string, KeyBindingAction>,
 *   linux?: Record<string, KeyBindingAction>
 * }}
 */
const keybindings = {
  '<C-q>': () => {
    process.emit('SIGINT');
  },
  '<Mouse4>': back,
  '<Mouse5>': forward,
  mac: {
    '<M-a>': ({ view }) => {
      view.focusedContent.selectAll();
    },
    '<M-c>': copy,
    '<M-v>': paste,
    '<M-]>': forward,
    '<M-[>': back,
    '<M-f>': find,
    '<M-r>': refresh,
    '<M-l>': focusUrl,
  },
  linux: {
    '<C-c>': copy,
    '<C-v>': paste,
    '<C-]>': forward,
    '<C-[>': back,
    '<C-f>': find,
    '<C-r>': refresh,
    '<C-l>': focusUrl,
  },
};

/** @type {KeyBindingAction} */
function back({ view }) {
  view.back();
}

/** @type {KeyBindingAction} */
function forward({ view }) {
  view.forward();
}

/** @type {KeyBindingAction} */
function refresh({ view }) {
  view.refresh();
}

function find({ view }) {
  view.toolbar.webContents.send('toolbar:toggle-find');
  view.content.blurWebView();
  view.toolbar.focusOnWebView();
  view.focusedContent = view.toolbar.webContents;
}

function focusUrl({ view }) {
  view.toolbar.webContents.send('toolbar:focus-url');
  view.content.blurWebView();
  view.toolbar.focusOnWebView();
  view.focusedContent = view.toolbar.webContents;
}

const { execSync } = require('node:child_process');

// OSC 52 escape sequence for clipboard copy (works in Kitty and other modern terminals)
function osc52Copy(text) {
  const encoded = Buffer.from(text).toString('base64');
  // OSC 52 ; c ; <base64-data> ST
  process.stdout.write(`\x1b]52;c;${encoded}\x1b\\`);
}

function copy({ view }) {
  if (!view?.focusedContent) return;
  view.focusedContent.executeJavaScript('window.getSelection().toString()').then((text) => {
    if (text) {
      osc52Copy(text);
    }
  }).catch((err) => debug('copy error:', err));
}

function paste({ view }) {
  if (!view?.focusedContent) return;
  try {
    // Use wl-paste on Wayland, fallback to xclip on X11
    const text = process.env.WAYLAND_DISPLAY
      ? execSync('wl-paste -n 2>/dev/null', { encoding: 'utf8' })
      : execSync('xclip -selection clipboard -o 2>/dev/null', { encoding: 'utf8' });
    if (text) {
      view.focusedContent.insertText(text);
    }
  } catch {
    // Clipboard empty or tool not available
  }
}

const config = {
  homepage,
  keybindings,
};

module.exports = config;

/** Utilities */

const util = require('node:util');

function debug(...args) {
  process.stderr.write(
    util
      .formatWithOptions(
        {
          colors: true,
        },
        ...args,
      )
      .replaceAll('\n', '\r\n'),
  );
}
