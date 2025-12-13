import { wrapFetchWithPayment } from 'x402-fetch';
import { treasuryWallet } from './treasury';
import type { ChatMessage, ChatStreamChunk } from './nanochat-client';

const DAYDREAMS_URL = 'https://router.daydreams.systems/v1/chat/completions';

// Default model - Claude 3.5 Sonnet via Daydreams
const DEFAULT_MODEL = 'anthropic/claude-3-5-sonnet-20241022';

// System message for concise responses
const SYSTEM_MESSAGE: ChatMessage = {
  role: 'system',
  content: 'You are a helpful AI assistant. Keep your responses concise and focused.',
};

// maxValue: $0.15 in micro-USDC (covers ~$0.10 Daydreams charges)
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const fetchWithPayment = wrapFetchWithPayment(fetch, treasuryWallet as any, BigInt(150000));

export async function* streamDaydreams(
  messages: ChatMessage[],
  model: string = DEFAULT_MODEL
): AsyncGenerator<ChatStreamChunk> {
  const messagesWithSystem = [SYSTEM_MESSAGE, ...messages];

  console.log(`[Daydreams] Starting request with model: ${model}`);

  const response = await fetchWithPayment(DAYDREAMS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: messagesWithSystem,
      stream: true,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Daydreams] Error ${response.status}: ${errorText}`);
    throw new Error(`Daydreams error: ${response.status} - ${errorText}`);
  }

  console.log(`[Daydreams] Got response, starting stream...`);

  // Parse SSE stream (OpenAI format)
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;

      const data = trimmed.slice(6);
      if (data === '[DONE]') {
        yield { content: '', done: true };
        return;
      }

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content || '';
        if (content) {
          yield { content, done: false };
        }
      } catch {
        // Skip non-JSON lines
      }
    }
  }

  yield { content: '', done: true };
}
