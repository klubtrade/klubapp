export type NavigationIcon = "portfolio" | "trade" | "copy";

export interface NavigationItem {
  readonly href: string;
  readonly label: string;
  readonly description?: string;
  readonly badge?: "Advanced" | "Lab";
  readonly aliases?: readonly string[];
  readonly icon?: NavigationIcon;
}

export interface NavigationGroup {
  readonly label: string;
  readonly items: readonly NavigationItem[];
}

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
      { href: "/cash", label: "Cash", description: "Deposit and withdraw" },
      { href: "/ramp", label: "Add funds", description: "Buy USDC" },
    ],
  },
  {
    label: "Advanced",
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
    label: "Explore",
    items: [
      {
        href: "/earn",
        label: "Earn",
        description: "Yield products",
        badge: "Lab",
      },
      {
        href: "/basis",
        label: "Basis",
        description: "Delta-neutral strategies",
        badge: "Lab",
      },
      {
        href: "/desk",
        label: "Funding desk",
        description: "Funding opportunities",
        badge: "Lab",
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
  return MORE_NAVIGATION.some((group) =>
    group.items.some((item) => isNavigationItemActive(pathname, item)),
  );
}

function matchesRoute(pathname: string, href: string): boolean {
  const route = href.length > 1 ? href.replace(/\/$/, "") : href;
  const current = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return current === route || current.startsWith(`${route}/`);
}
