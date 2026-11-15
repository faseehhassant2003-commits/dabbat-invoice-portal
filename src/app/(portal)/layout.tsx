import { PortalShell } from "@/components/portal-shell";
import { isDemoMode } from "@/lib/server/config";
import { requirePortalSession } from "@/lib/server/auth";
export const dynamic = "force-dynamic";
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const demo = isDemoMode();
  if (!demo) await requirePortalSession();
  return <PortalShell demo={demo}>{children}</PortalShell>;
}
