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
};

const NOINDEX_PAGES = new Set<Page>([
  'signin', 'agent-signin', 'sales-signin', 'seo-signin',
  'dashboard', 'admin', 'agent-dashboard', 'sales-dashboard', 'seo-dashboard',
  'loa',
]);

const BASE_OG_IMAGE = 'https://claimvelo.com/images/og-cover.svg';
const OG_IMAGE_TYPE = 'image/svg+xml';

interface Props {
  page: Page;
  locale: Locale;
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
    </Helmet>
  );
}
