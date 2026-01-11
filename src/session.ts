import { app, session as ElectronSession, type Session } from 'electron';

// Comprehensive anti-fingerprinting script based on puppeteer-stealth techniques
const ANTI_FINGERPRINT_SCRIPT = `
(function() {
  'use strict';

  // 1. Hide webdriver property - critical for bot detection
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
    configurable: true
  });

  // Also delete it from the prototype
  delete Object.getPrototypeOf(navigator).webdriver;

  // 2. Fix chrome object to look like real Chrome
  if (!window.chrome) {
    window.chrome = {};
  }

  window.chrome.app = {
    isInstalled: false,
    InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
    RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
    getDetails: () => null,
    getIsInstalled: () => false,
    installState: () => 'not_installed',
    runningState: () => 'cannot_run'
  };

  window.chrome.runtime = {
    OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
    OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
    PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
    PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
    PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
    RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
    connect: () => { throw new Error('Could not establish connection.'); },
    sendMessage: () => { throw new Error('Could not establish connection.'); }
  };

  window.chrome.csi = () => ({
    onloadT: Date.now(),
    pageT: Date.now() - performance.timing.navigationStart,
    startE: performance.timing.navigationStart,
    tran: 15
  });

  window.chrome.loadTimes = () => ({
    commitLoadTime: performance.timing.responseStart / 1000,
    connectionInfo: 'h2',
    finishDocumentLoadTime: performance.timing.domContentLoadedEventEnd / 1000,
    finishLoadTime: performance.timing.loadEventEnd / 1000,
    firstPaintAfterLoadTime: 0,
    firstPaintTime: performance.timing.domContentLoadedEventEnd / 1000,
    navigationType: 'Other',
    npnNegotiatedProtocol: 'h2',
    requestTime: performance.timing.requestStart / 1000,
    startLoadTime: performance.timing.navigationStart / 1000,
    wasAlternateProtocolAvailable: false,
    wasFetchedViaSpdy: true,
    wasNpnNegotiated: true
  });

  // 3. Ensure plugins array looks normal (PDF plugins)
  const pluginData = [
    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimeTypes: [{ type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' }] },
    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', mimeTypes: [{ type: 'application/pdf', suffixes: 'pdf', description: '' }] },
    { name: 'Native Client', filename: 'internal-nacl-plugin', description: '', mimeTypes: [{ type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable' }, { type: 'application/x-pnacl', suffixes: '', description: 'Portable Native Client Executable' }] }
  ];

  const pluginArray = pluginData.map(p => {
    const plugin = Object.create(Plugin.prototype);
    Object.defineProperties(plugin, {
      name: { value: p.name, enumerable: true },
      filename: { value: p.filename, enumerable: true },
      description: { value: p.description, enumerable: true },
      length: { value: p.mimeTypes.length, enumerable: true }
    });
    p.mimeTypes.forEach((mt, i) => {
      const mimeType = Object.create(MimeType.prototype);
      Object.defineProperties(mimeType, {
        type: { value: mt.type, enumerable: true },
        suffixes: { value: mt.suffixes, enumerable: true },
        description: { value: mt.description, enumerable: true },
        enabledPlugin: { value: plugin, enumerable: true }
      });
      Object.defineProperty(plugin, i, { value: mimeType, enumerable: true });
    });
    return plugin;
  });

  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const arr = Object.create(PluginArray.prototype);
      pluginArray.forEach((p, i) => { arr[i] = p; });
      Object.defineProperty(arr, 'length', { value: pluginArray.length });
      arr.item = (i) => arr[i] || null;
      arr.namedItem = (name) => pluginArray.find(p => p.name === name) || null;
      arr.refresh = () => {};
      return arr;
    },
    configurable: true
  });

  // 4. Ensure languages are set
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
    configurable: true
  });

  // 5. Spoof permissions API
  const originalQuery = navigator.permissions?.query;
  if (originalQuery) {
    navigator.permissions.query = (parameters) => {
      if (parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission, onchange: null });
      }
      return originalQuery.call(navigator.permissions, parameters);
    };
  }

  // 6. Normalize hardware info to common values
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    get: () => 8,
    configurable: true
  });

  Object.defineProperty(navigator, 'deviceMemory', {
    get: () => 8,
    configurable: true
  });

  // 7. Hide automation in window properties
  Object.defineProperty(window, 'outerWidth', {
    get: () => window.innerWidth,
    configurable: true
  });

  Object.defineProperty(window, 'outerHeight', {
    get: () => window.innerHeight + 85, // Account for browser chrome
    configurable: true
  });

  // 8. Spoof WebGL vendor/renderer to look like real hardware
  const getParameterProto = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
      return 'Google Inc. (NVIDIA)';
    }
    if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
      return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Direct3D11 vs_5_0 ps_5_0, D3D11)';
    }
    return getParameterProto.call(this, parameter);
  };

  const getParameter2Proto = WebGL2RenderingContext.prototype.getParameter;
  WebGL2RenderingContext.prototype.getParameter = function(parameter) {
    if (parameter === 37445) {
      return 'Google Inc. (NVIDIA)';
    }
    if (parameter === 37446) {
      return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Direct3D11 vs_5_0 ps_5_0, D3D11)';
    }
    return getParameter2Proto.call(this, parameter);
  };

  // 9. Fix Notification.permission to return 'default' instead of 'denied'
  // (Headless browsers often have this denied)
  try {
    const notificationDesc = Object.getOwnPropertyDescriptor(Notification, 'permission');
    if (notificationDesc && notificationDesc.get) {
      Object.defineProperty(Notification, 'permission', {
        get: () => 'default',
        configurable: true
      });
    }
  } catch (e) {}

  // 10. Ensure connection info looks normal
  if (navigator.connection) {
    Object.defineProperty(navigator.connection, 'rtt', {
      get: () => 50,
      configurable: true
    });
  }
})();
`;

export const sessionPromise = new Promise<Session>((resolve) => {
  app.whenReady().then(() => {
    const session = ElectronSession.fromPartition('persist:custom-awrit');

    // Build a user-agent that looks like regular Chrome
    // Remove Electron and app name markers completely
    const userAgent = session
      .getUserAgent()
      .replace(/\sElectron\/\S+/, '')
      .replace(new RegExp(`\\s${app.getName()}/\\S+`), '')
      // Also remove any HeadlessChrome marker if present
      .replace(/HeadlessChrome/g, 'Chrome');

    session.setUserAgent(userAgent);
    resolve(session);
  });
});

// Export the anti-fingerprinting script for injection
export { ANTI_FINGERPRINT_SCRIPT };
