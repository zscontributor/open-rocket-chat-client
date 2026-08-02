import { useCallback, useEffect, useRef, useState } from 'react';

import { mediaKindOf, type MediaItem, type MediaKind } from '@/features/media/media';

/** Matches the gateway's default `MAX_UPLOAD_BYTES`. */
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

export type AttachmentStatus = 'ready' | 'uploading' | 'failed' | 'rejected';

export interface PendingAttachment {
  id: string;
  file: File;
  name: string;
  /** Relative path when the file came from a folder, for display only. */
  path?: string;
  mimeType: string;
  size: number;
  kind: MediaKind;
  /** Object URL for image, video and audio previews; absent for other kinds. */
  previewUrl?: string;
  status: AttachmentStatus;
  error?: string;
  caption: string;
}

let sequence = 0;
const nextId = (): string => {
  sequence += 1;
  return `attachment-${sequence}`;
};

const toPendingAttachment = (file: File, path?: string): PendingAttachment => {
  const kind = mediaKindOf(file.type, file.name);
  const tooLarge = file.size > MAX_ATTACHMENT_BYTES;

  return {
    id: nextId(),
    file,
    name: file.name,
    ...(path && path !== file.name ? { path } : {}),
    mimeType: file.type,
    size: file.size,
    kind,
    // Only playable media gets a preview; an object URL for a 2 GB archive
    // would pin it in memory for nothing. Audio is included so a voice message
    // can be listened back to before it is sent.
    ...(!tooLarge && (kind === 'image' || kind === 'video' || kind === 'audio')
      ? { previewUrl: URL.createObjectURL(file) }
      : {}),
    status: tooLarge ? ('rejected' as const) : ('ready' as const),
    ...(tooLarge ? { error: 'tooLarge' } : {}),
    caption: '',
  };
};

/**
 * Recursively walks a dropped directory.
 *
 * Drag-and-drop of a folder only exposes entries through the non-standard
 * `webkitGetAsEntry` API — `DataTransfer.files` is empty for directories — so
 * there is no portable alternative.
 */
const readDirectory = async (
  entry: FileSystemDirectoryEntry,
  prefix: string,
): Promise<{ file: File; path: string }[]> => {
  const reader = entry.createReader();
  const collected: { file: File; path: string }[] = [];

  // `readEntries` returns at most 100 entries per call and signals the end
  // with an empty batch, so it has to be drained in a loop.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;

    for (const child of batch) {
      collected.push(...(await readEntry(child, `${prefix}${entry.name}/`)));
    }
  }

  return collected;
};

const readEntry = async (entry: FileSystemEntry, prefix: string): Promise<{ file: File; path: string }[]> => {
  if (entry.isDirectory) {
    return readDirectory(entry as FileSystemDirectoryEntry, prefix);
  }

  const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));

  return [{ file, path: `${prefix}${file.name}` }];
};

export interface UseAttachmentsResult {
  attachments: PendingAttachment[];
  addFiles: (files: FileList | File[]) => void;
  addFromDataTransfer: (dataTransfer: DataTransfer) => Promise<void>;
  remove: (id: string) => void;
  clear: () => void;
  setCaption: (id: string, caption: string) => void;
  setStatus: (id: string, status: AttachmentStatus, error?: string) => void;
  /**
   * Marks an attachment as uploading and hands back the signal its request
   * must run under, or `null` when it was removed before its turn came.
   */
  beginUpload: (id: string) => AbortSignal | null;
  /** Drops the controller once the request has settled. */
  endUpload: (id: string) => void;
  /** The subset that can be previewed, shaped for the lightbox. */
  mediaItems: MediaItem[];
  hasBlocking: boolean;
}

export const useAttachments = (): UseAttachmentsResult => {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  // Object URLs are not garbage collected; without this the browser holds
  // every previewed image for the lifetime of the tab.
  const previewUrls = useRef(new Set<string>());

  // Uploads in flight, so removing a tile can abort the request instead of
  // letting a file the user just took back finish landing in the room.
  const uploads = useRef(new Map<string, AbortController>());

  // Mirrors the ids in state for `beginUpload`, which runs between awaits of a
  // send already in progress and so cannot read the state its closure captured.
  const stagedIds = useRef(new Set<string>());

  const track = useCallback((items: PendingAttachment[]) => {
    for (const item of items) {
      stagedIds.current.add(item.id);
      if (item.previewUrl) previewUrls.current.add(item.previewUrl);
    }
  }, []);

  const cancelUpload = useCallback((id: string) => {
    stagedIds.current.delete(id);
    uploads.current.get(id)?.abort();
    uploads.current.delete(id);
  }, []);

  const release = useCallback((item: PendingAttachment | undefined) => {
    if (!item?.previewUrl) return;
    URL.revokeObjectURL(item.previewUrl);
    previewUrls.current.delete(item.previewUrl);
  }, []);

  useEffect(
    () => () => {
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
      previewUrls.current.clear();
    },
    [],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const created = [...files].map((file) =>
        // `webkitRelativePath` is populated when the picker ran in directory mode.
        toPendingAttachment(file, (file as File & { webkitRelativePath?: string }).webkitRelativePath || undefined),
      );
      if (created.length === 0) return;

      track(created);
      setAttachments((current) => [...current, ...created]);
    },
    [track],
  );

  const addFromDataTransfer = useCallback(
    async (dataTransfer: DataTransfer) => {
      const entries = [...dataTransfer.items]
        .filter((item) => item.kind === 'file')
        .map((item) => item.webkitGetAsEntry?.())
        .filter((entry): entry is FileSystemEntry => Boolean(entry));

      if (entries.length === 0) {
        addFiles(dataTransfer.files);
        return;
      }

      const walked = (await Promise.all(entries.map((entry) => readEntry(entry, '')))).flat();
      const created = walked.map(({ file, path }) => toPendingAttachment(file, path));
      if (created.length === 0) return;

      track(created);
      setAttachments((current) => [...current, ...created]);
    },
    [addFiles, track],
  );

  const remove = useCallback(
    (id: string) => {
      cancelUpload(id);
      setAttachments((current) => {
        release(current.find((item) => item.id === id));
        return current.filter((item) => item.id !== id);
      });
    },
    [cancelUpload, release],
  );

  const clear = useCallback(() => {
    for (const id of [...stagedIds.current]) cancelUpload(id);
    setAttachments((current) => {
      for (const item of current) release(item);
      return [];
    });
  }, [cancelUpload, release]);

  const setCaption = useCallback((id: string, caption: string) => {
    setAttachments((current) => current.map((item) => (item.id === id ? { ...item, caption } : item)));
  }, []);

  const setStatus = useCallback((id: string, status: AttachmentStatus, error?: string) => {
    setAttachments((current) =>
      current.map((item) => (item.id === id ? { ...item, status, ...(error ? { error } : {}) } : item)),
    );
  }, []);

  const beginUpload = useCallback(
    (id: string): AbortSignal | null => {
      // Taken back out of the tray while an earlier file was still going up.
      if (!stagedIds.current.has(id)) return null;

      const controller = new AbortController();
      uploads.current.set(id, controller);
      setStatus(id, 'uploading');

      return controller.signal;
    },
    [setStatus],
  );

  const endUpload = useCallback((id: string) => {
    uploads.current.delete(id);
  }, []);

  // The lightbox only shows images and video, so audio is left out: an entry it
  // silently discards would throw the tray's index into it off by one.
  const mediaItems: MediaItem[] = attachments
    .filter((item) => item.previewUrl && (item.kind === 'image' || item.kind === 'video'))
    .map((item) => ({
      id: item.id,
      url: item.previewUrl as string,
      name: item.name,
      mimeType: item.mimeType,
      kind: item.kind,
      sizeBytes: item.size,
    }));

  return {
    attachments,
    addFiles,
    addFromDataTransfer,
    remove,
    clear,
    setCaption,
    setStatus,
    beginUpload,
    endUpload,
    mediaItems,
    // Sending while a file is oversized would fail server-side after the wait.
    hasBlocking: attachments.some((item) => item.status === 'rejected'),
  };
};
