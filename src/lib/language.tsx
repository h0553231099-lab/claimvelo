import { createContext, useContext, useState, ReactNode } from 'react';

export interface Language {
  code: string;
  label: string;
  country: string;
  suggested?: boolean;
}

export const LANGUAGES: Language[] = [
  { code: 'en', label: 'English (UK)', country: 'gb', suggested: true },
];

export function flagUrl(country: string, size: 'w20' | 'w40' | 'w80' = 'w20') {
  return `https://flagcdn.com/${size}/${country}.png`;
}

// ─── Translations ────────────────────────────────────────────────────────────

export type TranslationKey =
  | 'hero.title1' | 'hero.title2' | 'hero.subtitle'
  | 'hero.cta' | 'hero.how'
  | 'hero.badge'
  | 'hero.stat.max' | 'hero.stat.lookback' | 'hero.stat.success' | 'hero.stat.payout'
  | 'hero.stat.max_label' | 'hero.stat.lookback_label' | 'hero.stat.success_label' | 'hero.stat.payout_label'
  | 'hero.stat.airlines' | 'hero.stat.airlines_label'
  | 'hero.stat.fee' | 'hero.stat.fee_label'
  | 'hero.stat.upfront' | 'hero.stat.upfront_label'
  | 'hero.stat.window' | 'hero.stat.window_label'
  | 'hero.stat.regs' | 'hero.stat.regs_label'
  | 'nav.home' | 'nav.about' | 'nav.how' | 'nav.fees' | 'nav.claim' | 'nav.myclaims' | 'nav.signin'
  | 'checker.badge' | 'checker.title' | 'checker.sub'
  | 'checker.from' | 'checker.to' | 'checker.flight' | 'checker.date' | 'checker.airline' | 'checker.what' | 'checker.reason'
  | 'checker.btn' | 'checker.analyzing' | 'checker.reason_placeholder'
  | 'checker.select' | 'checker.select_airline' | 'checker.select_issue'
  | 'steps.badge' | 'steps.title'
  | 'steps.1.title' | 'steps.1.desc'
  | 'steps.2.title' | 'steps.2.desc'
  | 'steps.3.title' | 'steps.3.desc'
  | 'faq.title' | 'faq.badge'
  | 'faq.q1' | 'faq.a1' | 'faq.q2' | 'faq.a2' | 'faq.q3' | 'faq.a3'
  | 'faq.q4' | 'faq.a4' | 'faq.q5' | 'faq.a5' | 'faq.q6' | 'faq.a6'
  | 'faq.q7' | 'faq.a7' | 'faq.q8' | 'faq.a8'
  | 'cta.title' | 'cta.sub' | 'cta.btn'
  | 'trust.ssl' | 'trust.fee' | 'trust.ai' | 'trust.flights' | 'trust.reviews'
  | 'available_in'
  | 'result.nextsteps' | 'result.claim_btn' | 'result.estimated'
  | 'home.process.badge' | 'home.process.title' | 'home.process.sub'
  | 'home.process.btn'
  | 'home.process.s1.title' | 'home.process.s1.desc'
  | 'home.process.s2.title' | 'home.process.s2.desc'
  | 'home.process.s3.title' | 'home.process.s3.desc'
  | 'home.fee.badge' | 'home.fee.title' | 'home.fee.sub'
  | 'home.fee.example_label'
  | 'home.fee.row1' | 'home.fee.row2' | 'home.fee.row3'
  | 'home.fee.note'
  | 'home.fee.p1.label' | 'home.fee.p1.desc'
  | 'home.fee.p2.label' | 'home.fee.p2.desc'
  | 'home.fee.p3.label' | 'home.fee.p3.desc'
  | 'home.fee.p4.label' | 'home.fee.p4.desc'
  | 'home.fee.btn'
  | 'home.why.badge' | 'home.why.title'
  | 'home.why.w1.title' | 'home.why.w1.desc'
  | 'home.why.w2.title' | 'home.why.w2.desc'
  | 'home.why.w3.title' | 'home.why.w3.desc'
  | 'home.compare.badge' | 'home.compare.title'
  | 'home.compare.feature' | 'home.compare.diy' | 'home.compare.others'
  | 'home.time.badge' | 'home.time.title' | 'home.time.sub'
  | 'home.services.badge' | 'home.services.title' | 'home.services.btn'
  | 'home.reviews.badge' | 'home.reviews.title' | 'home.reviews.won'
  | 'home.footer.tagline' | 'home.footer.about' | 'home.footer.privacy'
  | 'home.footer.how' | 'home.footer.fees' | 'home.footer.copy'
  | 'home.disruption.badge' | 'home.disruption.title' | 'home.disruption.sub'
  | 'home.disruption.hide' | 'home.disruption.more'
  | 'signin.title.new' | 'signin.title.returning'
  | 'signin.name' | 'signin.email' | 'signin.password'
  | 'signin.btn.create' | 'signin.btn.signin'
  | 'signin.toggle.new' | 'signin.toggle.existing'
  | 'signin.back' | 'signin.tagline'
  | 'dashboard.title' | 'dashboard.welcome' | 'dashboard.new_claim'
  | 'dashboard.no_claims' | 'dashboard.no_claims_sub' | 'dashboard.start'
  | 'dashboard.signin_prompt' | 'dashboard.signin_sub'
  | 'dashboard.back'
  | 'dashboard.filed' | 'dashboard.issue' | 'dashboard.loa'
  | 'dashboard.loa_signed' | 'dashboard.loa_unsigned'
  | 'dashboard.progress';

type Translations = Record<TranslationKey, string>;

const base: Translations = {
  'hero.title1': 'Delayed or Canceled Flight?',
  'hero.title2': 'Get Up to $650!',
  'hero.subtitle': 'We fight the airlines so you don\'t have to. Submit in minutes — our experts handle everything.',
  'hero.cta': 'Start Now — It\'s Free',
  'hero.how': 'Our Process',
  'hero.stat.max': '$650', 'hero.stat.max_label': 'Max per passenger',
  'hero.stat.lookback': '3 yrs', 'hero.stat.lookback_label': 'Look-back period',
  'hero.stat.success': '99%', 'hero.stat.success_label': 'Success rate',
  'hero.stat.payout': '21d', 'hero.stat.payout_label': 'Avg. payout time',
  'nav.home': 'Home', 'nav.about': 'About Us', 'nav.how': 'How It Works',
  'nav.fees': 'Our Fees', 'nav.claim': 'New Claim', 'nav.myclaims': 'My Claims', 'nav.signin': 'Sign In',
  'checker.badge': 'Free AI check — 60 seconds',
  'checker.title': 'Was your flight eligible?',
  'checker.sub': 'Claude AI instantly checks EC 261/2004 eligibility.',
  'checker.from': 'From', 'checker.to': 'To',
  'checker.flight': 'Flight Number', 'checker.date': 'Flight Date',
  'checker.airline': 'Airline', 'checker.what': 'What happened?',
  'checker.reason': 'Reason given by airline (optional)',
  'checker.reason_placeholder': 'e.g. technical fault, weather, crew shortage...',
  'checker.btn': 'Check My Flight — Free',
  'checker.analyzing': 'Claude AI is analyzing...',
  'checker.select': 'Select...', 'checker.select_airline': 'Select...', 'checker.select_issue': 'Select...',
  'steps.badge': 'Our Process', 'steps.title': 'Get Your Compensation in 3 Steps',
  'steps.1.title': 'Submit Your Flight Details', 'steps.1.desc': 'Fill out our simple form in under two minutes. All we need is your flight number and date.',
  'steps.2.title': 'We Build Your Case', 'steps.2.desc': 'Our experts verify your eligibility and compile all necessary documentation to build a strong claim.',
  'steps.3.title': 'You Get Paid', 'steps.3.desc': 'We handle all negotiations. Once the airline pays, we transfer your compensation directly to you, minus our 30% fee.',
  'faq.title': 'Frequently Asked Questions', 'faq.badge': 'FAQ',
  'cta.title': "Ready to Claim What's Yours?",
  'cta.sub': 'Free check, no commitment. Thousands of passengers already paid.',
  'cta.btn': 'Start Now — It\'s Free',
  'trust.ssl': 'SSL & GDPR Compliant', 'trust.fee': 'No Win, No Fee — 30%',
  'trust.ai': 'AI Powered', 'trust.flights': 'All major airlines', 'trust.reviews': '4.9/5 · 5,200+ reviews',
  'available_in': 'Available in',
  'result.nextsteps': 'Next steps:', 'result.claim_btn': 'Start my claim — no upfront cost →',
  'result.estimated': 'Estimated:',
  'hero.badge': 'No Win, No Fee · Free Eligibility Check',
  'hero.stat.airlines': '250+', 'hero.stat.airlines_label': 'Airlines covered',
  'hero.stat.fee': '30%', 'hero.stat.fee_label': 'Success fee only',
  'hero.stat.upfront': '£0', 'hero.stat.upfront_label': 'No upfront cost',
  'hero.stat.window': '6 yrs', 'hero.stat.window_label': 'Claim window',
  'hero.stat.regs': 'EC261', 'hero.stat.regs_label': 'Regulation covered',
  'faq.q1': 'How much can I claim?', 'faq.a1': 'Up to €600 per passenger under EU Regulation 261/2004 for flights delayed over 3 hours, cancelled, or denied boarding.',
  'faq.q2': 'Which flights are covered?', 'faq.a2': 'All flights departing from an EU/UK airport, or arriving in the EU/UK on an EU/UK airline, within the last 6 years.',
  'faq.q3': 'How long does it take?', 'faq.a3': 'Most claims resolve within 4–8 weeks. Complex cases or court escalations may take up to 6 months.',
  'faq.q4': 'What if the airline refuses?', 'faq.a4': 'We escalate to alternative dispute resolution or court if needed. Our legal team handles everything at no extra cost.',
  'faq.q5': 'What documents do I need?', 'faq.a5': 'Just your booking confirmation and boarding pass if you have them. We can often proceed without them.',
  'faq.q6': 'Is there a time limit?', 'faq.a6': 'Yes — UK claims must be filed within 6 years, EU claims within 3 years of the flight date. Act now.',
  'faq.q7': 'What is your success fee?', 'faq.a7': 'We charge 30% (+VAT) of the compensation received. If we don\'t win, you pay nothing. No hidden fees.',
  'faq.q8': 'Can I claim for a group?', 'faq.a8': 'Yes! Every passenger on the same disrupted flight is entitled to claim. Submit one form and list all passengers.',
  'home.process.badge': 'Our Process', 'home.process.title': 'How to Get Compensation',
  'home.process.sub': 'Three simple steps — we handle all the hard work.',
  'home.process.btn': 'Start My Claim Now',
  'home.process.s1.title': 'Submit Your Details', 'home.process.s1.desc': 'Fill in our simple form in under 2 minutes. Flight number, date, and what happened.',
  'home.process.s2.title': 'We Build Your Case', 'home.process.s2.desc': 'Our team verifies eligibility and prepares all documentation for a strong claim.',
  'home.process.s3.title': 'You Get Paid', 'home.process.s3.desc': 'We handle all negotiations. Once the airline pays, we transfer your compensation minus our 30% fee.',
  'home.fee.badge': 'Transparent Pricing', 'home.fee.title': 'No Win, No Fee',
  'home.fee.sub': 'We only get paid when you do. No upfront costs, no hidden charges.',
  'home.fee.example_label': 'Example payout breakdown',
  'home.fee.row1': 'Airline pays you', 'home.fee.row2': 'ClaimVelo fee (30%)', 'home.fee.row3': 'You receive',
  'home.fee.note': 'VAT applies to the fee only. You always know exactly what you\'ll receive.',
  'home.fee.p1.label': 'No Win, No Fee', 'home.fee.p1.desc': 'You only pay if we win your compensation.',
  'home.fee.p2.label': 'No Hidden Costs', 'home.fee.p2.desc': 'The 30% fee is the only charge. Ever.',
  'home.fee.p3.label': 'Fast Transfers', 'home.fee.p3.desc': 'Funds sent to you within days of airline payment.',
  'home.fee.p4.label': 'Court Included', 'home.fee.p4.desc': 'Legal escalation at no extra cost if needed.',
  'home.fee.btn': 'Check My Eligibility — Free',
  'home.why.badge': 'Why ClaimVelo', 'home.why.title': 'We Do Everything For You',
  'home.why.w1.title': 'Expert Legal Team', 'home.why.w1.desc': 'Specialist aviation lawyers with a 99% success rate against major airlines.',
  'home.why.w2.title': 'AI-Powered Claims', 'home.why.w2.desc': 'Our AI instantly assesses eligibility and auto-fills forms to save you time.',
  'home.why.w3.title': 'Truly No Win No Fee', 'home.why.w3.desc': 'You pay nothing if unsuccessful. Our 30% fee only applies when you get paid.',
  'home.compare.badge': 'How We Compare', 'home.compare.title': 'ClaimVelo vs. The Alternatives',
  'home.compare.feature': 'Feature', 'home.compare.diy': 'DIY', 'home.compare.others': 'Others',
  'home.time.badge': 'Act Fast', 'home.time.title': 'Don\'t Miss Your Claim Window',
  'home.time.sub': 'UK claims expire 6 years after the flight. EU claims expire in 3 years. Check yours now.',
  'home.services.badge': 'All Disruptions Covered', 'home.services.title': 'We Handle Every Type of Disruption',
  'home.services.btn': 'Check My Disruption',
  'home.reviews.badge': 'Verified Reviews', 'home.reviews.title': 'Thousands of Passengers Paid',
  'home.reviews.won': 'won',
  'home.footer.tagline': 'Flight compensation specialists. No win, no fee.',
  'home.footer.about': 'About Us', 'home.footer.privacy': 'Privacy Policy',
  'home.footer.how': 'How It Works', 'home.footer.fees': 'Our Fees',
  'home.footer.copy': '© 2024 ClaimVelo Ltd. All rights reserved.',
  'home.disruption.badge': 'Flight Disruptions', 'home.disruption.title': 'Current Disruptions',
  'home.disruption.sub': 'Live data on airline disruptions that may affect your claim.',
  'home.disruption.hide': 'Hide', 'home.disruption.more': 'Show more',
  'signin.title.new': 'Create an account', 'signin.title.returning': 'Welcome back',
  'signin.name': 'Full name', 'signin.email': 'Email address', 'signin.password': 'Password',
  'signin.btn.create': 'Create Account', 'signin.btn.signin': 'Sign In',
  'signin.toggle.new': 'Don\'t have an account? Create one', 'signin.toggle.existing': 'Already have an account? Sign in',
  'signin.back': 'Back', 'signin.tagline': 'Secure sign-in · SSL encrypted',
  'dashboard.title': 'My Claims', 'dashboard.welcome': 'Welcome back',
  'dashboard.new_claim': 'New Claim',
  'dashboard.no_claims': 'No claims yet', 'dashboard.no_claims_sub': 'Start a claim and we\'ll handle everything from here.',
  'dashboard.start': 'Start My First Claim →',
  'dashboard.signin_prompt': 'Sign in to see your claims', 'dashboard.signin_sub': 'Your claim history and status updates are linked to your account.',
  'dashboard.back': '← Back to claims',
  'dashboard.filed': 'Filed', 'dashboard.issue': 'Issue', 'dashboard.loa': 'LOA',
  'dashboard.loa_signed': '✓ Signed', 'dashboard.loa_unsigned': 'Not signed',
  'dashboard.progress': 'Claim Progress',
};

export function getTranslations(_code: string): Translations {
  return base;
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface LangCtx {
  lang: Language;
  setLang: (l: Language) => void;
  t: (key: TranslationKey) => string;
}

const Ctx = createContext<LangCtx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(LANGUAGES[0]);

  function setLang(l: Language) {
    setLangState(l);
    localStorage.setItem('site_language', l.code);
  }

  function t(key: TranslationKey): string {
    return base[key] ?? key;
  }

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useLang() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLang must be used within LanguageProvider');
  return ctx;
}
