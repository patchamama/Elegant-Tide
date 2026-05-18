import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Lazy-load locale bundles
const loadLocale = (lang: string) => () => import(`./locales/${lang}/translation.json`)

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'es', 'de', 'fr', 'it', 'pt'],
    ns: ['translation'],
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    resources: {},
    partialBundledLanguages: true,
  })

// Register lazy backends
const langs = ['en', 'es', 'de', 'fr', 'it', 'pt'] as const
langs.forEach((lang) => {
  i18n.addResourceBundle && void loadLocale(lang)().then((mod) => {
    i18n.addResourceBundle(lang, 'translation', mod.default, true, true)
  })
})

export default i18n
