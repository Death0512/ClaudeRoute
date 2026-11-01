export const LOCALES = ["en"];
export const DEFAULT_LOCALE = "en";
export const LOCALE_COOKIE = "locale";

export const LOCALE_NAMES = {
  en: "English",
};

export function normalizeLocale(_locale) {
  return DEFAULT_LOCALE;
}

export function isRTL(_locale) {
  return false;
}
