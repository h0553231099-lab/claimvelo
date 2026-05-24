import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Supported URL language codes — these become URL prefixes (e.g. /es/, /de/)
// English is the default at / (no prefix)
export const SUPPORTED_LOCALES = [
  'en', 'es', 'de', 'fr', 'pt', 'it', 'nl', 'pl', 'ro', 'ru',
  'cs', 'da', 'sv', 'no', 'fi', 'el', 'hr', 'hu', 'bg', 'tr',
  'uk', 'ar', 'zh', 'sq', 'pt-br',
] as const;

export type Locale = typeof SUPPORTED_LOCALES[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  pt: 'Português',
  it: 'Italiano',
  nl: 'Nederlands',
  pl: 'Polski',
  ro: 'Română',
  ru: 'Русский',
  cs: 'Čeština',
  da: 'Dansk',
  sv: 'Svenska',
  no: 'Norsk',
  fi: 'Suomi',
  el: 'Ελληνικά',
  hr: 'Hrvatski',
  hu: 'Magyar',
  bg: 'Български',
  tr: 'Türkçe',
  uk: 'Українська',
  ar: 'العربية',
  zh: '汉语',
  sq: 'Shqip',
  'pt-br': 'Português (Brasil)',
};

// Base English namespace
const en = {
  // Page titles
  'meta.home.title': 'ClaimVelo — Claim Up to €600 for Delayed or Cancelled Flights. No Win, No Fee.',
  'meta.home.desc': 'Were you delayed, cancelled, or denied boarding? You could be owed up to €600 per passenger under EU261, UK261, or Israeli law. Free eligibility check — no win, no fee.',
  'meta.claim.title': 'Start Your Flight Compensation Claim — ClaimVelo | Free Check',
  'meta.claim.desc': 'Start your free flight compensation claim in under 2 minutes. Delayed, cancelled, or denied boarding? No win, no fee.',
  'meta.howitworks.title': 'How Flight Compensation Works — ClaimVelo | 3 Simple Steps',
  'meta.howitworks.desc': 'See exactly how ClaimVelo wins compensation for delayed and cancelled flights. Three simple steps: submit your claim, we fight the airline, you receive payment.',
  'meta.fees.title': 'Our Fees — ClaimVelo | 30% Standard, 50% Only If Legal Action Needed',
  'meta.fees.desc': 'ClaimVelo charges 30% on standard claims and 50% only if a lawyer is required — and only when we win.',
  'meta.about.title': 'About ClaimVelo — Passenger Rights Specialists | EU261 & UK261 Experts',
  'meta.about.desc': 'ClaimVelo is a team of aviation law specialists fighting for passenger rights across the EU, UK, Israel, and US.',
  'meta.signin.title': 'Sign In — ClaimVelo | Track Your Flight Compensation Claim',
  'meta.signin.desc': 'Sign in to your ClaimVelo account to track your compensation claim, upload documents, and receive payment updates.',
  'meta.privacy.title': 'Privacy Policy — ClaimVelo',
  'meta.privacy.desc': 'Read the ClaimVelo privacy policy. We are committed to protecting your personal data in compliance with GDPR.',
  // Nav
  'nav.home': 'Home',
  'nav.about': 'About Us',
  'nav.how': 'How It Works',
  'nav.fees': 'Our Fees',
  'nav.claim': 'New Claim',
  'nav.myclaims': 'My Claims',
  'nav.signin': 'Sign In',
};

const es: typeof en = {
  'meta.home.title': 'ClaimVelo — Reclama hasta €600 por vuelos retrasados o cancelados. Sin cobro si no ganamos.',
  'meta.home.desc': '¿Tu vuelo fue retrasado, cancelado o te denegaron el embarque? Podrías reclamar hasta €600 por pasajero bajo EU261 o UK261. Verificación gratuita.',
  'meta.claim.title': 'Inicia tu reclamación de compensación de vuelo — ClaimVelo | Verificación gratuita',
  'meta.claim.desc': 'Inicia tu reclamación en menos de 2 minutos. Sin cobro si no ganamos.',
  'meta.howitworks.title': 'Cómo funciona la compensación de vuelos — ClaimVelo | 3 pasos',
  'meta.howitworks.desc': 'Descubre exactamente cómo ClaimVelo gana compensación por vuelos retrasados y cancelados.',
  'meta.fees.title': 'Nuestras tarifas — ClaimVelo | 30% estándar',
  'meta.fees.desc': 'ClaimVelo cobra el 30% en reclamaciones estándar, solo si ganamos.',
  'meta.about.title': 'Sobre ClaimVelo — Especialistas en derechos del pasajero',
  'meta.about.desc': 'ClaimVelo es un equipo de especialistas en derecho de aviación.',
  'meta.signin.title': 'Iniciar sesión — ClaimVelo',
  'meta.signin.desc': 'Inicia sesión en tu cuenta ClaimVelo para seguir tu reclamación.',
  'meta.privacy.title': 'Política de privacidad — ClaimVelo',
  'meta.privacy.desc': 'Lee la política de privacidad de ClaimVelo.',
  'nav.home': 'Inicio',
  'nav.about': 'Sobre nosotros',
  'nav.how': 'Cómo funciona',
  'nav.fees': 'Nuestras tarifas',
  'nav.claim': 'Nueva reclamación',
  'nav.myclaims': 'Mis reclamaciones',
  'nav.signin': 'Iniciar sesión',
};

const de: typeof en = {
  'meta.home.title': 'ClaimVelo — Bis zu €600 für verspätete oder annullierte Flüge. Kein Erfolg, keine Gebühr.',
  'meta.home.desc': 'War Ihr Flug verspätet, annulliert oder wurden Sie abgewiesen? Sie könnten bis zu €600 pro Passagier nach EU261 oder UK261 erhalten.',
  'meta.claim.title': 'Flugentschädigung beantragen — ClaimVelo | Kostenlose Prüfung',
  'meta.claim.desc': 'Starten Sie Ihren Antrag in unter 2 Minuten. Kein Erfolg, keine Gebühr.',
  'meta.howitworks.title': 'Wie Flugentschädigung funktioniert — ClaimVelo | 3 Schritte',
  'meta.howitworks.desc': 'Erfahren Sie genau, wie ClaimVelo Entschädigungen für verspätete und annullierte Flüge gewinnt.',
  'meta.fees.title': 'Unsere Gebühren — ClaimVelo | 30% Standard',
  'meta.fees.desc': 'ClaimVelo berechnet 30% bei Standardansprüchen, nur bei Erfolg.',
  'meta.about.title': 'Über ClaimVelo — Passagierrechte Spezialisten',
  'meta.about.desc': 'ClaimVelo ist ein Team von Luftfahrtrechtsspezialisten.',
  'meta.signin.title': 'Anmelden — ClaimVelo',
  'meta.signin.desc': 'Melden Sie sich bei Ihrem ClaimVelo-Konto an.',
  'meta.privacy.title': 'Datenschutzrichtlinie — ClaimVelo',
  'meta.privacy.desc': 'Lesen Sie die ClaimVelo-Datenschutzrichtlinie.',
  'nav.home': 'Startseite',
  'nav.about': 'Über uns',
  'nav.how': 'So funktioniert es',
  'nav.fees': 'Unsere Gebühren',
  'nav.claim': 'Neuer Antrag',
  'nav.myclaims': 'Meine Anträge',
  'nav.signin': 'Anmelden',
};

const fr: typeof en = {
  'meta.home.title': 'ClaimVelo — Réclamez jusqu\'à €600 pour vols retardés ou annulés. Sans frais si non gagné.',
  'meta.home.desc': 'Votre vol a été retardé, annulé ou on vous a refusé l\'embarquement ? Vous pourriez recevoir jusqu\'à €600 par passager.',
  'meta.claim.title': 'Démarrez votre réclamation — ClaimVelo | Vérification gratuite',
  'meta.claim.desc': 'Démarrez votre réclamation en moins de 2 minutes. Sans frais si non gagné.',
  'meta.howitworks.title': 'Comment fonctionne l\'indemnisation — ClaimVelo | 3 étapes',
  'meta.howitworks.desc': 'Découvrez exactement comment ClaimVelo obtient des indemnités pour vols retardés et annulés.',
  'meta.fees.title': 'Nos frais — ClaimVelo | 30% standard',
  'meta.fees.desc': 'ClaimVelo prend 30% sur les réclamations standard, uniquement en cas de succès.',
  'meta.about.title': 'À propos de ClaimVelo — Spécialistes des droits des passagers',
  'meta.about.desc': 'ClaimVelo est une équipe de spécialistes en droit de l\'aviation.',
  'meta.signin.title': 'Connexion — ClaimVelo',
  'meta.signin.desc': 'Connectez-vous à votre compte ClaimVelo.',
  'meta.privacy.title': 'Politique de confidentialité — ClaimVelo',
  'meta.privacy.desc': 'Lisez la politique de confidentialité de ClaimVelo.',
  'nav.home': 'Accueil',
  'nav.about': 'À propos',
  'nav.how': 'Comment ça marche',
  'nav.fees': 'Nos frais',
  'nav.claim': 'Nouvelle réclamation',
  'nav.myclaims': 'Mes réclamations',
  'nav.signin': 'Connexion',
};

const pt: typeof en = {
  'meta.home.title': 'ClaimVelo — Reclame até €600 por voos atrasados ou cancelados. Sem cobranças se não ganharmos.',
  'meta.home.desc': 'O seu voo foi atrasado, cancelado ou foi-lhe negado o embarque? Pode receber até €600 por passageiro.',
  'meta.claim.title': 'Inicie a sua reclamação — ClaimVelo | Verificação gratuita',
  'meta.claim.desc': 'Inicie a sua reclamação em menos de 2 minutos. Sem cobranças se não ganharmos.',
  'meta.howitworks.title': 'Como funciona a compensação de voos — ClaimVelo | 3 passos',
  'meta.howitworks.desc': 'Descubra exatamente como o ClaimVelo obtém compensação por voos atrasados e cancelados.',
  'meta.fees.title': 'As nossas taxas — ClaimVelo | 30% standard',
  'meta.fees.desc': 'O ClaimVelo cobra 30% em reclamações padrão, apenas em caso de sucesso.',
  'meta.about.title': 'Sobre o ClaimVelo — Especialistas em direitos dos passageiros',
  'meta.about.desc': 'O ClaimVelo é uma equipa de especialistas em direito da aviação.',
  'meta.signin.title': 'Entrar — ClaimVelo',
  'meta.signin.desc': 'Entre na sua conta ClaimVelo.',
  'meta.privacy.title': 'Política de privacidade — ClaimVelo',
  'meta.privacy.desc': 'Leia a política de privacidade do ClaimVelo.',
  'nav.home': 'Início',
  'nav.about': 'Sobre nós',
  'nav.how': 'Como funciona',
  'nav.fees': 'As nossas taxas',
  'nav.claim': 'Nova reclamação',
  'nav.myclaims': 'As minhas reclamações',
  'nav.signin': 'Entrar',
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      de: { translation: de },
      fr: { translation: fr },
      pt: { translation: pt },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LOCALES as unknown as string[],
    interpolation: { escapeValue: false },
    detection: {
      order: ['path', 'localStorage', 'navigator'],
      lookupFromPathIndex: 0,
      caches: ['localStorage'],
    },
    // Don't auto-detect from path — we manage that ourselves
    load: 'languageOnly',
  });

export default i18n;
