// Aliased: `format` is taken inside the component by the one that applies a
// formatting mark to the draft.
import { format as formatDate } from 'date-fns';
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useRealtime } from '@/features/realtime/realtime-provider';
import { useRoom } from '@/features/rooms/use-rooms';
import { useServerConnection, useServerId } from '@/features/servers/server-scope';
import { cn } from '@/lib/cn';
import { describeError } from '@/lib/errors';
import { hasModifier, modifierKey, sendsOnEnter } from '@/lib/keys';
import { composerBounds, COMPOSER_HEIGHT } from '@/lib/resize';
import { editDraftKey, roomScopeKey, useUiStore } from '@/stores/ui-store';
import { Icons, Spinner } from '@/ui/icon';
import { ResizeHandle } from '@/ui/resize-handle';
import { Switch } from '@/ui/switch';
import { useConversationAttachments } from './attachment-drop-zone';
import { AttachmentTray } from './attachment-tray';
import { findAutocompleteToken, parseSlashCommand, replaceAutocompleteToken } from './autocomplete';
import { ComposerAutocomplete } from './composer-autocomplete';
import { EmojiPicker } from './emoji-picker';
import { applyMark, closeCodeFence, MARK_ORDER, type FormatResult, type MarkName } from './formatting';
import { FormattingMenu, MARK_SHORTCUTS } from './formatting-menu';
import { GifPicker } from './gif-picker';
import { fetchGifFile, type GiphyGif } from './giphy';
import { longMessageFile } from './long-message';
import { LongMessageConfirm } from './long-message-confirm';
import { MessageBody } from './message-body';
import { quotedText, QUOTE_STAMP_FORMAT } from './quote';
import {
  canConvertLongMessage,
  canEditMessage,
  canRunSlashCommand,
  canUpload,
  maxMessageLength,
  useCapabilities,
} from '@/features/server/use-capabilities';
import { useComposerAutocomplete, type AutocompleteItem } from './use-composer-autocomplete';
import { useEditMessage, useMessages, useSendMessage, useUploadFile } from './use-messages';
import { useRunSlashCommand, useSlashCommands } from './use-slash-commands';
import { useVoiceRecording } from './use-voice-recording';
import { VoiceRecorderBar } from './voice-recorder-bar';

/** How long after the last keystroke we tell the server typing has stopped. */
const TYPING_IDLE_MS = 3_000;

const ToolbarButton = ({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Set on toggles, which then read as pressed to assistive tech too. */
  pressed?: boolean;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
    onClick={onClick}
    disabled={disabled}
    className={cn(
      'text-content-muted hover:bg-sunken hover:text-content flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-40',
      pressed && 'bg-accent-subtle text-accent hover:text-accent',
    )}
  >
    {children}
  </button>
);

export const Composer = ({
  roomId,
  threadId,
  placeholder,
  disabled,
}: {
  roomId: string;
  threadId?: string;
  placeholder: string;
  disabled?: boolean;
}) => {
  const { t } = useTranslation('composer');
  const { t: tCommon } = useTranslation('common');
  // The quote bar counts the original's uploads, and the timeline already has
  // the phrase for that — one wording for one thing, in every language.
  const { t: tMessages } = useTranslation('messages');
  const send = useSendMessage(roomId);
  const edit = useEditMessage(roomId);
  const upload = useUploadFile(roomId);
  const runCommand = useRunSlashCommand(roomId);
  // Loaded up front rather than on the first `/`: submit has to know whether a
  // draft that opens with a slash is a command or a message someone happens to
  // have started that way, and it cannot wait for a request to find out.
  const { data: slashCommands } = useSlashCommands();
  const realtime = useRealtime();
  const serverId = useServerId();
  // Owned by the drop zone around the conversation, so a file dropped on the
  // timeline lands in the same tray as one picked with the paperclip.
  const attachments = useConversationAttachments();
  const { data: capabilities } = useCapabilities();
  // Read from the cache the timeline already filled, so ↑ costs no request: the
  // message it edits is by definition one that is on screen.
  const { data: timeline } = useMessages(roomId);
  const { data: room } = useRoom(roomId);
  const { user } = useServerConnection();

  const maxLength = maxMessageLength(capabilities);
  const uploadsAllowed = canUpload(capabilities, room);
  const longMessagesConvert = canConvertLongMessage(capabilities, room);

  // Editing is always started from the main timeline, so the thread pane's box
  // must not answer for it — two boxes claiming the same edit would each show
  // the banner and race to save.
  const pending = useUiStore((state) => (threadId ? null : state.editingMessage));
  const stopEditing = useUiStore((state) => state.stopEditingMessage);
  const startEditing = useUiStore((state) => state.startEditingMessage);
  // A message being edited belongs to the room it was opened in.
  const editing = pending?.roomId === roomId ? pending : null;

  // Quotes are raised from the timeline's hover toolbar, which only the main
  // pane draws — so, as with editing, the thread box must not answer for one.
  const pendingQuote = useUiStore((state) => (threadId ? null : state.quotedMessage));
  const stopQuoting = useUiStore((state) => state.stopQuotingMessage);
  const quoting = pendingQuote?.roomId === roomId ? pendingQuote : null;

  // Thread replies get their own draft slot so switching panes cannot lose text,
  // and so does an edit — it borrows the box without disturbing what was typed.
  // Scoped to the server as well, so the same room id on two servers cannot
  // share a draft.
  const scope = roomScopeKey(serverId, roomId);
  // The edit slot is keyed on the bare room id because that is the key the store
  // seeds the original text under when the edit starts — scoping it here as well
  // would look in a slot nothing ever writes to, and open every edit on an empty
  // box. The message id in the key is what keeps two servers apart.
  const draftKey = editing ? editDraftKey(roomId, editing.messageId) : threadId ? `${scope}:${threadId}` : scope;
  const draft = useUiStore((state) => state.drafts[draftKey] ?? '');
  const setDraft = useUiStore((state) => state.setDraft);
  const clearDraft = useUiStore((state) => state.clearDraft);

  const enterToSend = useUiStore((state) => state.enterToSend);
  const setEnterToSend = useUiStore((state) => state.setEnterToSend);

  const pinnedHeight = useUiStore((state) => state.composerHeight);
  const setComposerHeight = useUiStore((state) => state.setComposerHeight);
  const resetComposerHeight = useUiStore((state) => state.resetComposerHeight);

  // The main timeline and the thread pane both mount a composer, so the switch
  // cannot carry a fixed id or its label would point at the other pane's.
  const enterToSendId = useId();
  // Same reason: the textarea names the active completion by id, and two panes
  // must not name each other's.
  const listboxId = useId();

  const textarea = useRef<HTMLTextAreaElement>(null);
  const suggestionPanel = useRef<HTMLDivElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const folderPicker = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isTyping = useRef(false);

  const [showPreview, setShowPreview] = useState(false);
  const [isSending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Open while the offer to send an over-long draft as a `.txt` is waiting. */
  const [longMessagePrompt, setLongMessagePrompt] = useState(false);
  /**
   * Where the caret is, as far as the completion panel is concerned. Null while
   * the box is unfocused, which is what closes the panel when focus leaves.
   *
   * Tracked in state rather than read from the textarea during render: a `@`
   * typed at the end and one typed mid-sentence are the same text, and only the
   * caret tells them apart.
   */
  const [caret, setCaret] = useState<number | null>(null);
  /**
   * The token Escape dismissed the panel for, so it stays shut for that one and
   * opens again for the next — dismissing `@jo` must not silence the `#` typed
   * two words later.
   */
  const [dismissed, setDismissed] = useState<string | null>(null);
  /** The highlighted row, tagged with the token it belongs to. */
  const [highlight, setHighlight] = useState<{ key: string | null; index: number } | null>(null);
  /**
   * What was typed into the panel's own search box, tagged the same way.
   *
   * Kept apart from the draft on purpose: searching for somebody is not the
   * same as writing their name into the message, and the word already in the
   * box stays exactly as it was until a row is actually chosen.
   */
  const [search, setSearch] = useState<{ key: string | null; value: string } | null>(null);
  /** What the box currently measures while it is sizing itself to the text. */
  const [autoHeight, setAutoHeight] = useState<number>(COMPOSER_HEIGHT.min);

  // Held in a ref so the unmount cleanup below does not need `realtime` as a
  // dependency, which would re-run it on every reconnect.
  const realtimeRef = useRef(realtime);
  useEffect(() => {
    realtimeRef.current = realtime;
  });

  const stopTyping = () => {
    if (!isTyping.current) return;
    isTyping.current = false;
    realtimeRef.current?.setTyping(serverId, roomId, false);
  };

  // Leaving the room mid-sentence would otherwise leave us stuck "typing"
  // forever in everyone else's client.
  useEffect(
    () => () => {
      if (!isTyping.current) return;
      isTyping.current = false;
      realtimeRef.current?.setTyping(serverId, roomId, false);
    },
    [serverId, roomId],
  );

  const signalTyping = () => {
    if (!realtime) return;

    if (!isTyping.current) {
      isTyping.current = true;
      realtime.setTyping(serverId, roomId, true);
    }

    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  /**
   * A height the user dragged to wins outright; otherwise the box grows with
   * the text up to a ceiling. Driven from an effect so both the draft changing
   * and the handle being reset land in the same place — including after a send,
   * when the box has to shrink back down.
   */
  useEffect(() => {
    const element = textarea.current;
    if (!element) return;

    if (pinnedHeight !== null) {
      element.style.height = `${pinnedHeight}px`;
      return;
    }

    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, COMPOSER_HEIGHT.default)}px`;
    setAutoHeight(element.offsetHeight);
  }, [pinnedHeight, draft]);

  /** Abandons the edit, leaving the original message as it was. */
  const cancelEdit = () => {
    clearTimeout(typingTimer.current);
    stopTyping();
    stopEditing();
    textarea.current?.focus();
  };

  /**
   * The message as it will be posted: the quote first, then what was typed.
   *
   * A function rather than a value so the preview and the send agree by
   * construction — the panel above the box is showing the message, not an
   * approximation of it.
   */
  const composed = (body: string): string =>
    quoting
      ? quotedText(
          { author: quoting.author, postedAt: formatDate(new Date(quoting.postedAt), QUOTE_STAMP_FORMAT) },
          quoting.text,
          body,
        )
      : body;

  /** Drops the staged quote; the draft under it is left alone. */
  const cancelQuote = () => {
    stopQuoting();
    textarea.current?.focus();
  };

  // Quoting is started from the timeline, so the box it stages the quote above
  // is somewhere else on the screen — the caret has to follow the action there,
  // or the user's next keystroke goes nowhere.
  const quotingId = quoting?.messageId;
  useEffect(() => {
    const element = textarea.current;
    if (!quotingId || !element) return;

    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, [quotingId]);

  // Starting an edit should land the caret in the box, at the end of the text —
  // the point of moving editing down here is that it behaves like typing.
  const editingId = editing?.messageId;
  useEffect(() => {
    const element = textarea.current;
    if (!editingId || !element) return;

    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, [editingId]);

  /**
   * @param options.asAttachment Answers the too-long prompt: the draft goes up
   *   as a `.txt` upload instead of being asked about again.
   */
  const submit = async ({ asAttachment = false }: { asAttachment?: boolean } = {}) => {
    const text = draft.trim();
    // What actually goes over the wire. Everything below measures and sends
    // this rather than the draft: the quote is part of the message, and a
    // server that refuses it for its length refuses the whole thing.
    const outgoing = composed(text);
    const staged = attachments.attachments.filter((item) => item.status !== 'rejected');

    if (isSending) return;
    // Enter reaches here even while the toolbar is showing the recorder; sending
    // now would post the text and silently drop the recording.
    if (isRecording) return;

    /*
     * Length is settled before anything else, as it is in Rocket.Chat's own
     * flow: the server refuses an over-long message whatever it was meant to
     * be, so the offer to send it as a file comes before it is read as a
     * command, an edit or a caption.
     *
     * An edit is excluded for the same reason Rocket.Chat excludes it — the
     * message being edited is already in the room, and replacing it with an
     * attachment is not what "save" means. A tray holding a file the server
     * would refuse is excluded too: that submit stops below either way, and
     * asking about the draft's length first would answer the wrong question.
     */
    const overLimit = outgoing.length > maxLength && !attachments.hasBlocking;
    const convertsToFile = overLimit && !editing && longMessagesConvert;

    if (overLimit && !convertsToFile) {
      setError(t('error.tooLong', { limit: maxLength }));
      return;
    }

    if (convertsToFile && !asAttachment) {
      setLongMessagePrompt(true);
      return;
    }

    if (editing) {
      // An empty edit is not a delete; Rocket.Chat has a separate action for
      // that, and silently removing somebody's message here would be a trap.
      if (!text) return;

      clearTimeout(typingTimer.current);
      stopTyping();
      setError(null);
      setSending(true);

      try {
        await edit.mutateAsync({ messageId: editing.messageId, text });
        // Clears the edit's draft slot too, handing the box back to whatever
        // was being typed before.
        stopEditing();
      } catch (editError) {
        setError(t('error.editFailed', { reason: describeError(editError) }));
      } finally {
        setSending(false);
      }

      return;
    }

    // A quote on its own is a message — "this", pointed at what somebody said —
    // so an empty box below one is not the empty submit that stops here.
    if ((!text && staged.length === 0 && !quoting) || attachments.hasBlocking) return;

    /*
     * A draft naming a command the server knows is run rather than sent.
     *
     * Both halves of that matter. Only on its own: Rocket.Chat has no way to
     * hand an upload to a command, so a staged file makes this a message that
     * merely starts with a slash. And only when the server knows the command:
     * `/etc/hosts is where it lives` is a sentence, and posting it as one beats
     * refusing it over a command nobody meant to type.
     *
     * A quote rules it out for the same reason a file does: there is nowhere to
     * put the quoted message in a command, so a draft written under one is a
     * message however it begins.
     */
    const command = staged.length === 0 && !convertsToFile && !quoting ? parseSlashCommand(text) : null;
    const matchedCommand = command ? slashCommands?.find((entry) => entry.command === command.command) : undefined;
    const isKnownCommand = Boolean(matchedCommand);

    if (matchedCommand && !canRunSlashCommand(capabilities, matchedCommand, room)) {
      setError(t('error.commandDenied', { command: matchedCommand.command }));
      return;
    }

    clearTimeout(typingTimer.current);
    stopTyping();
    setError(null);
    setSending(true);

    try {
      if (command && isKnownCommand) {
        await runCommand.mutateAsync({
          command: command.command,
          params: command.params,
          ...(threadId ? { threadId } : {}),
        });
      } else if (staged.length === 0 && !convertsToFile) {
        await send.mutateAsync({ text: outgoing, ...(threadId ? { threadId } : {}) });
      } else {
        // Rocket.Chat's upload endpoint takes one file per request, so the
        // composer text rides along with the first file as its message and the
        // rest are posted with their own captions.
        let uploaded = 0;

        // The draft the server would refuse goes up as its own file, ahead of
        // anything staged, so it reads as the message it was written to be —
        // and, being a file now, it never rides along as another one's text.
        if (convertsToFile) {
          await upload.mutateAsync({
            file: longMessageFile(outgoing, user.username, new Date()),
            ...(threadId ? { threadId } : {}),
          });
          uploaded += 1;
        }

        for (const item of staged) {
          // Null once the tile has been removed: the user took the file back
          // while an earlier one was still going up, so it must not be posted.
          const signal = attachments.beginUpload(item.id);
          if (!signal) continue;

          try {
            // Through the mutation rather than the client directly: it puts the
            // message the server made into the timeline as each file lands, so
            // an upload appears while the rest of the batch is still going up.
            await upload.mutateAsync({
              file: item.file,
              signal,
              onProgress: ({ loaded, total }) => attachments.setProgress(item.id, loaded, total),
              ...(item.caption ? { description: item.caption } : {}),
              // The text belongs to the first file that actually goes up, not
              // to whichever one was first before the removals.
              ...(uploaded === 0 && outgoing ? { text: outgoing } : {}),
              ...(threadId ? { threadId } : {}),
            });
            uploaded += 1;
          } catch (uploadError) {
            // Aborting is how `remove` cancels an upload in flight; its tile is
            // already gone, so there is nothing to mark as failed and no reason
            // to stop the files behind it.
            if (signal.aborted) continue;

            attachments.setStatus(item.id, 'failed');
            throw uploadError;
          } finally {
            attachments.endUpload(item.id);
          }
        }

        // Every file was taken back, so nothing was sent: keep the draft and
        // hand the composer straight back instead of clearing it.
        if (uploaded === 0) return;
      }

      clearDraft(draftKey);
      attachments.clear();
      // Only ever this room's: `quoting` is already narrowed to it, and the
      // slot is a single one shared with whatever other room may be holding a
      // quote of its own.
      if (quoting) stopQuoting();
    } catch (submitError) {
      // The draft is deliberately left in place: losing what somebody typed is
      // worse than making them press send again.
      setError(
        command && isKnownCommand
          ? t('error.commandFailed', { command: command.command, reason: describeError(submitError) })
          : t('error.sendFailed', { reason: describeError(submitError) }),
      );
    } finally {
      setSending(false);
    }
  };

  /**
   * Inserts text at the caret, or appends it when the textarea has not been
   * focused.
   */
  const insertAtCaret = (token: string) => {
    const element = textarea.current;

    if (!element) {
      setDraft(draftKey, `${draft}${token}`);
      return;
    }

    const start = element.selectionStart ?? draft.length;
    const end = element.selectionEnd ?? start;
    const next = `${draft.slice(0, start)}${token}${draft.slice(end)}`;

    setDraft(draftKey, next);

    // Restoring the caret has to wait for React to paint the new value.
    requestAnimationFrame(() => {
      element.focus();
      const position = start + token.length;
      element.setSelectionRange(position, position);
      setCaret(position);
    });
  };

  /** Puts a rewritten draft in the box and the caret back where it belongs. */
  const applyResult = (result: FormatResult) => {
    const element = textarea.current;

    if (element) {
      // Written straight into the box before the state update rather than after
      // it. A controlled textarea whose value grows puts the caret at the end,
      // and a caret put back a frame later is a frame in which anything typed —
      // and the next keystroke of a fast typist is inside that frame — lands
      // after the text this just wrote. React sees its own value on the next
      // render and leaves both the value and the caret alone.
      element.focus();
      element.value = result.text;
      element.setSelectionRange(result.start, result.end);
    }

    setDraft(draftKey, result.text);
    setCaret(result.end);
  };

  /**
   * Wraps whatever is selected in a formatting mark, or unwraps it when it is
   * already marked.
   *
   * The selection is put back afterwards rather than collapsed, so a run can be
   * bolded and then underlined without reaching for the mouse again — and with
   * nothing selected the caret lands between the marks, ready to type into.
   */
  const format = (mark: MarkName) => {
    const element = textarea.current;
    const start = element?.selectionStart ?? draft.length;
    const end = element?.selectionEnd ?? start;

    applyResult(applyMark(draft, start, end, mark));
  };

  /**
   * Rocket.Chat renders `:shortcode:` as the emoji, so the text that goes over
   * the wire is what a Rocket.Chat client would have sent.
   */
  const insertEmoji = (shortcode: string) => insertAtCaret(`:${shortcode}: `);

  /**
   * Stages the chosen GIF as an upload, so it lands in the room as an image
   * rather than as a link somebody has to click.
   *
   * Falls back to the link when uploads are off server-side, and when GIPHY's
   * CDN refuses the cross-origin read — in both cases a link that works beats a
   * GIF that never arrives.
   */
  const attachGif = async (gif: GiphyGif) => {
    if (!uploadsAllowed) {
      insertAtCaret(`${gif.pageUrl} `);
      return;
    }

    setError(null);

    try {
      attachments.addFiles([await fetchGifFile(gif)]);
    } catch {
      insertAtCaret(`${gif.url} `);
      setError(t('error.gifAttachFailed'));
    }
  };

  // Recordings are staged like any other attachment: the tray is where they can
  // be played back, captioned, and thrown away before anyone else hears them.
  const voice = useVoiceRecording({ onComplete: (file) => attachments.addFiles([file]) });
  const isRecording = voice.status !== 'idle';

  /*
   * Completions for whatever the caret is sitting in: `@` for people, `#` for
   * rooms, and `/` at the start of the box for the server's slash commands.
   *
   * Nothing is fetched until one of those is typed. The panel is suppressed
   * while a recording is in progress, where the toolbar has been replaced and
   * Enter means something else entirely.
   */
  /*
   * Which token the panel is currently answering for.
   *
   * Every piece of panel state is stored against this key rather than reset
   * when it changes: a dismissal belongs to the token it dismissed, and so do
   * the search term and the highlight. Keying them means a new token starts
   * clean without an effect having to notice and clear anything.
   */
  const preToken = !disabled && !isRecording && caret !== null ? findAutocompleteToken(draft, caret) : null;
  const tokenKey = preToken ? `${preToken.kind}:${preToken.start}` : null;
  /** Non-null once the panel's own search box has been typed in. */
  const searchQuery = search?.key === tokenKey ? search.value : null;

  const autocomplete = useComposerAutocomplete({
    roomId,
    text: draft,
    caret,
    query: searchQuery,
    enabled: !disabled && !isRecording,
  });

  const suggestions = autocomplete.items;

  const suggestionsOpen =
    Boolean(autocomplete.token) &&
    dismissed !== tokenKey &&
    // With the search box in use the panel stays put even with nothing to show:
    // it is holding the caret, and closing it under the user's hands would take
    // both the box and what they had typed into it.
    (suggestions.length > 0 || autocomplete.isLoading || searchQuery !== null);
  // Clamped rather than trusted: the list is rebuilt on every keystroke, and an
  // index from a longer one would point past the end of this one.
  const highlightKey = `${tokenKey}:${searchQuery ?? ''}`;
  const activeSuggestion =
    highlight?.key === highlightKey ? Math.min(highlight.index, Math.max(suggestions.length - 1, 0)) : 0;

  const highlightSuggestion = (index: number) => setHighlight({ key: highlightKey, index });

  /** Takes the caret from the textarea, which is the only place that knows it. */
  const syncCaret = () => setCaret(textarea.current?.selectionStart ?? null);

  /**
   * Closes the panel, unless focus is merely moving inside it.
   *
   * The panel lives on the caret, so leaving the box would normally shut it —
   * which is right for a click on the timeline and quite wrong for a click on
   * the panel's own search box.
   */
  const closeUnlessMovingIntoPanel = (next: EventTarget | null) => {
    if (next instanceof Node && suggestionPanel.current?.contains(next)) return;
    setCaret(null);
    setSearch(null);
  };

  /**
   * Puts the chosen completion in place of the token that produced it.
   *
   * The caret lands after the trailing space, so a mention can be followed
   * straight on by the rest of the sentence.
   */
  const applySuggestion = (item: AutocompleteItem) => {
    const token = autocomplete.token;
    if (!token) return;

    const result = replaceAutocompleteToken(draft, token, item.value);
    setDraft(draftKey, result.text);
    setDismissed(null);
    // The search was about this token; the next one starts from its own word.
    setSearch(null);
    // Moved with the text rather than after it: the panel is derived from the
    // caret, and leaving it a frame behind would re-open it on the token that
    // has just been completed.
    setCaret(result.caret);

    // The textarea's own selection still has to wait for React to paint.
    requestAnimationFrame(() => {
      const element = textarea.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(result.caret, result.caret);
    });
  };

  /**
   * The message ↑ reopens: the most recent one of yours this room will still
   * let you edit.
   *
   * The server's own rules decide that — the edit setting, the permission, the
   * time limit — so the shortcut can never start an edit the save would be
   * refused for, and never lands on somebody else's message.
   */
  const lastEditableOwnMessage = () => {
    const messages = timeline?.messages ?? [];

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]!;
      if (message.sender.id !== user.id) continue;
      // Thread replies live in the timeline too, but they are edited from the
      // thread they were written in.
      if (message.threadId) continue;
      if (canEditMessage(capabilities, message, room, user.id)) return message;
    }

    return undefined;
  };

  /**
   * The panel's own keys: navigating the list, accepting a row, closing it.
   *
   * Shared by the message box and the panel's search box, so the list is driven
   * the same way from either — and returns whether it took the press, which is
   * what stops the box below from acting on the same key.
   */
  const handleSuggestionKey = (event: KeyboardEvent<HTMLElement>): boolean => {
    if (!suggestionsOpen) return false;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (suggestions.length === 0) return true;

      const step = event.key === 'ArrowDown' ? 1 : -1;
      // Wraps, so holding one arrow reaches every match without pressing the
      // other one to get back.
      highlightSuggestion((suggestions.length + activeSuggestion + step) % suggestions.length);
      return true;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      const chosen = suggestions[activeSuggestion];
      // Nothing to accept while the matches are still loading; the press falls
      // through to the box, which is what an empty panel is worth.
      if (!chosen) return false;

      event.preventDefault();
      applySuggestion(chosen);
      return true;
    }

    if (event.key === 'Escape') {
      // Stops here rather than reaching the edit banner below: the panel is
      // what Escape most recently opened, so it is what closes.
      event.preventDefault();
      setDismissed(tokenKey);
      setSearch(null);
      // Escaping out of the search box has to hand the caret back, or the next
      // keystroke would go into a box that is no longer on screen.
      textarea.current?.focus();
      return true;
    }

    return false;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    /*
     * The completion panel takes the navigation keys first, and only while it
     * is open: with it up, Enter accepts the highlighted match rather than
     * sending, and ↑ moves through the list rather than reopening an edit.
     */
    if (handleSuggestionKey(event)) return;

    // Before Enter, so a chord is never mistaken for a send, and before the
    // browser gets to act on ⌘U (view source) or ⌘I (dev tools on Linux).
    if (hasModifier(event) && !event.altKey) {
      // Optional for the same reason as the sidebar shortcut: events that reach
      // the box without a `key` (autofill, password managers) are not chords.
      const key = event.key?.toLowerCase();
      const mark = MARK_ORDER.find(
        (name) => MARK_SHORTCUTS[name]?.key === key && Boolean(MARK_SHORTCUTS[name]?.shift) === event.shiftKey,
      );

      if (mark) {
        event.preventDefault();
        format(mark);
        return;
      }
    }

    if (event.key === 'Enter') {
      if (sendsOnEnter(event, enterToSend)) {
        event.preventDefault();
        void submit();
      }

      // Returns either way: with the setting off, a bare Enter is a new line
      // and must reach the textarea untouched.
      return;
    }

    // Escape abandons the edit, which is the only way out that leaves the
    // original message untouched.
    if (event.key === 'Escape' && editing) {
      event.preventDefault();
      cancelEdit();
      return;
    }

    // The same key drops a staged quote — the two never coexist, so there is
    // no order to get wrong.
    if (event.key === 'Escape' && quoting) {
      event.preventDefault();
      cancelQuote();
      return;
    }

    /*
     * ↑ reopens your last message, as it does in Rocket.Chat — but only from an
     * empty box, and only when nothing is being edited already. With text in it
     * the key still moves the caret, which is what someone typing a second line
     * is reaching for.
     *
     * The thread box is left alone: editing is hosted by the main composer
     * (see `pending` above), so starting one from here would move the banner to
     * a different pane than the one the key was pressed in.
     */
    if (event.key === 'ArrowUp' && !threadId && !editing && draft === '' && !hasModifier(event) && !event.altKey) {
      const message = lastEditableOwnMessage();
      if (!message) return;

      event.preventDefault();
      startEditing({ roomId: message.roomId, messageId: message.id, originalText: message.text });
    }
  };

  /** Drives the counter's colour only; length is no longer a send guard. */
  const tooLong = draft.length > maxLength;
  /*
   * Length is deliberately absent from this.
   *
   * Disabling the button over it was what kept the too-long path unreachable:
   * the draft can go up as a `.txt` on most servers, and pressing send is what
   * raises that offer. Where it cannot — an edit, or a server with the
   * conversion or uploads switched off — submit says why, which beats a dead
   * button and a red counter as the only explanation. Rocket.Chat's own
   * composer behaves the same way.
   */
  const canSend = editing
    ? draft.trim().length > 0
    : (draft.trim().length > 0 || attachments.attachments.length > 0 || Boolean(quoting)) && !attachments.hasBlocking;
  const heightBounds = composerBounds(window.innerHeight);

  // Which key does what is now the user's choice, so the hint has to be read
  // off the setting rather than stated as fact.
  const suffix = enterToSend ? '' : 'WithModifier';
  const keyHint = t(`hint.${editing ? 'editing' : 'send'}${suffix}`, { mod: modifierKey() });

  return (
    // Dragged files are handled by the drop zone wrapping the whole
    // conversation, not here: dropping onto the timeline has to work too.
    <div className="border-line bg-app relative border-t p-3">
      {/* On the top border, where the box meets the timeline: dragging up
          makes room to type, which is why the axis is inverted. */}
      <ResizeHandle
        axis="y"
        invert
        value={pinnedHeight ?? autoHeight}
        min={heightBounds.min}
        max={heightBounds.max}
        label={t('action.resize')}
        onResize={setComposerHeight}
        onReset={resetComposerHeight}
        className="-top-1"
      />

      {/* Above the whole box rather than beside the caret: a textarea reports
          no position for its caret, and guessing one lands the panel in the
          wrong place the moment a line wraps. */}
      {suggestionsOpen ? (
        <ComposerAutocomplete
          id={listboxId}
          ref={suggestionPanel}
          items={suggestions}
          activeIndex={activeSuggestion}
          isLoading={autocomplete.isLoading}
          // Commands have no search box: the list is short, and the slash the
          // user has already typed is the search.
          {...(autocomplete.token?.kind === 'command'
            ? {}
            : {
                search: {
                  value: autocomplete.term,
                  placeholder: t(
                    autocomplete.token?.kind === 'channel' ? 'autocomplete.searchRooms' : 'autocomplete.searchUsers',
                  ),
                  onChange: (value: string) => setSearch({ key: tokenKey, value }),
                  onKeyDown: handleSuggestionKey,
                  onBlur: (event: FocusEvent<HTMLInputElement>) => closeUnlessMovingIntoPanel(event.relatedTarget),
                },
              })}
          optionId={(index) => `${listboxId}-${index}`}
          onSelect={applySuggestion}
          onHighlight={highlightSuggestion}
        />
      ) : null}

      {editing ? (
        <div className="border-accent bg-accent-subtle mb-2 flex items-center gap-2 rounded-lg border px-3 py-1.5">
          <Icons.edit size={14} className="text-accent shrink-0" />
          <p className="min-w-0 flex-1 truncate text-xs">
            <span className="text-accent font-semibold">{t('editing.label')}</span>{' '}
            <span className="text-content-muted">{editing.originalText.trim() || t('editing.noText')}</span>
          </p>
          <button
            type="button"
            aria-label={t('editing.cancel')}
            title={t('editing.cancel')}
            onClick={cancelEdit}
            className="text-content-muted hover:bg-sunken hover:text-content shrink-0 rounded p-0.5 transition-colors"
          >
            <Icons.close size={14} />
          </button>
        </div>
      ) : null}

      {quoting ? (
        // The same left rule the timeline draws down a blockquote, so the strip
        // is recognisable as the thing it is about to post.
        <div className="border-line border-l-accent bg-raised mb-2 flex items-center gap-2 rounded-lg border border-l-2 px-3 py-1.5">
          <Icons.quote size={14} className="text-accent shrink-0" />
          <p className="min-w-0 flex-1 truncate text-xs">
            <span className="text-accent font-semibold">{t('quoting.label', { name: quoting.author })}</span>{' '}
            <span className="text-content-muted">
              {quoting.text.trim() ||
                (quoting.fileCount > 0 ? tMessages('attachments', { count: quoting.fileCount }) : t('quoting.noText'))}
            </span>
          </p>
          <button
            type="button"
            aria-label={t('quoting.cancel')}
            title={t('quoting.cancel')}
            onClick={cancelQuote}
            className="text-content-muted hover:bg-sunken hover:text-content shrink-0 rounded p-0.5 transition-colors"
          >
            <Icons.close size={14} />
          </button>
        </div>
      ) : null}

      <AttachmentTray
        attachments={attachments.attachments}
        mediaItems={attachments.mediaItems}
        onRemove={attachments.remove}
        onClear={attachments.clear}
        onCaptionChange={attachments.setCaption}
      />

      {showPreview ? (
        <section className="border-line bg-raised mb-2 rounded-lg border p-3" aria-label={t('preview.title')}>
          <header className="text-content-muted mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase">
            <Icons.preview size={13} />
            {t('preview.title')}
          </header>

          {/* The same renderer the timeline uses, so this is not an
              approximation of the sent message — it is the sent message. */}
          {draft.trim() || quoting ? (
            // Capped so a long draft cannot push the box it is previewing off
            // the bottom of the screen.
            <MessageBody
              text={composed(draft)}
              // Nothing has been posted, so there is no server verdict on which
              // names are mentions — the preview shows what they are about to
              // become rather than nothing at all.
              assumeMentions
              className="scrollbar-slim max-h-48 overflow-y-auto text-sm leading-relaxed break-words"
            />
          ) : (
            <p className="text-content-muted text-sm italic">{t('preview.empty')}</p>
          )}
        </section>
      ) : null}

      {/* Above the box and hard right, out of the way of the editing banner and
          the preview that share this strip.

          The 9px is what stands between this strip's right edge and the send
          button's: the box below owns a 1px border and its toolbar another 8px
          of padding, neither of which applies out here. Matching it lines the
          switch up with the button rather than hanging it past the corner. */}
      <div className="mb-1.5 flex items-center justify-end gap-2 pr-[9px]">
        <label htmlFor={enterToSendId} className="text-content-muted cursor-pointer text-xs select-none">
          {t('enterToSend.label')}
        </label>
        {/* Left unscaled: a transform shrinks the switch about its centre, which
            would pull its visible edge back off the line just drawn. */}
        <Switch id={enterToSendId} checked={enterToSend} onCheckedChange={setEnterToSend} disabled={disabled} />
      </div>

      <div
        className={cn(
          'border-line bg-app focus-within:border-focus rounded-xl border transition-colors',
          disabled && 'opacity-60',
        )}
      >
        <input
          ref={filePicker}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) attachments.addFiles(event.target.files);
            // Reset so picking the same file twice still fires a change.
            event.target.value = '';
          }}
        />
        <input
          ref={folderPicker}
          type="file"
          multiple
          // Non-standard but universally supported, and the only way to offer
          // folder selection from a file input.
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          className="hidden"
          onChange={(event) => {
            if (event.target.files) attachments.addFiles(event.target.files);
            event.target.value = '';
          }}
        />

        <textarea
          ref={textarea}
          value={draft}
          rows={1}
          disabled={disabled}
          placeholder={editing ? keyHint : placeholder}
          aria-label={editing ? t('action.saveEdit') : placeholder}
          // Focus never leaves the box while completing, so the panel is
          // announced through the textarea rather than as a thing of its own.
          role="combobox"
          aria-expanded={suggestionsOpen}
          aria-autocomplete="list"
          aria-controls={suggestionsOpen ? listboxId : undefined}
          aria-activedescendant={
            suggestionsOpen && suggestions.length > 0 ? `${listboxId}-${activeSuggestion}` : undefined
          }
          onChange={(event) => {
            const opened = closeCodeFence(event.target.value, event.target.selectionStart);

            if (opened) {
              applyResult(opened);
            } else {
              setDraft(draftKey, event.target.value);
              setCaret(event.target.selectionStart);
            }

            // Typing in the message again is the user taking the question back:
            // what the panel matches on returns to the word under the caret.
            setSearch(null);
            signalTyping();
          }}
          onKeyDown={onKeyDown}
          // The caret also moves without the text changing — arrows, clicks,
          // Home — and each of those can move it into or out of a token.
          onKeyUp={syncCaret}
          onClick={syncCaret}
          onFocus={syncCaret}
          onBlur={(event) => {
            stopTyping();
            // Closes the panel — unless focus is on its way into it, which is
            // what reaching for its search box looks like from here. Choosing a
            // row does not blur at all: the rows cancel their own mousedown.
            closeUnlessMovingIntoPanel(event.relatedTarget);
          }}
          onPaste={(event) => {
            // Pasted screenshots arrive as files, not text — except mid-edit,
            // where there is nothing to attach them to.
            if (!editing && event.clipboardData.files.length > 0) {
              event.preventDefault();
              if (uploadsAllowed) attachments.addFiles(event.clipboardData.files);
            }
          }}
          // Height is owned by the effect above, so the browser's own resize
          // grip is turned off in favour of the handle on the top edge.
          className="text-content placeholder:text-content-muted scrollbar-slim w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm focus:outline-none"
        />

        {isRecording ? (
          <VoiceRecorderBar
            seconds={voice.seconds}
            starting={voice.status === 'starting'}
            onCancel={voice.cancel}
            onStop={voice.stop}
          />
        ) : (
          <div className="flex items-center gap-0.5 px-2 pb-2">
            <EmojiPicker
              onSelect={insertEmoji}
              trigger={
                <button
                  type="button"
                  aria-label={t('action.emoji')}
                  title={t('action.emoji')}
                  disabled={disabled}
                  className="text-content-muted hover:bg-sunken hover:text-content flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-40"
                >
                  <Icons.emoji size={18} />
                </button>
              }
            />
            <GifPicker
              onSelect={attachGif}
              trigger={
                <button
                  type="button"
                  aria-label={t('action.gif')}
                  title={t('action.gif')}
                  disabled={disabled || Boolean(editing)}
                  className="text-content-muted hover:bg-sunken hover:text-content flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-40"
                >
                  <Icons.gif size={18} />
                </button>
              }
            />
            {uploadsAllowed ? (
              <ToolbarButton
                label={t('action.attachFiles')}
                disabled={disabled || Boolean(editing)}
                onClick={() => filePicker.current?.click()}
              >
                <Icons.attach size={18} />
              </ToolbarButton>
            ) : null}
            {uploadsAllowed ? (
              <ToolbarButton
                label={t('action.attachFolder')}
                disabled={disabled || Boolean(editing)}
                onClick={() => folderPicker.current?.click()}
              >
                <Icons.attachFolder size={18} />
              </ToolbarButton>
            ) : null}

            <FormattingMenu
              onApply={format}
              disabled={disabled}
              trigger={
                <button
                  type="button"
                  aria-label={t('action.formatting')}
                  title={t('action.formatting')}
                  disabled={disabled}
                  className="text-content-muted hover:bg-sunken hover:text-content flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-40"
                >
                  <Icons.formatting size={18} />
                </button>
              }
            />
            {/* A voice message is an upload, so it is gated like the paperclip:
                hidden outright on a server that does not accept files. */}
            {uploadsAllowed && voice.supported ? (
              <ToolbarButton
                label={t('action.voiceMessage')}
                disabled={disabled || Boolean(editing)}
                onClick={() => void voice.start()}
              >
                <Icons.audio size={18} />
              </ToolbarButton>
            ) : null}
            <ToolbarButton
              label={showPreview ? t('action.hidePreview') : t('action.preview')}
              disabled={disabled}
              pressed={showPreview}
              onClick={() => setShowPreview((open) => !open)}
            >
              <Icons.preview size={18} />
            </ToolbarButton>

            {draft.length > maxLength * 0.9 ? (
              <span className={cn('ml-2 text-xs tabular-nums', tooLong ? 'text-danger' : 'text-content-muted')}>
                {maxLength - draft.length}
              </span>
            ) : null}

            <div className="flex-1" />

            {editing ? (
              <button
                type="button"
                onClick={cancelEdit}
                className="text-content-muted hover:bg-sunken hover:text-content mr-1 h-8 rounded-lg px-3 text-sm transition-colors"
              >
                {tCommon('action.cancel')}
              </button>
            ) : null}

            <button
              type="button"
              aria-label={editing ? t('action.saveEdit') : t('action.send')}
              title={keyHint}
              disabled={disabled || !canSend || isSending}
              onClick={() => void submit()}
              className="bg-accent text-accent-content hover:bg-accent-hover flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors disabled:opacity-40"
            >
              {isSending ? <Spinner className="size-4" /> : editing ? tCommon('action.save') : <Icons.send size={18} />}
            </button>
          </div>
        )}
      </div>

      <LongMessageConfirm
        open={longMessagePrompt}
        onOpenChange={setLongMessagePrompt}
        limit={maxLength}
        pending={isSending}
        onConfirm={() => {
          setLongMessagePrompt(false);
          void submit({ asAttachment: true });
        }}
      />

      {/* One alert line serves both: a failed send and a refused microphone are
          never in flight at the same time. */}
      {error ? (
        <p role="alert" className="text-danger mt-1.5 px-1 text-xs">
          {error}
        </p>
      ) : voice.error ? (
        <p role="alert" className="text-danger mt-1.5 px-1 text-xs">
          {t(`voice.error.${voice.error}`)}
        </p>
      ) : null}
    </div>
  );
};
