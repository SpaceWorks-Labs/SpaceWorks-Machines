import { Callout, Card, CardHeader, Chip } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CHANNEL_LABELS, PAYOUT_METHOD_LABELS, PAYOUT_STATUS_LABELS, REQUEST_STATUS_LABELS } from "@/components/repairs/labels";
import { AnswerRequestButtons, AskTechniciansDialog, ApproveAmountDialog, PayoutDialog, RevokeRequestButton, StaffFixForm, VerifyRepairButtons } from "@/components/repairs/RepairActions";
import { formatMoney, isCurrencyCode } from "@/lib/money/currencies";
import { formatDate, formatDayTime } from "@/lib/format/datetime";
import { UpkeepFileUpload } from "@/components/upkeep/UpkeepFileUpload";
import type { RepairPanelData } from "@/lib/repairs/view";

/** Who was asked, who took it, the fix, the check and (for the machine manager) the money. */
export function RepairPanel({ spaceSlug, faultId, currency, locale, timeZone, data }: { spaceSlug: string; faultId: string; currency: string; locale?: string; timeZone: string; data: RepairPanelData }) {
  const money = (value: number | null | undefined) => value == null ? "Not given" : isCurrencyCode(currency) ? formatMoney(value, currency, locale) : `${value} ${currency}`;
  return <Card as="section" aria-label="Repair" className="flex flex-col gap-5">
    <CardHeader title="Repair" description={data.technician ? `Taken by ${data.technician.name} (${data.technician.kind === "STAFF" ? "staff" : "outside technician"}).` : "Nobody has taken this repair yet."}
      action={data.canRequest ? <AskTechniciansDialog spaceSlug={spaceSlug} faultId={faultId} technicians={data.technicians} /> : null} />
    {data.myPendingRequestId ? <div className="flex flex-wrap items-center gap-3"><p className="font-bold">You were asked to take this repair.</p>
      <AnswerRequestButtons spaceSlug={spaceSlug} requestId={data.myPendingRequestId} /></div> : null}
    {data.timeline.length ? <Table label="Repair requests"><THead><TR><TH>Technician</TH><TH>Sent</TH><TH>By</TH><TH>Answer</TH>{data.canRequest ? <TH><span className="sr-only">Actions</span></TH> : null}</TR></THead>
      <TBody>{data.timeline.map((row) => <TR key={row.id}><TD className="font-semibold">{row.technician}</TD><TD className="whitespace-nowrap">{formatDayTime(row.sentAt, timeZone)}</TD>
        <TD>{row.channels.map((channel) => CHANNEL_LABELS[channel] ?? channel).join(", ")}</TD>
        <TD><span className="flex flex-wrap items-center gap-2"><Chip size="sm">{REQUEST_STATUS_LABELS[row.status]}</Chip>{row.closedReason ? <span className="text-caption text-ink-muted">{row.closedReason}</span> : null}</span></TD>
        {data.canRequest ? <TD>{row.status === "SENT" ? <RevokeRequestButton spaceSlug={spaceSlug} requestId={row.id} name={row.technician} /> : null}</TD> : null}</TR>)}</TBody></Table> : null}
    {data.fix.reopenReason && !data.fix.fixedAt ? <Callout tone="warning" title="Reopened">{data.fix.reopenReason}</Callout> : null}
    {data.fix.remarks || data.fix.parts ? <dl className="grid gap-3 sm:grid-cols-2">
      <div><dt className="text-label">Fix</dt><dd className="whitespace-pre-line break-words text-body-ui">{data.fix.remarks || "Not written yet"}</dd></div>
      <div><dt className="text-label">Parts used</dt><dd className="whitespace-pre-line break-words text-body-ui">{data.fix.parts || "None listed"}</dd></div>
    </dl> : null}
    {data.fix.photos.length ? <ul className="flex flex-wrap gap-3" aria-label="Photos of the fix">{data.fix.photos.map((photo, index) =>
      // eslint-disable-next-line @next/next/no-img-element
      <li key={photo.id}><a className="block rounded-lg" href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={`Photo of the fix ${index + 1} (opens in a new tab)`} className="size-28 rounded-lg border border-line object-cover" /></a></li>)}</ul> : null}
    {data.canRecordFix ? <UpkeepFileUpload spaceSlug={spaceSlug} kind="fault" targetId={faultId} label="Add a photo of the fix" /> : null}
    {data.canRecordFix ? <StaffFixForm spaceSlug={spaceSlug} faultId={faultId} currency={currency} remarks={data.fix.remarks} parts={data.fix.parts} amountAsked={data.money?.amountAsked ?? null} /> : null}
    {data.canVerify ? <VerifyRepairButtons spaceSlug={spaceSlug} faultId={faultId} /> : null}
    {data.money ? <div className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2 text-body-ui">Amount asked: <span className="font-bold">{money(data.money.amountAsked)}</span>
        <Chip size="sm">{PAYOUT_STATUS_LABELS[data.money.payoutStatus]}</Chip></p>
      {"approvedAmount" in data.money ? <p className="text-body-ui">Approved: <span className="font-bold">{data.money.approvedAmount == null ? "Not yet" : money(data.money.approvedAmount)}</span>
        {data.money.amountChangeReason ? ` (${data.money.amountChangeReason})` : ""} · Paid: <span className="font-bold">{money(data.money.paidAmount)}</span></p> : null}
      {data.canPay ? <div className="flex flex-wrap gap-2">
        <ApproveAmountDialog spaceSlug={spaceSlug} faultId={faultId} currency={currency} asked={data.money.amountAsked} />
        {"approvedAmount" in data.money && data.money.approvedAmount != null && data.money.approvedAmount > (data.money.paidAmount ?? 0)
          ? <PayoutDialog spaceSlug={spaceSlug} faultId={faultId} currency={currency} due={data.money.approvedAmount - (data.money.paidAmount ?? 0)} /> : null}
      </div> : null}
      {data.payouts.length ? <Table label="Payouts"><THead><TR><TH>Paid on</TH><TH>Amount</TH><TH>Method</TH><TH>Reference</TH></TR></THead>
        <TBody>{data.payouts.map((row) => <TR key={row.id}><TD className="whitespace-nowrap">{formatDate(row.paidAt, timeZone)}</TD><TD className="whitespace-nowrap">{money(row.amount)}</TD><TD>{PAYOUT_METHOD_LABELS[row.method]}</TD><TD>{row.reference || <span className="text-ink-muted">None</span>}</TD></TR>)}</TBody></Table> : null}
    </div> : null}
  </Card>;
}
