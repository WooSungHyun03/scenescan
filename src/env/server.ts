import "server-only";

import { parseServerEnvironment } from "./server-schema";

// This module is protected by server-only and must never be imported from a
// Client Component. Parsing at import time fails fast during build/start.
export const serverEnv = parseServerEnvironment(process.env);
