/**
 * Empty state - reusable "nothing here yet" surface.
 *
 * Used on every page that has a "no data" branch: no open positions,
 * no followed leaders, no practice trades logged, no alert history.
 *
 * Retail never sees a blank page. Every empty state explains what
 * this space WILL contain, and offers a concrete next action.
 */

import Link from 'next/link';

export function EmptyState({
  icon,
  title,
  description,
  primaryCta,
  secondaryCta,
}: {
  readonly icon?: React.ReactNode;
  readonly title: string;
  readonly description: string;
  readonly primaryCta?: { readonly label: string; readonly href: string };
  readonly secondaryCta?: { readonly label: string; readonly href: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-klub-lg border border-dashed border-border bg-bg-surface/50 px-6 py-12 text-center">
      {icon && (
        <div
          className="mb-5 flex h-12 w-12 items-center justify-center rounded-klub-lg bg-accent/10 text-accent"
          aria-hidden
        >
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-fg-primary">{title}</h3>
      <p className="mt-2 max-w-md text-[14px] leading-relaxed text-fg-secondary">
        {description}
      </p>
      {(primaryCta || secondaryCta) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {primaryCta && (
            <Link href={primaryCta.href} className="btn-primary">
              {primaryCta.label}
              <span className="ml-1">→</span>
            </Link>
          )}
          {secondaryCta && (
            <Link href={secondaryCta.href} className="btn-secondary">
              {secondaryCta.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
