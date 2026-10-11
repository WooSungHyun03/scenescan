import "server-only";

import { serverEnv } from "@/env/server";
import type { PlaceDiscoveryAdapter } from "@/types/place-discovery";
import { KakaoLocalClient } from "./local-client";

let sharedClient: KakaoLocalClient | undefined;

/** The REST key is optional so mock/key-free builds never contact Kakao. */
export function getKakaoLocalAdapter(): PlaceDiscoveryAdapter | null {
  if (!serverEnv.kakaoLocalRestApiKey) return null;
  sharedClient ??= new KakaoLocalClient({
    restApiKey: serverEnv.kakaoLocalRestApiKey,
  });
  return sharedClient;
}
