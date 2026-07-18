const styles: Record<string, string> = {
  "/cash": "border-pnl-long/15 bg-pnl-long/10 text-pnl-long",
  "/pro": "border-purple-400/15 bg-purple-400/10 text-purple-300",
  "/earn": "border-emerald-400/15 bg-emerald-400/10 text-emerald-300",
  "/basis": "border-violet-400/15 bg-violet-400/10 text-violet-300",
  "/desk": "border-sky-400/15 bg-sky-400/10 text-sky-300",
  "/practice": "border-accent/15 bg-accent/10 text-accent",
  "/calculator": "border-cyan-400/15 bg-cyan-400/10 text-cyan-300",
  "/invite": "border-orange-400/15 bg-orange-400/10 text-orange-300",
};

export function HubIcon({ href }: { readonly href: string }) {
  return (
    <span
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-klub border ${styles[href] ?? styles["/practice"]}`}
    >
      <NavigationIcon href={href} size={22} />
    </span>
  );
}
import { NavigationIcon } from "@/components/navigation-icon";
