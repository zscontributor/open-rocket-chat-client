/**
 * The sender's avatar, as something a notification will actually display.
 *
 * A notification is drawn by the operating system, not by the page, so the icon
 * is fetched outside the document's context: no session cookie is guaranteed to
 * ride along, and a URL that renders perfectly well in an `<img>` can come back
 * empty there. Rocket.Chat solves this by loading the avatar into the page
 * first and handing the notification the resulting PNG, which is what this does.
 *
 * Every failure resolves to the URL it started from rather than rejecting: an
 * icon is decoration, and a notification without one still says what happened.
 */
export const avatarAsPng = (url: string): Promise<string> =>
  new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;

        const context = canvas.getContext('2d');
        if (!context) {
          resolve(url);
          return;
        }

        context.drawImage(image, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        // A cross-origin avatar loaded without CORS headers taints the canvas
        // and `toDataURL` throws. The original URL may still work, and if it
        // does not the notification simply has no icon.
        resolve(url);
      }
    };

    image.onerror = () => resolve(url);
    image.src = url;
  });
