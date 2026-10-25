// Each fresh browser context signs in from its own client address. Test servers trust `x-real-ip`
// (TRUSTED_PROXY_IP_HEADER), so the suite stays under the per-address sign-in limit while the
// per-account limits still apply. Servers that trust another header simply ignore it.
let next = 0;

export function nextClientAddress() {
  next = (next % 250) + 1;
  return `10.${(process.pid >> 8) & 255}.${process.pid & 255}.${next}`;
}

export const clientAddressHeaders = () => ({ "x-real-ip": nextClientAddress() });
