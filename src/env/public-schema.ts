import { z } from "zod";

export type EnvironmentInput = Readonly<Record<string, string | undefined>>;

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

export const optionalEnvironmentString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const httpUrl = z.string().url().superRefine((value, context) => {
  const url = new URL(value);
  if (url.protocol === "https:") return;
  if (url.protocol === "http:" && localHosts.has(url.hostname)) return;

  context.addIssue({
    code: "custom",
    message: "must use HTTPS unless the host is localhost",
  });
});

export const optionalEnvironmentHttpUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  httpUrl.optional(),
);

const booleanString = z.preprocess(
  (value) => value === undefined || value === "" ? "true" : value,
  z.enum(["true", "false"]),
).transform((value) => value === "true");

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalEnvironmentHttpUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalEnvironmentString,
  NEXT_PUBLIC_KAKAO_MAP_KEY: optionalEnvironmentString,
  NEXT_PUBLIC_USE_MOCK_DATA: booleanString,
  NEXT_PUBLIC_USE_MOCK_AI: booleanString,
  NEXT_PUBLIC_CLIP_DEVICE: z.preprocess(
    (value) => value === undefined || value === "" ? "wasm" : value,
    z.enum(["wasm", "webgpu"]),
  ),
}).superRefine((environment, context) => {
  if (environment.NEXT_PUBLIC_USE_MOCK_DATA) return;

  if (!environment.NEXT_PUBLIC_SUPABASE_URL) {
    context.addIssue({
      code: "custom",
      path: ["NEXT_PUBLIC_SUPABASE_URL"],
      message: "is required when NEXT_PUBLIC_USE_MOCK_DATA=false",
    });
  }
  if (!environment.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    context.addIssue({
      code: "custom",
      path: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
      message: "is required when NEXT_PUBLIC_USE_MOCK_DATA=false",
    });
  }
});

export type PublicEnvironment = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  kakaoMapKey?: string;
  useMockData: boolean;
  useMockAi: boolean;
  clipDevice: "wasm" | "webgpu";
};

export function formatEnvironmentError(
  scope: "public" | "server",
  error: z.ZodError,
): Error {
  const detail = error.issues
    .map((issue) => `${issue.path.join(".") || scope}: ${issue.message}`)
    .join("; ");
  return new Error(`Invalid ${scope} environment: ${detail}`);
}

export function parsePublicEnvironment(
  environment: EnvironmentInput,
): PublicEnvironment {
  const result = publicEnvironmentSchema.safeParse(environment);
  if (!result.success) throw formatEnvironmentError("public", result.error);

  return Object.freeze({
    supabaseUrl: result.data.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: result.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    kakaoMapKey: result.data.NEXT_PUBLIC_KAKAO_MAP_KEY,
    useMockData: result.data.NEXT_PUBLIC_USE_MOCK_DATA,
    useMockAi: result.data.NEXT_PUBLIC_USE_MOCK_AI,
    clipDevice: result.data.NEXT_PUBLIC_CLIP_DEVICE,
  });
}
