import Image from "next/image";
import { Chip } from "@/components/ui/display";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { MachineFileUpload } from "./MachineFileUpload";
import { MachinePhotoControls } from "./MachinePhotoControls";
import type { MachineFileContext, MachinePhotoRow } from "./types";

export function MachinePhotosPanel({ spaceSlug, machineId, canManage, photos }: MachineFileContext & { photos: MachinePhotoRow[] }) {
  return (
    <CollapsibleSection id="machine-photos" title="Photos" count={photos.length} description="Up to 8 photos. The first is the catalogue cover." startOpen={canManage || photos.length > 0}>
      <div className="flex flex-col gap-5">
        {photos.length ? <ol className="grid gap-5 sm:grid-cols-2">
          {photos.map((photo, index) => <li key={photo.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-line p-3">
            <a href={photo.url} className="relative block aspect-[4/3] overflow-hidden rounded-lg bg-surface" aria-label={`Open photo ${index + 1}${photo.alt ? `: ${photo.alt}` : ""}`}>
              <Image src={photo.url} alt={photo.alt} fill unoptimized sizes="(min-width:640px) 440px, 100vw" className="object-contain" />
            </a>
            <div className="flex items-center gap-2"><span className="text-caption text-ink-muted">Photo {index + 1}</span>{index === 0 ? <Chip size="sm">Cover</Chip> : null}</div>
            {canManage ? <MachinePhotoControls spaceSlug={spaceSlug} machineId={machineId} photo={photo} photoIds={photos.map((photo) => photo.id)} index={index} />
              : photo.alt ? <p className="break-words text-body-ui text-ink-secondary">{photo.alt}</p> : null}
          </li>)}
        </ol> : <p className="text-body-ui text-ink-muted">No photos yet.</p>}
        {canManage ? <MachineFileUpload spaceSlug={spaceSlug} machineId={machineId} kind="photo" disabled={photos.length >= 8} /> : null}
      </div>
    </CollapsibleSection>
  );
}
