// Single source of the model allowlist (requirement: "모델 allowlist"). Kept
// in its own zero-dependency file so both src/env/server-schema.ts (which
// validates NVIDIA_INTENT_MODEL against it at boot) and intent-client.ts
// (which defends the same allowlist at construction time) can import it
// without creating an import cycle through @/env/server.
export const NVIDIA_INTENT_ALLOWED_MODELS = ["meta/llama-3.1-8b-instruct"] as const;

export type NvidiaIntentModel = (typeof NVIDIA_INTENT_ALLOWED_MODELS)[number];
