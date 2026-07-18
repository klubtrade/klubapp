"use client";

import { LayoutGrid, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { NavigationIcon } from "@/components/navigation-icon";
import {
  isMoreNavigationActive,
  isNavigationItemActive,
  PRIMARY_NAVIGATION,
} from "@/lib/navigation";

export function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("klub.sidebar.expanded");
    if (saved === "true") setExpanded(true);
  }, []);

  function toggle() {
    setExpanded((current) => {
      const next = !current;
      window.localStorage.setItem("klub.sidebar.expanded", String(next));
      return next;
    });
  }

  return (
    <aside
      className={`fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-border-subtle bg-bg-base/95 py-4 backdrop-blur-xl transition-[width] duration-200 md:flex ${
        expanded ? "w-60" : "w-20"
      }`}
      aria-label="Primary navigation"
    >
      <div className="flex items-center justify-between px-4">
        <Link href="/portfolio" aria-label="KLUB portfolio" className="min-w-0">
          <Image
            src="/privy-logo.png"
            alt="KLUB"
            width={96}
            height={48}
            className={`h-9 object-contain object-left ${expanded ? "w-24" : "w-12"}`}
          />
        </Link>
        {expanded && (
          <button
            type="button"
            onClick={toggle}
            aria-label="Collapse sidebar"
            className="rounded-lg p-2 text-fg-muted hover:bg-bg-surface hover:text-fg-primary"
          >
            <PanelLeftClose size={19} aria-hidden />
          </button>
        )}
      </div>

      <nav className="mt-8 flex-1 space-y-1 px-3">
        {PRIMARY_NAVIGATION.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            active={isNavigationItemActive(pathname, item)}
            expanded={expanded}
          />
        ))}
        <NavLink
          href="/more"
          label="Product hub"
          active={isMoreNavigationActive(pathname)}
          expanded={expanded}
          icon={<LayoutGrid size={21} strokeWidth={1.7} aria-hidden />}
        />
      </nav>

      <div className="space-y-1 px-3">
        <NavLink
          href="/settings"
          label="Settings"
          active={Boolean(pathname?.startsWith("/settings"))}
          expanded={expanded}
        />
        {!expanded && (
          <button
            type="button"
            onClick={toggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="flex h-12 w-full items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-bg-surface hover:text-fg-primary"
          >
            <PanelLeftOpen size={21} aria-hidden />
          </button>
        )}
      </div>
    </aside>
  );
}

function NavLink({
  href,
  label,
  active,
  expanded,
  icon,
}: {
  readonly href: string;
  readonly label: string;
  readonly active: boolean;
  readonly expanded: boolean;
  readonly icon?: ReactNode;
}) {
  return (
    <Link
      href={href}
      title={expanded ? undefined : label}
      aria-label={label}
      className={`flex h-12 items-center rounded-lg transition-colors ${
        expanded ? "gap-3 px-3" : "justify-center"
      } ${
        active
          ? "bg-bg-surface text-accent"
          : "text-fg-muted hover:bg-bg-surface hover:text-fg-primary"
      }`}
    >
      <span className="shrink-0">{icon ?? <NavigationIcon href={href} />}</span>
      {expanded && <span className="text-[14px] font-medium">{label}</span>}
    </Link>
  );
}
