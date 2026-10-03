type TransformersWasmEnvironment = {
  useWasmCache: boolean;
};

/**
 * ONNX's optional WASM-factory cache imports a generated blob module. Some
 * browsers reject that import even when the worker policy allows blob URLs.
 * Direct CDN loading still uses the browser HTTP cache and avoids widening
 * script-src to arbitrary blob modules. Model caching remains enabled.
 */
export function configureTransformersEnvironment(
  environment: TransformersWasmEnvironment,
): void {
  environment.useWasmCache = false;
}
