import { LLMClient } from '@blockrun/llm';
import type { ChatMessage, ChatStreamChunk } from './tinychat-client';

const BLOCKRUN_MODEL = 'deepseek/deepseek-reasoner';

// System message to keep final answers concise (reasoning/thinking is separate)
const SYSTEM_MESSAGE: ChatMessage = {
  role: 'system',
  content: 'You are a helpful AI assistant. Keep your final answer concise and under 2000 characters.',
};

// Initialize BlockRun client with treasury wallet private key
// The SDK handles x402 payment signing automatically using this key
const client = new LLMClient({
  privateKey: process.env.TREASURY_PRIVATE_KEY as `0x${string}`,
});

/**
 * Call BlockRun API and return the parsed response.
 * Separated from the generator so logging happens at the caller's level
 * (Vercel swallows console.log inside ReadableStream callbacks).
 */
export async function callBlockRun(messages: ChatMessage[]) {
  const messagesWithSystem = [SYSTEM_MESSAGE, ...messages];

  console.log(`[BlockRun] Starting request with model ${BLOCKRUN_MODEL}`);

  const result = await client.chatCompletion(BLOCKRUN_MODEL, messagesWithSystem, {
    maxTokens: 1024,
    temperature: 0.8,
  });

  const choice = result.choices?.[0];
  const message = choice?.message;
  const content = message?.content || '';

  // DeepSeek R1 returns reasoning in a separate field (not typed by BlockRun SDK)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messageAny = message as any;
  const reasoningContent = messageAny?.reasoning_content as string | undefined;

  // Log full diagnostic info at top level so Vercel captures it
  const allKeys = message ? Object.keys(message) : [];
  console.log(`[BlockRun] Response keys: ${allKeys.join(', ') || 'none'} | content: ${content.length} chars | reasoning_content: ${reasoningContent?.length ?? 0} chars | has <think>: ${content.includes('<think>')} | usage: ${JSON.stringify(result.usage)}`);

  return { content, reasoningContent, allKeys };
}

export async function* streamBlockRun(
  messages: ChatMessage[]
): AsyncGenerator<ChatStreamChunk> {
  const { content, reasoningContent } = await callBlockRun(messages);

  // Wrap reasoning in <think> tags so the frontend parser can display it
  if (reasoningContent) {
    yield { content: `<think>${reasoningContent}</think>`, done: false };
    if (content) {
      yield { content, done: false };
    }
  } else if (content) {
    // Content may already contain <think> tags if the provider embeds reasoning inline
    yield { content, done: false };
  }

  yield { content: '', done: true };
}
