import { describe, expect, it } from 'vitest';

import { fileIconOf } from '../file-icon';

describe('fileIconOf', () => {
  it('names the document families by extension', () => {
    expect(fileIconOf('application/pdf', 'invoice.pdf')).toBe('filePdf');
    expect(fileIconOf(null, 'report.docx')).toBe('fileDoc');
    expect(fileIconOf(null, 'budget.xlsx')).toBe('fileSheet');
    expect(fileIconOf(null, 'deck.pptx')).toBe('fileSlides');
    expect(fileIconOf(null, 'export.csv')).toBe('fileCsv');
    expect(fileIconOf(null, 'backup.tar.gz')).toBe('fileArchive');
    expect(fileIconOf(null, 'server.ts')).toBe('fileCode');
  });

  it('prefers the extension over the shared Office MIME type', () => {
    const office = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    expect(fileIconOf(office, 'q3.xlsx')).toBe('fileSheet');
    expect(fileIconOf(office, 'notes.docx')).toBe('fileDoc');
  });

  it('falls back to the MIME type when the name carries no extension', () => {
    expect(fileIconOf('application/zip', 'archive')).toBe('fileArchive');
    expect(fileIconOf('text/csv; charset=utf-8', 'export')).toBe('fileCsv');
  });

  it('does not read a bare name as its own extension', () => {
    expect(fileIconOf(null, 'zip')).toBe('file');
  });

  it('marks media by family, including types with no entry of their own', () => {
    expect(fileIconOf('image/heic', 'holiday.heic')).toBe('fileImage');
    expect(fileIconOf('video/quicktime', 'clip.mov')).toBe('fileVideo');
    expect(fileIconOf('audio/mpeg', 'song.mp3')).toBe('fileAudio');
  });

  it('falls back to the plain sheet rather than guessing', () => {
    expect(fileIconOf(null, 'notes.unknownext')).toBe('file');
    expect(fileIconOf('application/octet-stream', 'blob.bin')).toBe('file');
    expect(fileIconOf(null, '')).toBe('file');
  });
});
