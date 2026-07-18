import {
  Calculator,
  CandlestickChart,
  CircleDollarSign,
  FlaskConical,
  LayoutGrid,
  LineChart,
  Settings,
  Target,
  TrendingUp,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";

export function NavigationIcon({
  href,
  size = 21,
}: {
  readonly href: string;
  readonly size?: number;
}) {
  const props = { size, strokeWidth: 1.7, "aria-hidden": true } as const;
  if (href.startsWith("/portfolio")) return <WalletCards {...props} />;
  if (href.startsWith("/trade")) return <CandlestickChart {...props} />;
  if (href.startsWith("/copy")) return <Users {...props} />;
  if (href.startsWith("/cash")) return <CircleDollarSign {...props} />;
  if (href.startsWith("/pro")) return <LineChart {...props} />;
  if (href.startsWith("/earn")) return <TrendingUp {...props} />;
  if (href.startsWith("/basis")) return <Target {...props} />;
  if (href.startsWith("/desk")) return <CandlestickChart {...props} />;
  if (href.startsWith("/practice")) return <FlaskConical {...props} />;
  if (href.startsWith("/calculator")) return <Calculator {...props} />;
  if (href.startsWith("/invite")) return <UserPlus {...props} />;
  if (href.startsWith("/settings")) return <Settings {...props} />;
  return <LayoutGrid {...props} />;
}
