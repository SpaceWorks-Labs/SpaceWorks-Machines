import { Card, CardHeader, Chip } from "@/components/ui/display";
import { money, words } from "@/lib/jobs/presentation";
import { PayNow, PaymentDialog, type PaymentRow } from "./PaymentActions";

export function PaymentBlock({ payments, spaceSlug, manage = false, canPay = false, methods = [], userId }: {
  payments: PaymentRow[]; spaceSlug: string; manage?: boolean; canPay?: boolean; methods?: string[]; userId?: string;
}) {
  return <div className="flex flex-col gap-4">{payments.map((p) => <Card key={p.id} as="section">
    <CardHeader title={`${words(p.kind)} · ${money(p.amount, p.currency)}`} action={<Chip tone={p.status === "PAID" ? "success" : "neutral"}>{words(p.status)}</Chip>} />
    <p className="break-words text-body-ui text-ink-secondary">{p.method ? words(p.method) : "Method not selected"}{p.reference ? ` · ${p.reference}` : ""}</p>
    {p.status === "PENDING" ? <p className="mt-2 text-body-ui">Payment pending{p.recordedById ? " · Awaiting staff confirmation" : ""}</p> : null}
    <div className="mt-3 flex flex-wrap gap-2">
      {canPay && ["PENDING", "FAILED"].includes(p.status) && !p.recordedById ? <PayNow spaceSlug={spaceSlug} paymentId={p.id} /> : null}
      {manage && ["PENDING", "FAILED"].includes(p.status) && !p.recordedById ? <>
        <PaymentDialog spaceSlug={spaceSlug} payment={p} kind="record" label="Record offline payment" methods={methods} />
        <PaymentDialog spaceSlug={spaceSlug} payment={p} kind="waive" label="Waive payment" methods={methods} />
      </> : null}
      {manage && p.status === "PENDING" && p.recordedById && p.recordedById !== userId ? <PaymentDialog spaceSlug={spaceSlug} payment={p} kind="confirm" label="Confirm payment" methods={methods} /> : null}
      {manage && p.status === "PAID" && p.amountRefunded < p.amount ? <PaymentDialog spaceSlug={spaceSlug} payment={p} kind="refund" label="Propose refund" methods={methods} /> : null}
    </div>
    {p.refunds.length ? <ul className="mt-4 flex flex-col gap-3" aria-label="Refunds">{p.refunds.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
      <span>Refund · {money(r.amount, p.currency)}</span><Chip>{words(r.status)}</Chip>
      {r.failureReason ? <span className="text-body-ui text-danger-fg">{r.failureReason}</span> : null}
      {manage && r.status === "PENDING" ? <PaymentDialog spaceSlug={spaceSlug} payment={p} kind="processRefund" refundId={r.id} refundAmount={r.amount} label={p.method === "STRIPE" || p.method === "RAZORPAY" ? "Process gateway refund" : "Record refund handed back"} methods={methods} /> : null}
    </li>)}</ul> : null}
  </Card>)}</div>;
}
