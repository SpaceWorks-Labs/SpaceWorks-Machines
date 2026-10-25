import { webhookResponse } from "@/lib/payments/webhookRoute";

export const dynamic = "force-dynamic";

/** Razorpay webhooks; the space is identified by the unguessable code in the path. */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  return webhookResponse("RAZORPAY", (await params).code, request);
}
