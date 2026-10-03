import { z } from "zod";

import {
  type EnvironmentInput,
  formatEnvironmentError,
  optionalEnvironmentHttpUrl,
  optionalEnvironmentString,
} from "./public-schema";

const serverEnvironmentSchema = z.object({
  SUPABASE_URL: optionalEnvironmentHttpUrl,
  SUPABASE_SECRET_KEY: optionalEnvironmentString,
  SUPABASE_SERVICE_ROLE_KEY: optionalEnvironmentString,
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
};

const forbiddenPublicSecretName = /^NEXT_PUBLIC_(?=.*SUPABASE)(?=.*(?:SECRET|SERVICE_ROLE))/i;

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

export function parseServerEnvironment(
  environment: EnvironmentInput,
): ServerEnvironment {
  assertNoPublicSupabaseSecrets(environment);
  const result = serverEnvironmentSchema.safeParse(environment);
  if (!result.success) throw formatEnvironmentError("server", result.error);

  const secretKey = result.data.SUPABASE_SECRET_KEY
    || result.data.SUPABASE_SERVICE_ROLE_KEY;
  if (!result.data.SUPABASE_URL || !secretKey) return Object.freeze({});

  return Object.freeze({
    supabaseAdmin: Object.freeze({
      url: result.data.SUPABASE_URL,
      secretKey,
    }),
  });
}
