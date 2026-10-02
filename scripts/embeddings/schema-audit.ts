export type SchemaAuditResult = { checks: string[] };

const REQUIRED_CHECKS: Array<[string, RegExp]> = [
  ["pgvector extension in extensions schema", /create\s+extension\s+if\s+not\s+exists\s+vector\s+with\s+schema\s+extensions/i],
  ["location image vector(512)", /^\s*embedding\s+extensions\.vector\s*\(\s*512\s*\)\s*,?\s*$/im],
  ["location image primary key", /create\s+table\s+public\.location_images[\s\S]*?id\s+uuid\s+primary\s+key/i],
  ["location foreign key cascade", /location_id\s+uuid\s+not\s+null\s+references\s+public\.locations\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i],
  ["location image lookup index", /create\s+index\s+location_images_location_id_idx\s+on\s+public\.location_images\s*\(\s*location_id\s*\)/i],
  ["location image HNSW cosine index", /create\s+index\s+if\s+not\s+exists\s+location_images_embedding_hnsw_idx[\s\S]*?using\s+hnsw\s*\(\s*embedding\s+extensions\.vector_cosine_ops\s*\)/i],
  ["location image RLS", /alter\s+table\s+public\.location_images\s+enable\s+row\s+level\s+security/i],
  ["read-only public image policy", /create\s+policy[\s\S]*?on\s+public\.location_images\s+for\s+select\s+to\s+anon\s*,\s*authenticated\s+using\s*\(\s*true\s*\)/i],
  ["512-D RPC query", /match_location_images\s*\([\s\S]*?query_embedding\s+extensions\.vector\s*\(\s*512\s*\)/i],
  ["cosine distance operator", /embedding\s*<=>\s*query_embedding/i],
  ["bounded match threshold", /greatest\s*\(\s*0\s*,\s*least\s*\(\s*match_threshold\s*,\s*1\s*\)\s*\)/i],
  ["bounded match count", /limit\s+least\s*\(\s*greatest\s*\(\s*match_count\s*,\s*1\s*\)\s*,\s*200\s*\)/i],
  ["invoker-rights RPC", /language\s+sql\s+stable\s+security\s+invoker/i],
];

const SIMILAR_LOCATION_CHECKS: Array<[string, RegExp]> = [
  ["similar-location RPC", /match_similar_location_images\s*\([\s\S]*?source_location_id\s+uuid/i],
  ["representative mean embedding", /avg\s*\(\s*li\.embedding\s*\)\s*::\s*extensions\.vector\s*\(\s*512\s*\)/i],
  ["selected location exclusion", /li\.location_id\s*<>\s*source_location_id/i],
  ["deterministic similar-location order", /order\s+by\s+li\.embedding\s*<=>\s*source\.embedding\s*,\s*li\.location_id\s*,\s*li\.id/i],
  ["bounded similar match threshold", /greatest\s*\(\s*0\s*,\s*least\s*\(\s*match_threshold\s*,\s*1\s*\)\s*\)/i],
  ["bounded similar match count", /limit\s+least\s*\(\s*greatest\s*\(\s*match_count\s*,\s*1\s*\)\s*,\s*200\s*\)/i],
  ["similar RPC invoker rights", /match_similar_location_images[\s\S]*?language\s+sql\s+stable\s+security\s+invoker/i],
  ["similar RPC public execute grant", /grant\s+execute\s+on\s+function\s+public\.match_similar_location_images[\s\S]*?to\s+anon\s*,\s*authenticated/i],
];

const ATTRIBUTION_CHECKS: Array<[string, RegExp]> = [
  ["location source metadata columns", /alter\s+table\s+public\.locations[\s\S]*?add\s+column\s+if\s+not\s+exists\s+source\s+text[\s\S]*?last_verified_at\s+timestamptz/i],
  ["image attribution columns", /alter\s+table\s+public\.location_images[\s\S]*?source_url\s+text[\s\S]*?author\s+text[\s\S]*?license_url\s+text[\s\S]*?last_verified_at\s+timestamptz/i],
  ["location source URL constraint", /locations_source_url_http_check[\s\S]*?source_url\s+~\*\s+'\^https\?:\/\/'/i],
  ["image source URL constraint", /location_images_source_url_http_check[\s\S]*?source_url\s+~\*\s+'\^https\?:\/\/'/i],
  ["image license URL constraint", /location_images_license_url_http_check[\s\S]*?license_url\s+~\*\s+'\^https\?:\/\/'/i],
];

export function auditEmbeddingSchema(sql: string): SchemaAuditResult {
  const missing = REQUIRED_CHECKS.filter(([, pattern]) => !pattern.test(sql)).map(([name]) => name);
  if (missing.length > 0) throw new Error(`Embedding schema audit failed: ${missing.join(", ")}`);
  return { checks: REQUIRED_CHECKS.map(([name]) => name) };
}

export function auditSimilarLocationSchema(sql: string): SchemaAuditResult {
  const missing = SIMILAR_LOCATION_CHECKS.filter(([, pattern]) => !pattern.test(sql)).map(([name]) => name);
  if (missing.length > 0) throw new Error(`Similar-location schema audit failed: ${missing.join(", ")}`);
  return { checks: SIMILAR_LOCATION_CHECKS.map(([name]) => name) };
}

export function auditAttributionSchema(sql: string): SchemaAuditResult {
  const missing = ATTRIBUTION_CHECKS.filter(([, pattern]) => !pattern.test(sql)).map(([name]) => name);
  if (missing.length > 0) throw new Error(`Attribution schema audit failed: ${missing.join(", ")}`);
  const imageConstraintAdd = sql.search(/add\s+constraint\s+location_images_source_url_http_check/i);
  const imageConstraintValidate = sql.search(/validate\s+constraint\s+location_images_source_url_http_check/i);
  if (imageConstraintAdd < 0 || imageConstraintValidate < 0 || imageConstraintAdd > imageConstraintValidate) {
    throw new Error("Attribution schema audit failed: image URL constraints must be added before validation");
  }
  return { checks: ATTRIBUTION_CHECKS.map(([name]) => name) };
}
