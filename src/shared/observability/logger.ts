type LogFields = Record<string, unknown>;

function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { value: String(error) };
  const serialized: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  };
  if (error.cause !== undefined) {
    serialized.cause = error.cause instanceof Error ? error.cause.message : String(error.cause);
  }
  if (process.env.NODE_ENV !== "production" && error.stack) serialized.stack = error.stack;
  return serialized;
}

function write(level: "info" | "warn" | "error", message: string, fields: LogFields = {}): void {
  const entry = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...fields,
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

export const logger = {
  info(message: string, fields?: LogFields): void {
    write("info", message, fields);
  },
  warn(message: string, fields?: LogFields): void {
    write("warn", message, fields);
  },
  error(message: string, error: unknown, fields?: LogFields): void {
    write("error", message, { ...fields, error: serializeError(error) });
  },
};
