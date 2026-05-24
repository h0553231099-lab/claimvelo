import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, type Locale } from '../lib/i18n';
import type { Page } from '../types';

const BASE_URL = 'https://claimvelo.com';

// Public pages that get indexed and hreflang tags
const PUBLIC_PAGE_PATHS: Partial<Record<Page, string>> = {
  home: '',
  claim: '/claim',
  'how-it-works': '/how-it-works',
  fees: '/fees',
  about: '/about',
  signin: '/signin',
  privacy: '/privacy',
};

const BASE_OG_IMAGE = 'https://claimvelo.com/images/og-cover.svg';
const OG_IMAGE_TYPE = 'image/svg+xml';

interface Props {
  page: Page;
  locale: Locale;
}

export default function SEO({ page, locale }: Props) {
  const { t } = useTranslation();

  const isPublic = page in PUBLIC_PAGE_PATHS;
  const pagePath = PUBLIC_PAGE_PATHS[page] ?? '';

  const titleKey = `meta.${page === 'how-it-works' ? 'howitworks' : page}.title`;
  const descKey = `meta.${page === 'how-it-works' ? 'howitworks' : page}.desc`;

  const title = t(titleKey, { defaultValue: 'ClaimVelo — Flight Compensation Specialists' });
  const description = t(descKey, { defaultValue: 'Claim up to €600 for delayed or cancelled flights. No win, no fee.' });

  // Canonical URL for current locale
  const localePath = locale === 'en' ? '' : `/${locale}`;
  const canonicalUrl = `${BASE_URL}${localePath}${pagePath}`;

  return (
    <Helmet>
      <html lang={locale} />
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />
      <meta http-equiv="content-language" content={locale} />
      <meta name="google-site-verification" content="hID1uCcjhUqtdGh7MA4QCQPrGxsK8zu_UBEseuZqXxQ" />

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
      <meta property="og:locale" content={locale.replace('-', '_')} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@ClaimVeloPro" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={BASE_OG_IMAGE} />
      <meta name="twitter:image:alt" content="ClaimVelo — Claim up to €600 for delayed or cancelled flights" />

      {/* Hreflang — only for public pages */}
      {isPublic && SUPPORTED_LOCALES.map(loc => {
        const lp = loc === 'en' ? '' : `/${loc}`;
        const href = `${BASE_URL}${lp}${pagePath}`;
        return <link key={loc} rel="alternate" hrefLang={loc} href={href} />;
      })}
      {/* x-default always points to English */}
      {isPublic && (
        <link rel="alternate" hrefLang="x-default" href={`${BASE_URL}${pagePath}`} />
      )}
    </Helmet>
  );
}
