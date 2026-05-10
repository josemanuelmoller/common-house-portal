import { requireAdmin } from "@/lib/require-admin";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import { QuickCaptureForm } from "@/components/capture/QuickCaptureForm";

export const metadata = {
  title: "Captura rápida — Common House",
};

export const dynamic = "force-dynamic";

export default async function CaptureNewPage() {
  await requireAdmin();

  return (
    <PortalShell
      eyebrow={{ label: "QUICK CAPTURE" }}
      title="Captura"
      flourish="rápida"
      narrow
      bodySpacing={6}
    >
      <HallSection
        title="Nueva"
        flourish="captura"
        meta="va a la bandeja"
      >
        <QuickCaptureForm />
      </HallSection>
    </PortalShell>
  );
}
