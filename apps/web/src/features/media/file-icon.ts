import type { IconName } from '@/ui/icon';

import { mediaKindOf } from './media';

/**
 * Extension first, because it is the more precise of the two signals: a `.docx`
 * and a `.xlsx` are both `application/vnd.openxmlformats-officedocument.…`, and
 * Rocket.Chat leaves the MIME type null on older upload records entirely.
 */
const ICON_BY_EXTENSION: Record<string, IconName> = {
  pdf: 'filePdf',

  doc: 'fileDoc',
  docx: 'fileDoc',
  odt: 'fileDoc',
  rtf: 'fileDoc',
  pages: 'fileDoc',

  xls: 'fileSheet',
  xlsx: 'fileSheet',
  ods: 'fileSheet',
  numbers: 'fileSheet',

  csv: 'fileCsv',
  tsv: 'fileCsv',

  ppt: 'fileSlides',
  pptx: 'fileSlides',
  odp: 'fileSlides',
  key: 'fileSlides',

  zip: 'fileArchive',
  rar: 'fileArchive',
  '7z': 'fileArchive',
  tar: 'fileArchive',
  gz: 'fileArchive',
  tgz: 'fileArchive',
  bz2: 'fileArchive',
  xz: 'fileArchive',

  c: 'fileCode',
  cpp: 'fileCode',
  cs: 'fileCode',
  css: 'fileCode',
  go: 'fileCode',
  h: 'fileCode',
  html: 'fileCode',
  java: 'fileCode',
  js: 'fileCode',
  json: 'fileCode',
  jsx: 'fileCode',
  kt: 'fileCode',
  php: 'fileCode',
  py: 'fileCode',
  rb: 'fileCode',
  rs: 'fileCode',
  scss: 'fileCode',
  sh: 'fileCode',
  sql: 'fileCode',
  swift: 'fileCode',
  ts: 'fileCode',
  tsx: 'fileCode',
  vue: 'fileCode',
  xml: 'fileCode',
  yaml: 'fileCode',
  yml: 'fileCode',
};

/** Exact MIME types worth a mark of their own, for files sent without a name. */
const ICON_BY_MIME: Record<string, IconName> = {
  'application/pdf': 'filePdf',
  'application/msword': 'fileDoc',
  'application/rtf': 'fileDoc',
  'application/vnd.oasis.opendocument.text': 'fileDoc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'fileDoc',
  'application/vnd.ms-excel': 'fileSheet',
  'application/vnd.oasis.opendocument.spreadsheet': 'fileSheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'fileSheet',
  'application/vnd.ms-powerpoint': 'fileSlides',
  'application/vnd.oasis.opendocument.presentation': 'fileSlides',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'fileSlides',
  'application/gzip': 'fileArchive',
  'application/x-7z-compressed': 'fileArchive',
  'application/x-rar-compressed': 'fileArchive',
  'application/x-tar': 'fileArchive',
  'application/zip': 'fileArchive',
  'application/json': 'fileCode',
  'application/xml': 'fileCode',
  'text/csv': 'fileCsv',
  'text/html': 'fileCode',
  'text/javascript': 'fileCode',
  'text/xml': 'fileCode',
};

/**
 * The icon that stands for an upload's type.
 *
 * Everywhere a file is listed without a picture of itself — the composer tray,
 * the Files panel, a document attached to a message — this is what tells the
 * two apart at a glance. Unknown types fall back to the plain sheet rather than
 * guessing, so a wrong mark never claims more than the file's name does.
 */
export const fileIconOf = (mimeType: string | null | undefined, name = ''): IconName => {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  const byExtension = extension === name.toLowerCase() ? undefined : ICON_BY_EXTENSION[extension];
  if (byExtension) return byExtension;

  const type = mimeType?.split(';')[0]?.trim().toLowerCase() ?? '';
  const byMime = ICON_BY_MIME[type];
  if (byMime) return byMime;

  // Media families the viewer already knows how to classify, so a `.heic` photo
  // or a codec-of-the-week video still gets the right mark.
  const kind = mediaKindOf(mimeType, name);
  if (kind === 'image') return 'fileImage';
  if (kind === 'video') return 'fileVideo';
  if (kind === 'audio') return 'fileAudio';

  return 'file';
};
