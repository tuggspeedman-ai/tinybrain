import { wrapFetchWithPayment } from 'x402-fetch';
import { treasuryWallet } from './treasury';
import type { ChatMessage, ChatStreamChunk } from './nanochat-client';

const HYPERBOLIC_URL = 'https://hyperbolic-x402.vercel.app/v1/chat/completions';

// System message to keep responses concise (DeepSeek R1 context is limited)
const SYSTEM_MESSAGE: ChatMessage = {
  role: 'system',
  content: 'You are a helpful AI assistant. Keep your responses concise and under 2000 characters. Skip lengthy reasoning and get straight to the answer.',
};

// Create a fetch wrapper that automatically handles x402 payments
// The treasury wallet will sign payments to Hyperbolic
// maxValue is in micro-USDC (6 decimals): 0.15 * 10^6 = 150,000 = $0.15 (Hyperbolic charges $0.10)
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const fetchWithPayment = wrapFetchWithPayment(fetch, treasuryWallet as any, BigInt(150000));

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

async function makeHyperbolicRequest(messagesWithSystem: ChatMessage[]): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const requestId = crypto.randomUUID();
    console.log(`[Hyperbolic] Starting request ${requestId} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);

    // NOTE: stream: false because Hyperbolic's streaming endpoint returns 500 errors
    const response = await fetchWithPayment(HYPERBOLIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
      body: JSON.stringify({
        model: 'deepseek-ai/DeepSeek-R1',
        messages: messagesWithSystem,
        stream: false,
        max_tokens: 1024,
      }),
    });

    if (response.ok) {
      return response;
    }

    const errorText = await response.text();
    console.error(`[Hyperbolic] Error ${response.status}: ${errorText}`);
    lastError = new Error(`Hyperbolic error: ${response.status} - ${errorText}`);

    // Only retry on 500 errors (server issues), not 4xx (client errors)
    if (response.status < 500 || attempt === MAX_RETRIES) {
      throw lastError;
    }

    console.log(`[Hyperbolic] Retrying in ${RETRY_DELAY_MS}ms...`);
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
  }

  throw lastError || new Error('Hyperbolic request failed');
}

export async function* streamHyperbolic(
  messages: ChatMessage[]
): AsyncGenerator<ChatStreamChunk> {
  // Prepend system message for concise responses
  const messagesWithSystem = [SYSTEM_MESSAGE, ...messages];

  const response = await makeHyperbolicRequest(messagesWithSystem);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Hyperbolic] Error ${response.status}: ${errorText}`);
    throw new Error(`Hyperbolic error: ${response.status} - ${errorText}`);
  }

  console.log(`[Hyperbolic] Got response, parsing...`);

  // Parse non-streaming response and simulate streaming for consistency
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  if (content) {
    // Yield the full response at once (simulating streaming)
    yield { content, done: false };
  }

  yield { content: '', done: true };
}
