/**
 * /admin/clients/new — Create a new engagement
 *
 * Server-rendered shell + client form. The form POSTs to
 * /api/admin/engagements (which calls adminGuardApi) and on success
 * redirects to the new detail page.
 */

import { requireAdmin } from "@/lib/require-admin";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import { NewEngagementForm } from "@/components/NewEngagementForm";

export const dynamic = "force-dynamic";

export default async function NewEngagementPage() {
  await requireAdmin();

  return (
    <PortalShell
      eyebrow={{ label: "COMMERCIAL", accent: "NEW ENGAGEMENT" }}
      title="New engagement"
      flourish="register"
      subtitle="Add a new row to the engagements table. Required: relationship name. Everything else is optional."
    >
      <HallSection title="Details" meta="ADMIN ONLY">
        <NewEngagementForm />
      </HallSection>
    </PortalShell>
  );
}
