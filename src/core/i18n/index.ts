import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';

export const SUPPORTED_LOCALES = ['en', 'fr', 'ar'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  ar: 'العربية',
};

const RTL_LOCALES: Locale[] = ['ar'];
const STORAGE_KEY = 'app_language';

/** Applies lang + dir to <html> so the whole app (incl. Tailwind logical
 *  utilities) flips for RTL locales. */
export function applyLocale(locale: Locale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}

function initialLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (saved && SUPPORTED_LOCALES.includes(saved)) return saved;
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase() as Locale;
  return SUPPORTED_LOCALES.includes(nav) ? nav : 'en';
}

const locale = initialLocale();

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    ar: { translation: ar },
  },
  lng: locale,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

applyLocale(locale);

export function setLocale(locale: Locale) {
  i18n.changeLanguage(locale);
  localStorage.setItem(STORAGE_KEY, locale);
  applyLocale(locale);
}

export default i18n;
