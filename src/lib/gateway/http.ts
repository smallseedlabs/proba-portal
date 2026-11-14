import { HttpTransport, type TokenSource } from '../api/transport';
import type { ApiError } from '../api/errors';
import type { CallOptions, GatewayApi } from './port';
import { guardrailsSnapshotSchema, type GuardrailsWrite } from './schemas';

export interface HttpGatewayApiOptions {
  baseUrl: string;
  getToken: TokenSource;
  fetchImpl?: typeof fetch;
  onError?: (error: ApiError) => void;
}

/** Reads and writes /v1/admin/guardrails on proba-llm-gateway with the signed-in person's Firebase ID token. */
export class HttpGatewayApi implements GatewayApi {
  private readonly transport: HttpTransport;

  constructor(options: HttpGatewayApiOptions) {
    this.transport = new HttpTransport(options);
  }

  getGuardrails(options?: CallOptions) {
    return this.transport.get('/v1/admin/guardrails', guardrailsSnapshotSchema, undefined, options?.signal);
  }

  putGuardrails(body: GuardrailsWrite, options?: CallOptions) {
    return this.transport.put('/v1/admin/guardrails', guardrailsSnapshotSchema, body, options?.signal);
  }
}
