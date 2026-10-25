import { Chip } from "@/components/ui/display";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { MachineFileUpload } from "./MachineFileUpload";
import { MachineDocumentControls } from "./MachineDocumentControls";
import { DOCUMENT_KIND_LABELS } from "./DocumentMetaFields";
import type { MachineFileContext, MachineDocumentRow } from "./types";

export function MachineDocumentsPanel({ spaceSlug, machineId, canManage, documents }: MachineFileContext & { documents: MachineDocumentRow[] }) {
  return (
    <CollapsibleSection id="machine-documents" title="Documents" count={documents.length} description="Manuals, operating procedures and safety information." startOpen={canManage || documents.length > 0}>
      <div className="flex flex-col gap-5">
        {documents.length ? <ul className="flex flex-col divide-y divide-line">
          {documents.map((document) => <li key={document.id} className="flex min-w-0 flex-col gap-3 py-4 first:pt-0 last:pb-0">
            <a href={document.url} className="break-words text-label text-accent-text underline underline-offset-4">{document.title}</a>
            <p className="break-words text-caption text-ink-muted">{document.filename} · {Math.max(1, Math.ceil(document.sizeBytes / 1024))} KB</p>
            <div className="flex flex-wrap gap-2"><Chip>{DOCUMENT_KIND_LABELS[document.kind]}</Chip><Chip tone="outline">{document.isPublic ? "Public document" : "Staff only"}</Chip></div>
            {canManage ? <MachineDocumentControls spaceSlug={spaceSlug} document={document} /> : null}
          </li>)}
        </ul> : <p className="text-body-ui text-ink-muted">No documents yet.</p>}
        {canManage ? <MachineFileUpload spaceSlug={spaceSlug} machineId={machineId} kind="document" /> : null}
      </div>
    </CollapsibleSection>
  );
}
