import { z } from "zod";

// Relative import, not the usual `@/` alias: next.config.ts imports this
// module (transitively, via ./src/env/schema) through Next's separate
// next.config.ts transpilation path, which does not resolve the `@/*`
// tsconfig path alias the way the main application build does.
import { NVIDIA_INTENT_ALLOWED_MODELS, type NvidiaIntentModel } from "../infrastructure/nvidia/intent-models";
import {
  type EnvironmentInput,
  formatEnvironmentError,
  optionalEnvironmentHttpUrl,
  optionalEnvironmentString,
} from "./public-schema";

// NVIDIA_INTENT_ENABLED is a server-only kill switch, independent of
// NEXT_PUBLIC_USE_MOCK_AI/DATA (those gate CLIP/DB mocking; this gates a
// completely separate, optional text-search-intent enrichment). Unlike
// public-schema.ts's `booleanString` (which defaults to true for the mock
// flags), this must default to **false** -- requirement 4: "production
// 기본 OFF".
const optionalBooleanStringDefaultingFalse = z.preprocess(
  (value) => value === undefined || value === "" ? "false" : value,
  z.enum(["true", "false"]),
).transform((value) => value === "true");

const optionalNvidiaIntentModel = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.enum(NVIDIA_INTENT_ALLOWED_MODELS).optional(),
);

const serverEnvironmentSchema = z.object({
  SUPABASE_URL: optionalEnvironmentHttpUrl,
  SUPABASE_SECRET_KEY: optionalEnvironmentString,
  SUPABASE_SERVICE_ROLE_KEY: optionalEnvironmentString,
  PUBLIC_DATA_PORTAL_SERVICE_KEY: optionalEnvironmentString,
  KMA_VILLAGE_FORECAST_SERVICE_KEY: optionalEnvironmentString,
  NVIDIA_API_KEY: optionalEnvironmentString,
  NVIDIA_INTENT_ENABLED: optionalBooleanStringDefaultingFalse,
  NVIDIA_INTENT_MODEL: optionalNvidiaIntentModel,
}).superRefine((environment, context) => {
  const hasUrl = Boolean(environment.SUPABASE_URL);
  const hasKey = Boolean(
    environment.SUPABASE_SECRET_KEY
      || environment.SUPABASE_SERVICE_ROLE_KEY,
  );

  if (hasUrl === hasKey) return;
  if (!hasUrl) {
    context.addIssue({
      code: "custom",
      path: ["SUPABASE_URL"],
      message: "is required when a Supabase server secret is configured",
    });
  }
  if (!hasKey) {
    context.addIssue({
      code: "custom",
      path: ["SUPABASE_SECRET_KEY"],
      message: "or SUPABASE_SERVICE_ROLE_KEY is required with SUPABASE_URL",
    });
  }
});

export type ServerEnvironment = {
  supabaseAdmin?: {
    url: string;
    secretKey: string;
  };
  publicDataPortalServiceKey?: string;
  kmaVillageForecastServiceKey?: string;
  nvidiaIntent?: {
    enabled: boolean;
    model: NvidiaIntentModel;
    apiKey?: string;
  };
};

const forbiddenPublicSecretName = /^NEXT_PUBLIC_(?=.*SUPABASE)(?=.*(?:SECRET|SERVICE_ROLE))/i;
// Requirement 3: "NEXT_PUBLIC_ 접두어 변수로 들어오면 즉시 에러" -- mirrors
// assertNoPublicSupabaseSecrets below for the same reason (Next.js inlines
// any NEXT_PUBLIC_* variable into the browser bundle at build time).
const forbiddenPublicNvidiaKeyName = /^NEXT_PUBLIC_(?=.*NVIDIA)(?=.*KEY)/i;

export function assertNoPublicSupabaseSecrets(environment: EnvironmentInput): void {
  const leakedName = Object.keys(environment).find(
    (name) => forbiddenPublicSecretName.test(name)
      && Boolean(environment[name]?.trim()),
  );

  if (leakedName) {
    throw new Error(
      `${leakedName} must not be set: Supabase server secrets can never use NEXT_PUBLIC_`,
    );
  }
}

export function assertNoPublicNvidiaKey(environment: EnvironmentInput): void {
  const leakedName = Object.keys(environment).find(
    (name) => forbiddenPublicNvidiaKeyName.test(name)
      && Boolean(environment[name]?.trim()),
  );

  if (leakedName) {
    throw new Error(
      `${leakedName} must not be set: the NVIDIA API key can never use NEXT_PUBLIC_`,
    );
  }
}

export function parseServerEnvironment(
  environment: EnvironmentInput,
): ServerEnvironment {
  assertNoPublicSupabaseSecrets(environment);
  assertNoPublicNvidiaKey(environment);
  const result = serverEnvironmentSchema.safeParse(environment);
  if (!result.success) throw formatEnvironmentError("server", result.error);

  const secretKey = result.data.SUPABASE_SECRET_KEY
    || result.data.SUPABASE_SERVICE_ROLE_KEY;
  const nvidiaEnabled = result.data.NVIDIA_INTENT_ENABLED;
  const nvidiaApiKey = result.data.NVIDIA_API_KEY;
  const nvidiaModelOverride = result.data.NVIDIA_INTENT_MODEL;
  return Object.freeze({
    ...(result.data.SUPABASE_URL && secretKey ? { supabaseAdmin: Object.freeze({
      url: result.data.SUPABASE_URL,
      secretKey,
    }) } : {}),
    ...(result.data.PUBLIC_DATA_PORTAL_SERVICE_KEY
      ? { publicDataPortalServiceKey: result.data.PUBLIC_DATA_PORTAL_SERVICE_KEY }
      : {}),
    ...(result.data.KMA_VILLAGE_FORECAST_SERVICE_KEY
      ? { kmaVillageForecastServiceKey: result.data.KMA_VILLAGE_FORECAST_SERVICE_KEY }
      : {}),
    ...(nvidiaEnabled || nvidiaApiKey || nvidiaModelOverride ? { nvidiaIntent: Object.freeze({
      enabled: nvidiaEnabled,
      model: nvidiaModelOverride ?? NVIDIA_INTENT_ALLOWED_MODELS[0],
      ...(nvidiaApiKey ? { apiKey: nvidiaApiKey } : {}),
    }) } : {}),
  });
}
