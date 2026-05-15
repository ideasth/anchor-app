// Stage 19 (2026-05-16) — LLM proxy model allow-list.
//
// Siblings can only request models that appear here for the configured
// provider. Anything else is rejected with 400 invalid_model. Keeps a
// misbehaving sibling from accidentally invoking a deprecated or premium-
// tier model.

export const PROXY_ALLOWED_MODELS: Record<string, readonly string[]> = {
  perplexity: ["sonar", "sonar-pro", "sonar-reasoning-pro"],
};

/**
 * The default model offered to siblings when their request body omits the
 * field. Matches Buoy's own Coach default so behaviour and pricing are
 * consistent across the stack.
 */
export const PROXY_DEFAULT_MODEL: Record<string, string> = {
  perplexity: "sonar-pro",
};

export function isAllowedModel(provider: string, model: string): boolean {
  const list = PROXY_ALLOWED_MODELS[provider];
  if (!list) return false;
  return list.includes(model);
}
