import {
  IconContext,
  AppleLogo,
  ArrowBendDoubleUpRight,
  ArrowLeft,
  ArrowsOutSimple,
  At,
  Bell,
  BookmarkSimple,
  CaretDown,
  CaretLeft,
  CaretRight,
  ChatCircleText,
  ChatsCircle,
  CheckCircle,
  Code,
  CodeBlock,
  Copy,
  DotsSix,
  DotsSixVertical,
  DotsThree,
  DownloadSimple,
  Eye,
  FileAudio,
  FileCode,
  FileCsv,
  FileDoc,
  FileImage,
  FilePdf,
  FilePpt,
  FileText,
  FileVideo,
  FileXls,
  FileZip,
  FolderPlus,
  Gear,
  GifIcon,
  Hash,
  Info,
  Link as LinkIcon,
  ListBullets,
  MagnifyingGlass,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Microphone,
  Moon,
  Paperclip,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  PlugsConnected,
  PushPin,
  Quotes,
  SignOut,
  SmileyIcon,
  SpinnerGap,
  Star,
  StopCircle,
  TextAa,
  TextB,
  TextItalic,
  TextStrikethrough,
  TextUnderline,
  Trash,
  UploadSimple,
  UserPlus,
  Users,
  WarningCircle,
  X,
  BellSlash,
  Lock,
  ArrowSquareOut,
  Sun,
  Palette,
  Translate,
  Eraser,
  Keyboard,
  Crown,
  ShieldCheck,
  Megaphone,
  UserMinus,
  MicrophoneSlash,
  Envelope,
  DeviceMobile,
  Desktop,
  Clock,
  Archive,
  Broadcast,
  Globe,
  Funnel,
  SpeakerHigh,
  FacebookLogo,
  GithubLogo,
  GitlabLogo,
  GoogleLogo,
  LinkedinLogo,
  SignIn,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Every icon the app uses, in one place.
 *
 * Components import from here rather than from `@phosphor-icons/react`
 * directly, so swapping or renaming an icon is a single edit and no component
 * ever picks a weight of its own.
 */
export const Icons = {
  add: Plus,
  addMembers: UserPlus,
  archive: Archive,
  attach: Paperclip,
  attachFolder: FolderPlus,
  audio: Microphone,
  back: ArrowLeft,
  bookmark: BookmarkSimple,
  broadcast: Broadcast,
  channel: Hash,
  clock: Clock,
  chevronDown: CaretDown,
  chevronLeft: CaretLeft,
  chevronRight: CaretRight,
  close: X,
  connection: PlugsConnected,
  copy: Copy,
  delete: Trash,
  desktop: Desktop,
  direct: ChatCircleText,
  download: DownloadSimple,
  edit: PencilSimple,
  email: Envelope,
  emoji: SmileyIcon,
  eraser: Eraser,
  error: WarningCircle,
  expand: ArrowsOutSimple,
  file: FileText,
  // One mark per family of upload, so a document is recognisable in the
  // timeline before its name has been read. `file` is the fallback for
  // anything unrecognised; see `fileIconOf`.
  fileArchive: FileZip,
  fileAudio: FileAudio,
  fileCode: FileCode,
  fileCsv: FileCsv,
  fileDoc: FileDoc,
  fileImage: FileImage,
  filePdf: FilePdf,
  fileSheet: FileXls,
  fileSlides: FilePpt,
  fileVideo: FileVideo,
  filter: Funnel,
  // The double bend is the forward mark; the single one everybody reads as a
  // reply, which is a different action this toolbar already offers.
  forward: ArrowBendDoubleUpRight,
  formatting: TextAa,
  // The formatting menu's own marks, named after the action rather than the
  // markup so the toolbar reads the same as the shortcuts panel.
  bold: TextB,
  italic: TextItalic,
  underline: TextUnderline,
  strike: TextStrikethrough,
  code: Code,
  codeBlock: CodeBlock,
  // Room roles, in the order Rocket.Chat ranks them.
  roleOwner: Crown,
  roleModerator: ShieldCheck,
  roleLeader: Megaphone,
  gif: GifIcon,
  // Six dots, the near-universal "drag me" mark. Named by the axis the grip
  // runs along: the tall one sits on a column divider, the wide one on a row.
  gripVertical: DotsSixVertical,
  gripHorizontal: DotsSix,
  globe: Globe,
  info: Info,
  integrations: ListBullets,
  keyboard: Keyboard,
  link: LinkIcon,
  leave: SignOut,
  members: Users,
  mention: At,
  mobile: DeviceMobile,
  more: DotsThree,
  mute: BellSlash,
  /** Silencing a *member* in a room, as opposed to muting the room itself. */
  muteMember: MicrophoneSlash,
  notifications: Bell,
  removeMember: UserMinus,
  sound: SpeakerHigh,
  openExternal: ArrowSquareOut,
  palette: Palette,
  pin: PushPin,
  preview: Eye,
  private: Lock,
  // The quotation marks, not a bent arrow: the arrows are taken by forwarding
  // and by replying in a thread, and a quote is neither of those.
  quote: Quotes,
  search: MagnifyingGlass,
  send: PaperPlaneTilt,
  settings: Gear,
  signIn: SignIn,
  signOut: SignOut,
  // Sign-in providers, keyed by the name the gateway reports. Only the ones
  // with a real mark are here; anything else falls back to `signIn`.
  providerApple: AppleLogo,
  providerFacebook: FacebookLogo,
  providerGithub: GithubLogo,
  providerGitlab: GitlabLogo,
  providerGoogle: GoogleLogo,
  providerLinkedin: LinkedinLogo,
  spinner: SpinnerGap,
  star: Star,
  /** Ends a voice recording; the round stop mark every recorder uses. */
  stop: StopCircle,
  success: CheckCircle,
  themeDark: Moon,
  themeLight: Sun,
  threads: ChatsCircle,
  translate: Translate,
  upload: UploadSimple,
  zoomIn: MagnifyingGlassPlus,
  zoomOut: MagnifyingGlassMinus,
} as const;

export type IconName = keyof typeof Icons;

/**
 * `light` is the project's default weight; a filled variant is opt-in per
 * instance (`<Icons.star weight="fill" />`) for state such as "favourited".
 */
export const IconProvider = ({ children }: { children: ReactNode }) => (
  <IconContext.Provider value={{ weight: 'light', size: 20 }}>{children}</IconContext.Provider>
);

/**
 * A spinner that respects `prefers-reduced-motion`.
 *
 * The rotation is a CSS animation rather than an `<animateTransform>`: a
 * `transform` on the outermost `<svg>` is resolved in the parent's coordinate
 * space, not the viewBox, so rotating about the viewBox centre (128 128) swung
 * the icon around a point 128px away and it orbited instead of spinning in
 * place. `transform-origin: 50% 50%` on the element's own box is what "spin
 * where you are" actually means, and `motion-safe` is what makes the reduced
 * motion promise above true.
 */
export const Spinner = ({ className }: { className?: string }) => (
  <Icons.spinner className={cn('origin-center motion-safe:animate-spin', className)} weight="light" aria-hidden />
);
