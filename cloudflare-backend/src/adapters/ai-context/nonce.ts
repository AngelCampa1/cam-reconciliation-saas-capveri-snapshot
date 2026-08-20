import type { AppEnv } from "../../env";

export type AiContextNonceConsumer = {
  consume(input: { nonce: string; timestamp: string }): Promise<boolean>;
};

export class DurableObjectAiContextNonceConsumer implements AiContextNonceConsumer {
  constructor(private readonly env: AppEnv) {}

  async consume(input: { nonce: string; timestamp: string }): Promise<boolean> {
    const id = this.env.AI_CONTEXT_NONCES.idFromName(input.nonce);
    const stub = this.env.AI_CONTEXT_NONCES.get(id);
    const response = await stub.fetch(
      "https://ai-context-nonces.local/consume",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as { consumed?: boolean };

    return payload.consumed === true;
  }
}
