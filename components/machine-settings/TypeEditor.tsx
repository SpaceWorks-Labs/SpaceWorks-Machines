"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { FullType } from "@/lib/machines/queries";
import { TypeSectionForm } from "./TypeSectionForm";
import { FieldDefinitionsEditor } from "./FieldDefinitionsEditor";

const SECTIONS = [ ["details", "Details"], ["specFields", "Spec fields"], ["requestFields", "Request fields"],
  ["filePolicy", "File policy"], ["catalogue", "Materials, colours and units"], ["queue", "Queue rules"] ] as const;

export function TypeEditor({ spaceSlug, type, canManage }: { spaceSlug: string; type: FullType; canManage: boolean }) {
  return <Tabs defaultValue="details">
    <TabsList aria-label="Machine type sections">{SECTIONS.map(([section, label]) => <TabsTrigger key={section} value={section}>{label}</TabsTrigger>)}</TabsList>
    {SECTIONS.map(([section]) => <TabsContent key={section} value={section} forceMount className="data-[state=inactive]:hidden">
      {section === "specFields" || section === "requestFields"
        ? <FieldDefinitionsEditor spaceSlug={spaceSlug} typeId={type.id} section={section} fields={type[section]} canManage={canManage} />
        : <TypeSectionForm spaceSlug={spaceSlug} type={type} section={section} canManage={canManage} />}
    </TabsContent>)}
  </Tabs>;
}
