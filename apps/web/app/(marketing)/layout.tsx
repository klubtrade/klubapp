// apps/web/app/(marketing)/layout.tsx

/**
 * Marketing route group layout — server component wrapper.
 *
 * Exists solely to set `dynamic = 'force-dynamic'` on the marketing
 * pages. The landing page (`page.tsx`) is a 'use client' component
 * that uses framer-motion hooks (`useScroll`, `useTransform`) which
 * Next 14's static prerenderer can't evaluate cleanly — it throws
 * `Cannot read properties of undefined (reading 'clientModules')`
 * during the `/` static export. Rendering on request avoids the
 * prerender step entirely.
 *
 * Trade-off: we lose static-HTML caching for the landing page.
 * That's fine — Next's standard on-demand rendering is fast enough
 * for a marketing surface, and Vercel's edge cache picks up the
 * slack for repeat visitors.
 */

export const dynamic = 'force-dynamic';

export default function MarketingLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return <>{children}</>;
}
