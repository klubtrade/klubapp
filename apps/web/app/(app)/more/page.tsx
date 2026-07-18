import Link from "next/link";

import { MORE_NAVIGATION } from "@/lib/navigation";

import { HubIcon } from "./hub-icon";

export default function MorePage() {
  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <div className="mx-auto w-full max-w-4xl">
        <header>
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-accent">
            Product hub
          </div>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-fg-primary md:text-[36px]">
            More from KLUB
          </h1>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-fg-muted">
            Trading, strategies, and tools in one place.
          </p>
        </header>

        <div className="mt-10 space-y-8">
          {MORE_NAVIGATION.map((group) => (
            <section key={group.label}>
              <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
                {group.label}
              </h2>
              <div className="mt-3 overflow-hidden rounded-klub-lg border border-border-subtle bg-bg-surface">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-4 border-b border-border-subtle p-4 transition-colors last:border-b-0 hover:bg-bg-elevated sm:p-5"
                  >
                    <HubIcon href={item.href} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[14px] font-semibold text-fg-primary">
                            {item.label}
                          </div>
                          {item.description && (
                            <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
                              {item.description}
                            </p>
                          )}
                        </div>
                        {item.badge && (
                          <span className="hidden shrink-0 rounded-full border border-border-subtle px-2 py-1 text-[9px] uppercase tracking-[0.08em] text-fg-muted min-[430px]:inline-flex">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      aria-hidden
                      className="shrink-0 text-[20px] text-fg-muted"
                    >
                      ›
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
