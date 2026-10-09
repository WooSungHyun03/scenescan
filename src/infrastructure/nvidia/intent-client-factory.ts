import "server-only";

// Requirement 3: NVIDIA_API_KEY is read in exactly one place -- here, via
// serverEnv (@/env/server, itself server-only-guarded and already asserts
// no NEXT_PUBLIC_*NVIDIA*KEY variant exists -- see assertNoPublicNvidiaKey
// in src/env/server-schema.ts). intent-client.ts's NvidiaIntentClient class
// itself never touches process.env; it only ever receives the key through
// this factory's constructor call.
import { serverEnv } from "@/env/server";
import { NvidiaCallBudget } from "./intent-budget";
import { NvidiaIntentClient } from "./intent-client";

let sharedClient: NvidiaIntentClient | undefined;
let sharedBudget: NvidiaCallBudget | undefined;

/**
 * Returns null -- never constructs a client, never touches fetch --
 * whenever NVIDIA_API_KEY is unset. Requirement 4's "키가 없으면 외부
 * 호출이 전혀 발생하지 않아야" is enforced here structurally: there is no
 * code path that can reach a real `fetch` call without first passing this
 * check. The feature-flag check (NVIDIA_INTENT_ENABLED) is a separate,
 * independent gate the caller (nvidia-intent-adapter.ts) applies before
 * ever calling this function.
 */
export function getNvidiaIntentClient(): NvidiaIntentClient | null {
  if (!serverEnv.nvidiaIntent?.apiKey) return null;
  sharedClient ??= new NvidiaIntentClient({
    apiKey: serverEnv.nvidiaIntent.apiKey,
    model: serverEnv.nvidiaIntent.model,
  });
  return sharedClient;
}

export function getNvidiaCallBudget(): NvidiaCallBudget {
  sharedBudget ??= new NvidiaCallBudget();
  return sharedBudget;
}
