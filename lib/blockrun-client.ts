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

export async function* streamBlockRun(
  messages: ChatMessage[]
): AsyncGenerator<ChatStreamChunk> {
  const messagesWithSystem = [SYSTEM_MESSAGE, ...messages];

  console.log(`[BlockRun] Starting request with model ${BLOCKRUN_MODEL}`);

  const result = await client.chatCompletion(BLOCKRUN_MODEL, messagesWithSystem, {
    maxTokens: 1024,
    temperature: 0.8,
  });

  const message = result.choices?.[0]?.message;
  const content = message?.content || '';
  // DeepSeek R1 returns reasoning in a separate field (not typed by BlockRun SDK)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messageAny = message as any;
  const reasoningContent = messageAny?.reasoning_content as string | undefined;

  // Log all message keys to diagnose whether reasoning_content is available
  console.log(`[BlockRun] Message keys: ${message ? Object.keys(message).join(', ') : 'null'}`);
  console.log(`[BlockRun] Got response (${content.length} chars, reasoning: ${reasoningContent?.length ?? 0} chars), usage: ${JSON.stringify(result.usage)}`);

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
