import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

export const SUPPORTED_LOCALES = ['en'] as const;

export type Locale = typeof SUPPORTED_LOCALES[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
};

const en = {
  // ── Meta titles & descriptions ──────────────────────────────────────────
  'meta.home.title': 'Flight Compensation Claim — Up to €600 Per Passenger | ClaimVelo',
  'meta.home.desc': 'Delayed, cancelled, or denied boarding? Claim up to €600 per passenger under EU261, UK261 or Israeli law. Free 2-minute eligibility check — no win, no fee, ever.',
  'meta.claim.title': 'Start Your Free Flight Compensation Claim | ClaimVelo — EU261 & UK261',
  'meta.claim.desc': 'Submit your claim in under 2 minutes. Delayed or cancelled flight? ClaimVelo claims up to €600 per passenger under EU261, UK261 and Israeli law. No win, no fee.',
  'meta.howitworks.title': 'How Flight Compensation Works — 3 Steps to €600 | ClaimVelo',
  'meta.howitworks.desc': 'See how ClaimVelo recovers up to €600 per passenger for delayed and cancelled flights. Free eligibility check, no paperwork, no upfront cost. We handle everything.',
  'meta.fees.title': 'Our Fees — 30% Only When We Win | ClaimVelo Flight Compensation',
  'meta.fees.desc': 'ClaimVelo is strictly no win, no fee. We charge 30% on successful standard claims — 50% only if a lawyer is needed. If we lose, you owe us absolutely nothing.',
  'meta.about.title': 'About ClaimVelo — EU261 & UK261 Passenger Rights Specialists',
  'meta.about.desc': 'ClaimVelo is a specialist aviation law team that has recovered millions in flight compensation for passengers across the EU, UK, Israel and beyond. No win, no fee.',
  'meta.signin.title': 'Sign In — Track Your Flight Compensation Claim | ClaimVelo',
  'meta.signin.desc': 'Sign in to your ClaimVelo account to track your compensation claim, upload documents, and receive payment updates.',
  'meta.privacy.title': 'Privacy Policy — ClaimVelo | GDPR Compliant Data Protection',
  'meta.privacy.desc': 'Read the ClaimVelo privacy policy. We are committed to protecting your personal data in full compliance with GDPR and applicable data protection law.',
  'meta.terms.title': 'Terms of Service — ClaimVelo | No Win, No Fee Flight Compensation',
  'meta.terms.desc': 'Read the ClaimVelo Terms of Service. No win, no fee — 30% success fee on standard claims, 50% if legal action is required. You pay nothing unless we win.',
  'meta.ireland.title': 'Flight Compensation Ireland — Ryanair & Aer Lingus Claims | ClaimVelo',
  'meta.ireland.desc': 'Delayed or cancelled flight from Dublin, Cork, Shannon or Knock? Claim up to €600 under EU261. All airlines covered — Ryanair, Aer Lingus and more. No win, no fee.',
  'meta.united-kingdom.title': 'UK Flight Compensation — Claim Up to £520 Under UK261 | ClaimVelo',
  'meta.united-kingdom.desc': 'Delayed or cancelled flight from Heathrow, Gatwick, Manchester or any UK airport? Claim up to £520 under UK261. British Airways, EasyJet, Jet2 and all UK airlines covered. No win, no fee.',
  'meta.partners.title': 'Partner with ClaimVelo — Refer Passengers & Earn Commission',
  'meta.partners.desc': 'Join the ClaimVelo partner programme. Refer passengers with delayed or cancelled flights and earn a commission on every successful claim. Free to join.',

  // ── Nav ──────────────────────────────────────────────────────────────────
  'nav.home': 'Home',
  'nav.about': 'About Us',
  'nav.how': 'How It Works',
  'nav.fees': 'Our Fees',
  'nav.claim': 'New Claim',
  'nav.myclaims': 'My Claims',
  'nav.signin': 'Sign In',

  // ── Home — process section ───────────────────────────────────────────────
  'home.process.badge': 'How It Works',
  'home.process.title': 'Your Compensation in 3 Simple Steps',
  'home.process.sub': 'From eligibility check to money in your account — here is exactly how we win for you.',
  'home.process.s1.title': 'Check Your Eligibility',
  'home.process.s1.desc': 'Enter your flight details. We instantly check if you qualify — takes under 2 minutes and costs nothing.',
  'home.process.s2.title': 'We Handle Everything',
  'home.process.s2.desc': 'Our specialists build your case, draft the legal demand, and fight every rejection the airline makes.',
  'home.process.s3.title': 'Receive Your Payment',
  'home.process.s3.desc': 'Once the airline pays, we transfer your share directly to your bank account. No delays on our end.',
  'home.process.btn': 'Start My Free Claim →',

  // ── Home — reviews ───────────────────────────────────────────────────────
  'home.reviews.won': 'won',

  // ── Home — footer ────────────────────────────────────────────────────────
  'home.footer.tagline': 'Passenger rights specialists for EU, UK, Israeli and US flights.',
  'home.footer.about': 'About Us',
  'home.footer.privacy': 'Privacy Policy',
  'home.footer.terms': 'Terms of Service',
  'home.footer.how': 'How It Works',
  'home.footer.fees': 'Our Fees',
  'home.footer.copy': '© 2026 ClaimVelo Ltd. · No win, no fee.',

  // ── FAQ ──────────────────────────────────────────────────────────────────
  'faq.badge': 'Frequently Asked Questions',
  'faq.title': 'Everything You Need to Know About Flight Compensation',

  'faq.q1': 'How much compensation can I claim for a delayed or cancelled flight?',
  'faq.a1': 'Under EU Regulation 261/2004 and UK261, you can claim €250 / £220 for short-haul flights under 1,500 km, €400 / £350 for medium-haul flights between 1,500 and 3,500 km, and €300–€600 / £260–£520 for long-haul flights over 3,500 km depending on the arrival delay. Under Israeli Aviation Services Law, compensation ranges from ₪1,530 to ₪3,670. These are fixed statutory amounts and have nothing to do with the price you paid for the ticket.',

  'faq.q2': 'Which flights qualify for EU261 compensation?',
  'faq.a2': 'EU261 applies to any flight departing from an airport within the European Union, regardless of the airline. It also applies to flights arriving in the EU that are operated by an EU-based carrier. If your flight departed from London, Manchester, or another UK airport, UK261 applies instead.',

  'faq.q3': 'How far back can I claim flight compensation?',
  'faq.a3': 'The claim window varies by country. In England and Wales you have 6 years; in Scotland, 5 years; in most EU countries, between 3 and 5 years; and in Israel, 4 years from the date of the disrupted flight. Flights from 2021 onward are very likely still within time.',

  'faq.q4': 'What does "no win, no fee" mean?',
  'faq.a4': 'It means you never pay anything upfront or out of pocket. ClaimVelo deducts its 30% success fee only from the compensation we recover on your behalf. If we lose your case for any reason, you owe us absolutely nothing — ever.',

  'faq.q5': 'How long does a flight compensation claim take?',
  'faq.a5': 'Most airlines settle within 4–12 weeks of our first formal demand. If an airline disputes the claim or ignores it, we escalate to the relevant national enforcement body or court, which can add 2–6 months. Throughout the process you receive status updates. You do not need to do anything after the initial submission.',

  'faq.q6': 'Can airlines refuse to pay by claiming "extraordinary circumstances"?',
  'faq.a6': 'Airlines frequently misuse this defence. Under EU261 and UK261, extraordinary circumstances are narrowly defined — they must be events completely outside the airline\'s control and unavoidable even if all reasonable measures had been taken. Technical faults, crew shortages, and most scheduling issues do not qualify. We challenge this defence in the majority of contested cases and succeed more often than not.',

  'faq.q7': 'Can I claim if I was denied boarding due to overbooking?',
  'faq.a7': 'Yes. If the airline denied you boarding against your will on a flight you had a confirmed booking for and checked in on time, you are entitled to the same fixed cash compensation as for delays, plus an immediate choice of a refund or rerouting to your destination on the next available flight.',

  'faq.q8': 'What documents do I need to make a claim?',
  'faq.a8': 'At minimum: your booking confirmation or e-ticket, the names of all passengers claiming, and an email address. It helps to have boarding passes and any delay notification from the airline, but they are not essential — we can often verify the disruption independently. The entire submission takes under 2 minutes.',
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
