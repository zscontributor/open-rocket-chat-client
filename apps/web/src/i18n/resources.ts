import enAuth from './locales/en/auth.json';
import enCommon from './locales/en/common.json';
import enComposer from './locales/en/composer.json';
import enMedia from './locales/en/media.json';
import enMessages from './locales/en/messages.json';
import enRooms from './locales/en/rooms.json';
import enServers from './locales/en/servers.json';
import enSettings from './locales/en/settings.json';
import jaAuth from './locales/ja/auth.json';
import jaCommon from './locales/ja/common.json';
import jaComposer from './locales/ja/composer.json';
import jaMedia from './locales/ja/media.json';
import jaMessages from './locales/ja/messages.json';
import jaRooms from './locales/ja/rooms.json';
import jaServers from './locales/ja/servers.json';
import jaSettings from './locales/ja/settings.json';
import viAuth from './locales/vi/auth.json';
import viCommon from './locales/vi/common.json';
import viComposer from './locales/vi/composer.json';
import viMedia from './locales/vi/media.json';
import viMessages from './locales/vi/messages.json';
import viRooms from './locales/vi/rooms.json';
import viServers from './locales/vi/servers.json';
import viSettings from './locales/vi/settings.json';

/**
 * Namespaces mirror the feature folders, so a contributor translating the
 * composer only has to open `composer.json` and never has to guess where a
 * string lives.
 */
export const NAMESPACES = ['common', 'auth', 'rooms', 'messages', 'composer', 'media', 'settings', 'servers'] as const;
export type Namespace = (typeof NAMESPACES)[number];

/**
 * Adding a language:
 *   1. copy `locales/en` to `locales/<code>` and translate the values,
 *   2. import the files and add the bundle below,
 *   3. add an entry to `LOCALES` with the name written in that language.
 * `src/i18n/__tests__/locales.test.ts` then checks it against English.
 */
export const LOCALES = [
  { code: 'en', name: 'English', englishName: 'English' },
  { code: 'ja', name: '日本語', englishName: 'Japanese' },
  { code: 'vi', name: 'Tiếng Việt', englishName: 'Vietnamese' },
] as const;

export type LocaleCode = (typeof LOCALES)[number]['code'];

export const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    rooms: enRooms,
    messages: enMessages,
    composer: enComposer,
    media: enMedia,
    settings: enSettings,
    servers: enServers,
  },
  ja: {
    common: jaCommon,
    auth: jaAuth,
    rooms: jaRooms,
    messages: jaMessages,
    composer: jaComposer,
    media: jaMedia,
    settings: jaSettings,
    servers: jaServers,
  },
  vi: {
    common: viCommon,
    auth: viAuth,
    rooms: viRooms,
    messages: viMessages,
    composer: viComposer,
    media: viMedia,
    settings: viSettings,
    servers: viServers,
  },
} as const;
