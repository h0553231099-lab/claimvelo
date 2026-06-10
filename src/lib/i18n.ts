import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

export const SUPPORTED_LOCALES = ['en'] as const;

export type Locale = typeof SUPPORTED_LOCALES[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
};

const en = {
  'meta.home.title': 'ClaimVelo — Claim Up to €600 for Delayed or Cancelled Flights. No Win, No Fee.',
  'meta.home.desc': 'Were you delayed, cancelled, or denied boarding? You could be owed up to €600 per passenger under EU261, UK261, or Israeli law. Free eligibility check — no win, no fee.',
  'meta.claim.title': 'Start Your Flight Compensation Claim — ClaimVelo | Free Check',
  'meta.claim.desc': 'Start your free flight compensation claim in under 2 minutes. Delayed, cancelled, or denied boarding? No win, no fee.',
  'meta.howitworks.title': 'How Flight Compensation Works — ClaimVelo | 3 Simple Steps',
  'meta.howitworks.desc': 'See exactly how ClaimVelo wins compensation for delayed and cancelled flights. Three simple steps: submit your claim, we fight the airline, you receive payment.',
  'meta.fees.title': 'Our Fees — ClaimVelo | 30% Standard, 50% Only If Legal Action Needed',
  'meta.fees.desc': 'ClaimVelo charges 30% on standard claims and 50% only if a lawyer is required — and only when we win.',
  'meta.about.title': 'About ClaimVelo — Passenger Rights Specialists | EU261 & UK261 Experts',
  'meta.about.desc': 'ClaimVelo is a team of aviation law specialists fighting for passenger rights across the EU, UK, and Israel.',
  'meta.signin.title': 'Sign In — ClaimVelo | Track Your Flight Compensation Claim',
  'meta.signin.desc': 'Sign in to your ClaimVelo account to track your compensation claim, upload documents, and receive payment updates.',
  'meta.privacy.title': 'Privacy Policy — ClaimVelo',
  'meta.privacy.desc': 'Read the ClaimVelo privacy policy. We are committed to protecting your personal data in compliance with GDPR.',
  'nav.home': 'Home',
  'nav.about': 'About Us',
  'nav.how': 'How It Works',
  'nav.fees': 'Our Fees',
  'nav.claim': 'New Claim',
  'nav.myclaims': 'My Claims',
  'nav.signin': 'Sign In',
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LOCALES as unknown as string[],
    interpolation: { escapeValue: false },
    detection: {
      order: ['path', 'localStorage', 'navigator'],
      lookupFromPathIndex: 0,
      caches: ['localStorage'],
    },
    load: 'languageOnly',
  });

export default i18n;
