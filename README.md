# TinyBrain

An AI that earns and spends autonomously. TinyBrain charges users $0.01 per query via the [x402](https://www.x402.org/) payment protocol, and when a query is too complex for its own model, it pays ~$0.001 for smarter help from DeepSeek R1 — pocketing the difference.

**Live demo:** [tinybrain.vercel.app](https://tinybrain.vercel.app)

## How it works

TinyBrain is powered by [TinyChat](https://github.com/tuggspeedman-ai/tinychat), a 561M-parameter language model trained from scratch for ~$95. TinyChat handles simple conversational queries well (greetings, identity, casual chat) but will confidently hallucinate on anything requiring real knowledge.

TinyBrain solves this with **rule-based complexity classification** — detecting math, code, factual, and reasoning queries before they reach TinyChat, and routing them to DeepSeek R1 instead:

```
User sends message ($0.01 via x402)
  │
  ├─ Keyword override? ("think hard", "complex", etc.)
  │   └─ Yes → DeepSeek R1 via BlockRun (~$0.001)
  │
  ├─ Complex query? (math, code, factual, reasoning, translation, >200 chars)
  │   └─ Yes → DeepSeek R1 via BlockRun (~$0.001)
  │
  ├─ Self-referential? ("who made you", "how many parameters")
  │   └─ Yes → TinyChat (knows this from SFT training)
  │
  └─ Simple query → TinyChat (free for server)

Server profit: $0.01 (TinyChat) or ~$0.009 (DeepSeek R1)
```

## Payment modes

Users connect a wallet on Base and choose how to pay:

| Mode | How it works | Wallet signatures |
|------|-------------|-------------------|
| **Pay per message** | x402 payment signed on every query | Every message |
| **Bar Tab** | Sign a deposit once, chat freely, settle exact usage at end | Twice (open + close) |

Bar Tab uses stateless HMAC-signed session tokens (no server-side state) with localStorage persistence, so users can refresh the page or reconnect their wallet without losing their session.

## Architecture

```
Next.js App (Vercel)
├── Frontend
│   ├── Chat UI with streaming responses
│   ├── Wallet connection (wagmi + viem, Base mainnet)
│   ├── Payment mode selector (per-request vs bar tab)
│   ├── Session bar (live cost tracking, progress)
│   └── Settlement receipt (per-model breakdown, BaseScan link)
│
├── API Routes
│   ├── /api/chat ─── x402 payment OR session token → complexity router → response
│   ├── /api/session/open ─── deposit auth → HMAC session token
│   └── /api/session/close ─── settlement auth → on-chain tx
│
├── Routing
│   ├── Keyword override (manual escalation)
│   ├── Complexity classifier (math, code, factual, reasoning, translation)
│   └── Self-referential bypass (identity questions stay on TinyChat)
│
├── TinyChat ─── Modal serverless GPU (T4), SSE streaming
└── BlockRun.ai ─── DeepSeek R1 via x402 (~$0.001/query)
```

## x402: merchant + agent

TinyBrain demonstrates both sides of the [x402 protocol](https://www.x402.org/):

**As a merchant** — accepts $0.01 USDC payments from users. The chat endpoint returns HTTP 402 with payment requirements; the client wallet signs an EIP-3009 authorization and retries. Settlement is fire-and-forget (non-blocking) to preserve SSE streaming.

**As an agent** — pays BlockRun.ai ~$0.001 per query for DeepSeek R1 inference. The server's treasury wallet signs x402 payments automatically when routing complex queries.

The result: an AI service that earns revenue, manages its own expenses, and is profitable on every query.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15, React 19, Turbopack |
| Styling | Tailwind CSS v4, shadcn/ui, Framer Motion |
| Payments | @x402/fetch, @x402/evm, @coinbase/x402 (Base mainnet) |
| Wallet | wagmi + viem |
| Inference | TinyChat (Modal T4 GPU), BlockRun.ai (DeepSeek R1) |
| Rendering | react-markdown, remark-math, rehype-katex, react-syntax-highlighter |

## Running locally

```bash
git clone https://github.com/tuggspeedman-ai/tinybrain.git
cd tinybrain
npm install
```

Create `.env.local`:

```bash
TINYCHAT_URL=https://tuggspeedman-ai--tinychat-chat-completions.modal.run
TINYCHAT_API_KEY=...
TREASURY_ADDRESS=0x...
TREASURY_PRIVATE_KEY=0x...
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...
```

```bash
npm run dev
```

## Related

- [TinyChat](https://github.com/tuggspeedman-ai/tinychat) — the 561M-parameter model that powers TinyBrain, trained from scratch for ~$95
- [x402 Protocol](https://www.x402.org/) — HTTP-native payments for AI agents
- [BlockRun.ai](https://blockrun.ai/) — x402-enabled AI inference marketplace

## License

MIT
