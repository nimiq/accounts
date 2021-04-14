import Vue from 'vue';
import VueI18n from 'vue-i18n';
import { I18nMixin as VueComponentsI18n } from '@nimiq/vue-components';
import { Cookie } from '@nimiq/utils';

Vue.use(VueI18n);

const DEFAULT_LANGUAGE = 'en';
const SUPPORTED_LANGUAGES = [DEFAULT_LANGUAGE, 'de', 'es', 'fr', 'nl', 'ru', 'uk', 'zh'];
const LOADED_LANGUAGES: string[] = [];

export const i18n = new VueI18n({
    locale: DEFAULT_LANGUAGE, // set locale (2 letters format: 'en')
    fallbackLocale: DEFAULT_LANGUAGE, // If loaded. For webpack-i18n-tools not needed as fallback included in lang files
    silentTranslationWarn: true, // disable the "no translation found" warning
});

// Asynchronously load a translation file for a specified language
// and set this one as the active language
export async function setLanguage(lang: string) {
    if (!SUPPORTED_LANGUAGES.includes(lang)) lang = DEFAULT_LANGUAGE;

    VueComponentsI18n.setLanguage(lang);

    // If the language was already loaded
    if (LOADED_LANGUAGES.includes(lang)) {
        i18n.locale = lang;
        return lang;
    }

    // If the language hasn't been loaded yet
    const messages = await import(/* webpackChunkName: "lang-[request]" */ `@/i18n/${lang}.po`);
    i18n.setLocaleMessage(lang, messages.default || {});
    LOADED_LANGUAGES.push(lang);
    document.documentElement.setAttribute('lang', lang);
    i18n.locale = lang;
    return lang;
}

// Return the language stored in the `lang` cookie. Fallback to the browser language
export function detectLanguage() {
    const langCookie = Cookie.getCookie('lang');
    const fallbackLang = window.navigator.language.split('-')[0];

    let lang = langCookie || fallbackLang;
    // If the language is not supported set it to the default one
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
        lang = DEFAULT_LANGUAGE;
    }
    return lang;
}

// If the user changed the language in another window/tab,
// then ask him if he wants to reload the page to update non-reactive translations
let offerReload = true;
function onTabFocus() {
    if (!LOADED_LANGUAGES.length) {
        // No language for which we'd need to update any translations has been loaded yet.
        // Also we don't have any language loaded for translating the error message itself.
        return;
    }
    const lang = detectLanguage();
    if (i18n.locale !== lang) {
        const question = i18n.t('The display language changed. Do you want to reload the page to update all '
            + 'translations? Otherwise, some translations might not be updated automatically. ({oldLang} to {newLang})',
            { oldLang: i18n.locale, newLang: lang }) as string;

        if (offerReload && confirm(question)) {
            location.reload();
        } else {
            setLanguage(detectLanguage());
        }
        offerReload = false; // only offer reload once to ignore the window focus on confirm-popup close
    }
}

// Set a window/tab focus event to check if the user changed the language in another window/tab
window.addEventListener('focus', onTabFocus);
