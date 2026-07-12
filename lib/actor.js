// Who is making this change? Read from the cookie that the identity gate sets.
//
// A cookie rather than a header on purpose: it rides along with every request
// automatically, so no fetch call site has to remember to send it — which means
// no mutation can silently go unattributed just because someone forgot.
import { cookies } from "next/headers";

export function currentActor() {
  try {
    const c = cookies().get("ammex-actor");
    return c?.value ? decodeURIComponent(c.value) : "Unknown";
  } catch {
    return "Unknown";
  }
}
