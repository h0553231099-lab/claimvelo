import { SUPPORTED_LOCALES, type Locale } from './i18n';
import type { Page } from '../types';

// Pages that have URL segments (private pages just use the app state)
export const PAGE_PATHS: Record<string, Page> = {
  '': 'home',
  'claim': 'claim',
  'how-it-works': 'how-it-works',
  'fees': 'fees',
  'about': 'about',
  'signin': 'signin',
  'agent-signin': 'agent-signin',
  'sales-signin': 'sales-signin',
  'privacy': 'privacy',
  'dashboard': 'dashboard',
  'admin': 'admin',
};

export const PAGE_SLUGS: Partial<Record<Page, string>> = {
  home: '',
  claim: 'claim',
  'how-it-works': 'how-it-works',
  fees: 'fees',
  about: 'about',
  signin: 'signin',
  'agent-signin': 'agent-signin',
  'sales-signin': 'sales-signin',
  privacy: 'privacy',
  dashboard: 'dashboard',
  admin: 'admin',
};

export function parseUrl(pathname: string): { locale: Locale; page: Page } {
  const parts = pathname.replace(/^\//, '').split('/');
  let locale: Locale = 'en';
  let pageSlug = '';

  const firstPart = parts[0] || '';

  if (SUPPORTED_LOCALES.includes(firstPart as Locale)) {
    locale = firstPart as Locale;
    pageSlug = parts[1] || '';
  } else {
    pageSlug = firstPart;
  }

  const page = PAGE_PATHS[pageSlug] ?? 'home';
  return { locale, page };
}

export function buildUrl(page: Page, locale: Locale): string {
  const slug = PAGE_SLUGS[page] ?? '';
  const lang = locale === 'en' ? '' : `/${locale}`;
  return `${lang}/${slug}`.replace(/\/$/, '') || '/';
}
