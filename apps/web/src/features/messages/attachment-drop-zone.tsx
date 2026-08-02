import { createContext, useContext, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { canUpload, useCapabilities } from '@/features/server/use-capabilities';
import { useRoom } from '@/features/rooms/use-rooms';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/ui-store';
import { Icons } from '@/ui/icon';
import { useAttachments, type UseAttachmentsResult } from './use-attachments';

const AttachmentsContext = createContext<UseAttachmentsResult | null>(null);

/**
 * The staged attachments for the surrounding conversation.
 *
 * They are owned by the drop zone rather than by the message box because the
 * whole conversation is the drop target — the box is only where they are shown
 * before sending.
 */
export const useConversationAttachments = (): UseAttachmentsResult => {
  const value = useContext(AttachmentsContext);
  if (!value) throw new Error('useConversationAttachments must be used inside an <AttachmentDropZone>');
  return value;
};

/**
 * True when the drag carries files rather than, say, selected text. Checked on
 * every drag event because `dataTransfer.files` is deliberately empty until the
 * drop itself — `types` is the only thing readable while the drag is in flight.
 */
const carriesFiles = (dataTransfer: DataTransfer | null): boolean =>
  dataTransfer ? [...dataTransfer.types].includes('Files') : false;

/**
 * Makes an entire conversation a drop target for uploads.
 *
 * Dropping anywhere over the timeline or the message box stages the files in
 * the tray above the box, so a caption can be added and the upload reviewed
 * before anything is sent — the same place the paperclip button puts them.
 */
export const AttachmentDropZone = ({
  roomId,
  threadId,
  disabled,
  className,
  children,
}: {
  roomId: string;
  /** Set in the thread pane, where an in-flight edit of the timeline is none of its business. */
  threadId?: string;
  /** The room is read-only, so nothing can be attached to it. */
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) => {
  const { t } = useTranslation('composer');
  const attachments = useAttachments();
  const { data: capabilities } = useCapabilities();
  const { data: room } = useRoom(roomId);

  // Files dropped mid-edit would upload as new messages rather than join the
  // one being edited, so attaching is off for the duration.
  const editing = useUiStore((state) => (threadId ? null : state.editingMessage));
  const isEditing = editing?.roomId === roomId;

  // The same three gates the message box applies to its paperclip, so the
  // overlay never promises an upload the send would refuse.
  const blockedReason = !canUpload(capabilities, room)
    ? 'uploads'
    : disabled
      ? 'readOnly'
      : isEditing
        ? 'editing'
        : null;

  // Counting enter/leave avoids the flicker caused by dragging over child
  // elements, each of which fires its own leave event.
  const depth = useRef(0);
  const [isDraggingOver, setDraggingOver] = useState(false);

  // Without this, a file dropped next to the zone — on the sidebar, or on the
  // margin around it — makes the browser navigate away from the app to open it,
  // silently throwing away whatever was being typed.
  useEffect(() => {
    const swallow = (event: globalThis.DragEvent) => {
      if (carriesFiles(event.dataTransfer)) event.preventDefault();
    };

    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);

    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);

  // A drag that ends anywhere but on this zone still has to clear the overlay.
  useEffect(() => {
    if (!isDraggingOver) return;

    const reset = () => {
      depth.current = 0;
      setDraggingOver(false);
    };

    window.addEventListener('dragend', reset);
    window.addEventListener('blur', reset);

    return () => {
      window.removeEventListener('dragend', reset);
      window.removeEventListener('blur', reset);
    };
  }, [isDraggingOver]);

  const onDrop = (event: DragEvent) => {
    if (!carriesFiles(event.dataTransfer)) return;

    event.preventDefault();
    depth.current = 0;
    setDraggingOver(false);

    if (blockedReason) return;
    void attachments.addFromDataTransfer(event.dataTransfer);
  };

  return (
    <AttachmentsContext.Provider value={attachments}>
      <div
        className={cn('relative', className)}
        onDragEnter={(event) => {
          if (!carriesFiles(event.dataTransfer)) return;
          event.preventDefault();
          depth.current += 1;
          setDraggingOver(true);
        }}
        onDragOver={(event) => {
          if (!carriesFiles(event.dataTransfer)) return;
          // Required for the drop to fire at all, and it is what sets the
          // cursor to "copy" instead of the default "no entry".
          event.preventDefault();
          event.dataTransfer.dropEffect = blockedReason ? 'none' : 'copy';
        }}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setDraggingOver(false);
        }}
        onDrop={onDrop}
      >
        {children}

        {isDraggingOver ? (
          // Purely an indicator: the handlers live on the zone itself, so the
          // overlay must never become the drop target or the count above would
          // see a leave for the element the drop actually lands on.
          <div
            aria-hidden
            className="bg-app/80 pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-xl backdrop-blur-[1px]"
          >
            <div
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-8 py-6 text-center',
                blockedReason ? 'border-line text-content-muted' : 'border-accent text-accent bg-accent-subtle',
              )}
            >
              <Icons.upload size={32} weight="light" />
              <p className="text-sm font-semibold">
                {blockedReason === 'uploads'
                  ? t('dropZone.blocked.uploads')
                  : blockedReason === 'readOnly'
                    ? t('dropZone.blocked.readOnly')
                    : blockedReason === 'editing'
                      ? t('dropZone.blocked.editing')
                      : t('dropZone.title')}
              </p>
              {blockedReason ? null : <p className="text-content-muted text-xs">{t('dropZone.hint')}</p>}
            </div>
          </div>
        ) : null}
      </div>
    </AttachmentsContext.Provider>
  );
};
