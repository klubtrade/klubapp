export type NavigationIcon = "portfolio" | "trade" | "copy";

export interface NavigationItem {
  readonly href: string;
  readonly label: string;
  readonly description?: string;
  readonly badge?: "Advanced" | "Testnet" | "Soon";
  readonly aliases?: readonly string[];
  readonly icon?: NavigationIcon;
}

export interface NavigationGroup {
  readonly label: string;
  readonly items: readonly NavigationItem[];
}

export const CANONICAL_ROUTE_ALIASES = [
  { from: "/home", to: "/portfolio" },
  { from: "/cash", to: "/funding" },
  { from: "/quick-trade", to: "/trade" },
  { from: "/follow", to: "/copy" },
  { from: "/copy-trade", to: "/copy" },
  { from: "/ramp", to: "/funding/add" },
] as const;

/** The only destinations that compete for primary-navigation attention. */
export const PRIMARY_NAVIGATION: readonly NavigationItem[] = [
  {
    href: "/portfolio",
    label: "Portfolio",
    aliases: ["/home", "/health"],
    icon: "portfolio",
  },
  {
    href: "/trade",
    label: "Trade",
    aliases: ["/quick-trade"],
    icon: "trade",
  },
  {
    href: "/copy",
    label: "Copy",
    aliases: ["/follow", "/copy-trade"],
    icon: "copy",
  },
] as const;

/** Secondary products stay discoverable without crowding the core journey. */
export const MORE_NAVIGATION: readonly NavigationGroup[] = [
  {
    label: "Money",
    items: [
      {
        href: "/funding",
        label: "Cash",
        description: "Add, send and receive funds",
        aliases: ["/cash", "/ramp"],
      },
    ],
  },
  {
    label: "Trading",
    items: [
      {
        href: "/pro",
        label: "Pro terminal",
        description: "Charts, book and order controls",
        badge: "Advanced",
      },
    ],
  },
  {
    label: "Earn & strategies",
    items: [
      {
        href: "/earn",
        label: "Earn",
        description: "Yield products",
        badge: "Testnet",
      },
      {
        href: "/basis",
        label: "Basis",
        description: "Delta-neutral strategies",
        badge: "Testnet",
      },
      {
        href: "/desk",
        label: "Funding desk",
        description: "Funding opportunities",
      },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/practice", label: "Practice", description: "Learn on testnet" },
      {
        href: "/calculator",
        label: "Calculator",
        description: "Model a position",
      },
      { href: "/invite", label: "Invite friends" },
    ],
  },
] as const;

export function isNavigationItemActive(
  pathname: string | null,
  item: NavigationItem,
): boolean {
  if (!pathname) return false;
  return [item.href, ...(item.aliases ?? [])].some((href) =>
    matchesRoute(pathname, href),
  );
}

export function isMoreNavigationActive(pathname: string | null): boolean {
  if (pathname && (pathname === "/more" || pathname.startsWith("/more/"))) {
    return true;
  }
  return MORE_NAVIGATION.some((group) =>
    group.items.some((item) => isNavigationItemActive(pathname, item)),
  );
}

export function canonicalizePathname(pathname: string): string | null {
  const current = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  for (const alias of CANONICAL_ROUTE_ALIASES) {
    if (current === alias.from || current.startsWith(`${alias.from}/`)) {
      const suffix = current.slice(alias.from.length);
      return `${alias.to}${suffix}`;
    }
  }
  return null;
}

function matchesRoute(pathname: string, href: string): boolean {
  const route = href.length > 1 ? href.replace(/\/$/, "") : href;
  const current = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return current === route || current.startsWith(`${route}/`);
}
