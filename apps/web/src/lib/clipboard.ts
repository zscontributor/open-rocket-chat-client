/**
 * The shape a desktop shell registers on `window` to own the clipboard itself.
 *
 * The web app never imports a Tauri package: the desktop build is a separate
 * shell around this same bundle, so a static import would either break the
 * browser build or drag a native-only module into it. Instead the shell fills
 * this seam on start-up — one line wiring Tauri's clipboard plugin in —
 *
 * ```ts
 * import { writeText } from '@tauri-apps/plugin-clipboard-manager';
 * window.__ORC_DESKTOP__ = { ...window.__ORC_DESKTOP__, copyText: writeText };
 * ```
 *
 * and everything below stays exactly as it is.
 */
interface DesktopBridge {
  copyText?: (text: string) => Promise<void> | void;
}

const desktopBridge = (): DesktopBridge | undefined =>
  (globalThis as { __ORC_DESKTOP__?: DesktopBridge }).__ORC_DESKTOP__;

/**
 * The pre-`navigator.clipboard` way: a selected off-screen textarea and
 * `document.execCommand`.
 *
 * Deprecated, but still the only thing that works in two cases this app has to
 * survive — a page served over plain HTTP (`navigator.clipboard` is gated on a
 * secure context, and self-hosted Rocket.Chat installs are often on http://),
 * and Tauri's WebKitGTK webview on Linux, which does not implement the
 * clipboard API at all.
 */
const execCommandCopy = (text: string): boolean => {
  if (typeof document === 'undefined') return false;

  const area = document.createElement('textarea');
  area.value = text;
  // Off-screen rather than `display: none`: a hidden element cannot hold a
  // selection, and `readOnly` stops mobile keyboards popping up over the page.
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '-9999px';
  area.style.opacity = '0';
  document.body.append(area);

  try {
    area.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
};

/**
 * Puts `text` on the system clipboard, and reports whether it landed.
 *
 * Tries the desktop bridge, then the clipboard API, then the legacy path,
 * because each one fails in situations the next still handles. Nothing throws:
 * a failed copy is a UI state ("nothing happened"), not an error the caller
 * should have to catch — the browser rejects for reasons as mundane as the
 * window having lost focus mid-click.
 */
export const copyText = async (text: string): Promise<boolean> => {
  const bridge = desktopBridge();
  if (bridge?.copyText) {
    try {
      await bridge.copyText(text);
      return true;
    } catch {
      // A shell that registered the bridge and then failed still has the two
      // web paths below available to it.
    }
  }

  if (globalThis.navigator?.clipboard?.writeText) {
    try {
      await globalThis.navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Denied permission, an insecure context, or an unfocused document.
    }
  }

  return execCommandCopy(text);
};
