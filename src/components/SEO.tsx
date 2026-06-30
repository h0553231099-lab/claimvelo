import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import type { Page } from '../types';
import type { Locale } from '../lib/i18n';

const BASE_URL = 'https://claimvelo.com';

const PUBLIC_PAGE_PATHS: Partial<Record<Page, string>> = {
  home: '',
  claim: '/claim',
  'how-it-works': '/how-it-works',
  fees: '/fees',
  about: '/about',
  privacy: '/privacy',
  ireland: '/ireland',
  partners: '/partners',
  'united-kingdom': '/united-kingdom',
};

const NOINDEX_PAGES = new Set<Page>([
  'signin', 'agent-signin', 'sales-signin', 'seo-signin',
  'dashboard', 'admin', 'agent-dashboard', 'sales-dashboard', 'seo-dashboard',
  'loa',
]);

const BASE_OG_IMAGE = 'https://claimvelo.com/images/og-cover.svg';
const OG_IMAGE_TYPE = 'image/svg+xml';
const DATE_MODIFIED = '2026-06-24';

interface Props {
  page: Page;
  locale: Locale;
}

function buildWebPageSchema(url: string, name: string, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url,
    isPartOf: { '@type': 'WebSite', url: BASE_URL, name: 'ClaimVelo' },
    about: { '@type': 'LegalService', name: 'ClaimVelo', url: BASE_URL },
    dateModified: DATE_MODIFIED,
    inLanguage: 'en-GB',
  };
}

function buildHomeSchemas(title: string, description: string, canonicalUrl: string) {
  const webpage = buildWebPageSchema(canonicalUrl, title, description);
  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How much compensation can I claim for a delayed or cancelled flight?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Under EU261 and UK261, compensation ranges from €250 / £220 for short-haul (under 1,500 km) up to €600 / £520 for long-haul (over 3,500 km, 4+ hour delay). For over 3,500 km flights with a 3–4 hour delay, compensation is €300 / £260. Under Israeli Aviation Services Law, compensation ranges from ₪1,530 to ₪3,670 (2026 indexed amounts).',
        },
      },
      {
        '@type': 'Question',
        name: 'Which flights qualify for EU261 compensation?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'EU261 applies to any flight departing from an EU airport on any airline, and to flights arriving in the EU operated by an EU-based carrier. UK261 covers flights departing UK airports on any airline, flights arriving in the UK on a UK or EU airline, and flights arriving in the EU on a UK airline.',
        },
      },
      {
        '@type': 'Question',
        name: 'How far back can I claim flight compensation?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: '6 years in England and Wales, 5 years in Scotland and France, 4 years in Israel, and 3 years in most EU countries from the date of the disrupted flight.',
        },
      },
      {
        '@type': 'Question',
        name: 'What does no win, no fee mean?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'You pay nothing upfront. ClaimVelo deducts its 30% success fee only from the compensation recovered. If we lose your case, you owe us nothing.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can airlines refuse to pay by claiming extraordinary circumstances?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Airlines misuse this defence regularly. Under EU261 and UK261, extraordinary circumstances are narrowly defined. Technical faults and crew shortages do not qualify. We challenge this excuse and succeed in the majority of contested cases.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I claim if I was denied boarding due to overbooking?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. If you had a confirmed booking, checked in on time, and were denied boarding against your will, you are entitled to the same fixed cash compensation as for delays, plus a refund or rerouting.',
        },
      },
      {
        '@type': 'Question',
        name: 'What documents do I need to make a claim?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'At minimum: your booking confirmation or e-ticket and the names of all passengers claiming. Boarding passes and delay notifications help but are not required. The submission takes under 2 minutes.',
        },
      },
      {
        '@type': 'Question',
        name: 'How long does a flight compensation claim take?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Most airlines settle within 4–12 weeks. If the airline disputes the claim, escalation to enforcement bodies or court can add 2–6 months. ClaimVelo handles everything — you just wait for payment.',
        },
      },
    ],
  };
  return [webpage, faqPage];
}

function buildHowItWorksSchema(title: string, description: string, canonicalUrl: string) {
  const webpage = buildWebPageSchema(canonicalUrl, title, description);
  const howTo = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'How to Claim Flight Compensation Under EU261 / UK261',
    description: 'A step-by-step guide to claiming statutory cash compensation for a delayed, cancelled or overbooked flight.',
    totalTime: 'PT2M',
    supply: [
      { '@type': 'HowToSupply', name: 'Booking confirmation or e-ticket' },
      { '@type': 'HowToSupply', name: 'Flight number and date' },
    ],
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Submit your flight details',
        text: 'Fill out the ClaimVelo form in under 2 minutes with your flight number, date, and what happened. Your eligibility is checked instantly.',
        url: `${BASE_URL}/claim`,
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'We build and file your case',
        text: 'Our aviation law specialists verify eligibility, compile flight data, draft the legal demand, and send it to the airline with full supporting documentation.',
        url: `${BASE_URL}/how-it-works`,
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'Sign the Letter of Authority',
        text: 'Draw your digital signature to authorise ClaimVelo to act on your behalf. Fully digital — no printing or scanning required.',
        url: `${BASE_URL}/how-it-works`,
      },
      {
        '@type': 'HowToStep',
        position: 4,
        name: 'We negotiate and escalate if needed',
        text: 'Most airlines settle within 4–12 weeks. If they stall or reject, we escalate to the enforcement authority or court at no extra cost to you.',
        url: `${BASE_URL}/how-it-works`,
      },
      {
        '@type': 'HowToStep',
        position: 5,
        name: 'Receive your compensation',
        text: 'Once the airline pays, ClaimVelo deducts its 30% success fee and transfers your share directly to your bank account.',
        url: `${BASE_URL}/how-it-works`,
      },
    ],
  };
  return [webpage, howTo];
}

function buildIrelandSchemas(title: string, description: string, canonicalUrl: string) {
  const webpage = {
    ...buildWebPageSchema(canonicalUrl, title, description),
    about: { '@type': 'LegalService', name: 'ClaimVelo', url: BASE_URL },
    speakable: { '@type': 'SpeakableSpecification', cssSelector: ['h1', 'h2'] },
    geo: { '@type': 'GeoCoordinates', addressCountry: 'IE' },
  };
  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Can I claim flight compensation if my flight left from Ireland?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. All flights departing from Irish airports — including Dublin, Cork, Shannon and Ireland West Knock — are covered under EU Regulation 261/2004, regardless of which airline you flew with.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I claim against Ryanair for a delayed or cancelled flight?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Absolutely. Ryanair is fully subject to EU261 and we have extensive experience winning claims against them. A delay of 3 or more hours at your destination entitles you to €250–€400 per passenger on most Irish routes.',
        },
      },
      {
        '@type': 'Question',
        name: 'How far back can I claim for flights from Ireland?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'In Ireland, the limitation period is generally 6 years, meaning flights from 2020 onward are likely still within the claim window.',
        },
      },
      {
        '@type': 'Question',
        name: 'How much can I claim for a delayed flight from Dublin?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'For flights under 1,500 km (most intra-European routes) the fixed EU261 amount is €250 per passenger. For flights between 1,500 and 3,500 km it is €400. For long-haul routes over 3,500 km — such as Dublin to New York — the amount is €300 if the arrival delay is 3–4 hours, or €600 if the delay is 4 hours or more.',
        },
      },
    ],
  };
  return [webpage, faqPage];
}

function buildAboutSchema(title: string, description: string, canonicalUrl: string) {
  const webpage = { ...buildWebPageSchema(canonicalUrl, title, description), '@type': 'AboutPage' };
  const org = {
    '@context': 'https://schema.org',
    '@type': 'LegalService',
    name: 'ClaimVelo',
    url: BASE_URL,
    description: 'Aviation law specialists recovering flight compensation for passengers across the EU, UK, Israel and the United States under EU261, UK261 and Israeli Aviation Services Law.',
    foundingDate: '2019',
    areaServed: ['EU', 'GB', 'IL', 'US'],
    knowsAbout: ['EU Regulation 261/2004', 'UK261', 'Israeli Aviation Services Law', 'US DOT Passenger Rights', 'Flight Compensation'],
    priceRange: 'Free eligibility check. 30% commission only on successful claims.',
    email: 'info@claimvelo.com',
  };
  return [webpage, org];
}

function buildUKSchemas(title: string, description: string, canonicalUrl: string) {
  const webpage = buildWebPageSchema(canonicalUrl, title, description);
  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Does UK261 apply to all UK flights?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'UK261 covers three categories: any flight departing from a UK airport (on any airline), any flight arriving in the UK operated by a UK or EU airline, and any flight arriving in the EU operated by a UK airline.',
        },
      },
      {
        '@type': 'Question',
        name: 'How much compensation can I claim for a delayed UK flight?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Under UK261: £220 for flights under 1,500 km, £350 for 1,500–3,500 km, £260 for flights over 3,500 km with a 3–4 hour arrival delay, and £520 for flights over 3,500 km with a 4+ hour arrival delay.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I claim UK flight compensation after Brexit?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Following Brexit, the UK transposed EU Regulation 261/2004 into domestic law as UK261. Your rights are essentially identical to EU261 — compensation amounts are fixed in pounds sterling.',
        },
      },
      {
        '@type': 'Question',
        name: 'How far back can I claim for a UK flight?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: '6 years in England and Wales, and 5 years in Scotland, from the date of the disrupted flight. Flights from 2020 onward are likely still within the claim window.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I claim against British Airways or EasyJet?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. All UK-registered carriers including British Airways, EasyJet, Jet2, TUI, and Virgin Atlantic are fully subject to UK261. ClaimVelo has extensive experience winning claims against all of them.',
        },
      },
      {
        '@type': 'Question',
        name: 'What if my delay is 5 hours or more?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'If your delay reaches 5 hours or more under UK261, you have the right to choose not to travel and request a full refund of the unused ticket in the original form of payment within 7 days.',
        },
      },
    ],
  };
  return [webpage, faqPage];
}

function buildBreadcrumbSchema(page: Page, canonicalUrl: string) {
  const homeItem = { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL + '/' };

  const pageLabels: Partial<Record<Page, string>> = {
    'how-it-works': 'How It Works',
    fees: 'Our Fees',
    about: 'About Us',
    claim: 'Start a Claim',
    ireland: 'Ireland',
    'united-kingdom': 'United Kingdom',
    partners: 'Partner Programme',
    privacy: 'Privacy Policy',
  };

  const label = pageLabels[page];
  if (!label) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      homeItem,
      { '@type': 'ListItem', position: 2, name: label, item: canonicalUrl },
    ],
  };
}

function getPageSchemas(page: Page, title: string, description: string, canonicalUrl: string) {
  const breadcrumb = buildBreadcrumbSchema(page, canonicalUrl);
  let schemas: object[];

  switch (page) {
    case 'home': schemas = buildHomeSchemas(title, description, canonicalUrl); break;
    case 'how-it-works': schemas = buildHowItWorksSchema(title, description, canonicalUrl); break;
    case 'ireland': schemas = buildIrelandSchemas(title, description, canonicalUrl); break;
    case 'about': schemas = buildAboutSchema(title, description, canonicalUrl); break;
    case 'united-kingdom': schemas = buildUKSchemas(title, description, canonicalUrl); break;
    default:
      schemas = PUBLIC_PAGE_PATHS[page] !== undefined ? [buildWebPageSchema(canonicalUrl, title, description)] : [];
  }

  if (breadcrumb) schemas = [...schemas, breadcrumb];
  return schemas;
}

export default function SEO({ page, locale }: Props) {
  const { t } = useTranslation();

  const isNoIndex = NOINDEX_PAGES.has(page);
  const pagePath = PUBLIC_PAGE_PATHS[page] ?? '';

  const titleKey = `meta.${page === 'how-it-works' ? 'howitworks' : page}.title`;
  const descKey = `meta.${page === 'how-it-works' ? 'howitworks' : page}.desc`;

  const title = t(titleKey, { defaultValue: 'ClaimVelo — Flight Compensation Specialists' });
  const description = t(descKey, { defaultValue: 'Claim up to €600 for delayed or cancelled flights. No win, no fee.' });

  const canonicalUrl = `${BASE_URL}${pagePath}`;
  const schemas = getPageSchemas(page, title, description, canonicalUrl);

  // suppress unused locale warning — kept for future i18n expansion
  void locale;

  return (
    <Helmet>
      <html lang="en" />
      <title>{title}</title>
      <meta name="description" content={description} />
      {isNoIndex
        ? <meta name="robots" content="noindex, nofollow" />
        : <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
      }
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={BASE_OG_IMAGE} />
      <meta property="og:image:type" content={OG_IMAGE_TYPE} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="ClaimVelo — Claim up to €600 for delayed or cancelled flights" />
      <meta property="og:site_name" content="ClaimVelo" />
      <meta property="og:locale" content="en_GB" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@ClaimVeloPro" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={BASE_OG_IMAGE} />
      <meta name="twitter:image:alt" content="ClaimVelo — Claim up to €600 for delayed or cancelled flights" />

      {/* Per-page JSON-LD structured data */}
      {schemas.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}
