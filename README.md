# TinyBrain

An AI inference service that demonstrates the [x402 protocol](https://www.x402.org/) from both merchant and agent perspectives — accepting crypto payments for queries, and autonomously paying for escalation to more powerful models.

**Try it live: [tinybrain-alpha.vercel.app](https://tinybrain-alpha.vercel.app)** (requires a wallet with USDC on Base)

---

## What is this?

TinyBrain is a Next.js application that wraps [TinyChat](https://github.com/tuggspeedman-ai/tinychat) — a 561M-parameter language model trained from scratch — and adds a payment layer using the x402 protocol.

- **As a merchant**: Accepts $0.01 USDC per query from users via x402
- **As an agent**: When users trigger escalation keywords, TinyBrain autonomously pays ~$0.10 to Hyperbolic's x402 API to route the query to DeepSeek R1

This creates a two-sided x402 demonstration: the app both *receives* and *makes* crypto payments for AI inference.

## Architecture

```
User (wallet on Base mainnet)
  |
  | $0.01 USDC via x402
  v
TinyBrain (Next.js on Vercel)
  |
  |-- Simple queries --> TinyChat (561M params, Modal T4 GPU) [free for server]
  |
  |-- "think hard" --> Hyperbolic x402 API (~$0.10 from treasury)
                       DeepSeek R1
```

### Request Flow

1. User sends a message through the chat UI
2. `x402-fetch` detects the 402 response and prompts the user to sign a $0.01 USDC payment
3. Coinbase CDP facilitator verifies and settles the payment on Base mainnet
4. Server routes based on keywords:
   - Simple queries go to TinyChat (free for the server)
   - Escalation keywords ("think hard", "reason carefully", etc.) trigger a paid call to Hyperbolic's DeepSeek R1
5. Response streams back via SSE with model attribution badges

## Tech Stack

- **Framework**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS 4, shadcn/ui, Framer Motion
- **Payments**: x402-fetch (client), @coinbase/x402 (facilitator)
- **Wallet**: wagmi + viem (Base mainnet)
- **Inference**: TinyChat on Modal (T4 GPU, serverless), Hyperbolic x402 (DeepSeek R1)

## Environment Variables

```bash
TINYCHAT_URL=https://...modal.run        # TinyChat inference endpoint
TINYCHAT_API_KEY=...                      # API key for Modal auth
TREASURY_ADDRESS=0x...                    # Receives user payments
TREASURY_PRIVATE_KEY=0x...                # For paying escalation providers
CDP_API_KEY_ID=...                        # Coinbase Developer Platform
CDP_API_KEY_SECRET=...                    # Coinbase Developer Platform
```

## Development

```bash
npm install
npm run dev    # Start dev server on localhost:3000
npm run build  # Production build
npm run lint   # ESLint
```

## Related

- [TinyChat](https://github.com/tuggspeedman-ai/tinychat) — The 561M-parameter model powering TinyBrain, trained from scratch for ~$95
- [x402 Protocol](https://www.x402.org/) — HTTP 402-based payment protocol for machine-to-machine payments
- [nanochat](https://github.com/karpathy/nanochat) — Andrej Karpathy's training codebase that TinyChat is built on

## License

MIT
