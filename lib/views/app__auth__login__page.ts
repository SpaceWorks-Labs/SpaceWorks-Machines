import { connection } from "next/server";
import { isNewUserRegistrationEnabled } from "@/lib/instanceSettings";

export async function loadLoginView() {
  await connection();
  return { accountCreationEnabled: await isNewUserRegistrationEnabled() };
}
