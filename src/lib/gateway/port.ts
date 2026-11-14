import type { GuardrailsSnapshot, GuardrailsWrite } from './schemas';

export interface CallOptions {
  signal?: AbortSignal;
}

/** Operator guardrails on the gateway. Only administrators may call this; the adapter is chosen by configuration. */
export interface GatewayApi {
  getGuardrails(options?: CallOptions): Promise<GuardrailsSnapshot>;
  /** Validate and write the override file. The gateway refuses anything that would loosen a code lock or a deployment limit. */
  putGuardrails(body: GuardrailsWrite, options?: CallOptions): Promise<GuardrailsSnapshot>;
}
