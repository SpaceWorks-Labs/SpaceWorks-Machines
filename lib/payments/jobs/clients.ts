import "server-only";
import type { PaymentMethod, Prisma } from "@prisma/client";
import { credentialsOf, GATEWAYS } from "../config";
import type { PaymentGateway } from "../gateway";

export type GatewayClients = Partial<Record<"RAZORPAY" | "STRIPE", PaymentGateway>>;
export async function jobGateway(tx: Prisma.TransactionClient, spaceId: string, method: PaymentMethod | null, clients: GatewayClients) {
  const settings = await tx.spacePaymentSettings.findUnique({ where: { spaceId } });
  if (!settings || settings.provider === "NONE" || (method && method !== settings.provider)) throw new Error("The original payment gateway is not configured.");
  const credentials = credentialsOf(settings);
  if (!credentials) throw new Error("Configure payment gateway credentials first.");
  return { provider: settings.provider, credentials, gateway: clients[settings.provider] ?? GATEWAYS[settings.provider] };
}
