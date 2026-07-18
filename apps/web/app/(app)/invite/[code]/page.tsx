// apps/web/app/invite/[code]/page.tsx
import { notFound } from 'next/navigation';

import { InviteFlow } from './invite-flow';

/**
 * /invite/[code] - server component. Validates the code at request
 * time and hands off to the client-side flow. Invalid codes 404.
 */
export default async function InvitePage({
  params,
}: {
  readonly params: { readonly code: string };
}) {
  const code = params.code.trim().toLowerCase();
  const check = await validateCode(code);
  if (!check.valid) {
    notFound();
  }

  return (
    <InviteFlow
      code={code}
      label={check.label}
      {...(check.remaining !== null ? { remaining: check.remaining } : {})}
    />
  );
}

async function validateCode(
  code: string,
): Promise<
  | { readonly valid: true; readonly label: string; readonly remaining: number | null }
  | { readonly valid: false }
> {
  try {
    const baseUrl =
      process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://klubapp-web.vercel.app';
    const res = await fetch(`${baseUrl}/api/invite?code=${encodeURIComponent(code)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return { valid: false };
    const body = (await res.json()) as
      | { valid: true; label: string; remaining: number | null }
      | { valid: false };
    return body;
  } catch {
    return { valid: false };
  }
}
