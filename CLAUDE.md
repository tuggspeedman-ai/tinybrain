# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

- **Phase 1**: Chat UI with Nanochat - Complete
- **Phase 2**: x402 Merchant (accept $0.01 payments) - Complete
- **Phase 3**: x402 Agent (pay Hyperbolic for escalation) - Not started

## Project Overview

**NanoBrain** is an AI inference service demonstrating the x402 protocol from both merchant and agent perspectives:
- **Merchant**: Accepts $0.01 USDC payments from users for queries
- **Agent**: Pays Hyperbolic for DeepSeek R1 when Nanochat is uncertain

The project uses a locally-trained 561M parameter model (Nanochat) that escalates complex queries to more powerful models via x402 payments.

## Commands

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production with Turbopack
- `npm run lint` - Run ESLint

### Related: Nanochat Inference Server
The Nanochat model runs separately in `/Users/jonathanavni/Documents/Coding/nanochat`:
```bash
cd /Users/jonathanavni/Documents/Coding/nanochat/nanochat
source .venv/bin/activate
python -m scripts.chat_web --source sft --step 700  # Starts on localhost:8000
```

**Important**: Use `--step 700` to load the correct SFT checkpoint. The default (step 21400) is overtrained.

**Model info** (d20 architecture, 561M params):
- Checkpoint: `~/.cache/nanochat/chatsft_checkpoints/d20/model_000700.pt`
- MMLU accuracy: 36%, ARC-Easy: 47%
- Has SFT personality (knows it's nanochat) but limited factual knowledge

## Architecture

### System Components
```
Next.js App (this repo)
├── Frontend: Chat UI, wallet connection, treasury dashboard
├── API Routes: /api/chat (x402 protected), /api/treasury
│
├── Nanochat Service (external): localhost:8000 or Railway
├── Hyperbolic x402 API: DeepSeek R1 for escalation
└── Coinbase Facilitator: Payment verification/settlement
```

### Tech Stack
- **Framework**: Next.js 15 with Turbopack, React 19
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **UI Components**: shadcn/ui (new-york style) with Lucide icons
- **Animations**: Framer Motion, tw-animate-css
- **Payments**: x402-next (accept payments), x402-fetch (client-side 402 handling)
- **Wallet**: wagmi + viem (Base Sepolia testnet)

### Path Aliases
- `@/*` maps to the project root (configured in tsconfig.json)
- Components: `@/components` and `@/components/ui`
- Utilities: `@/lib/utils` (includes `cn()` for class merging)
- Hooks: `@/hooks`

### Key Files
- `app/api/chat/route.ts` - x402-protected chat endpoint (withX402 wrapper, $0.01/query)
- `lib/nanochat-client.ts` - TypeScript client for Nanochat API with SSE streaming
- `lib/wagmi-config.ts` - Wallet configuration for Base Sepolia
- `app/providers.tsx` - WagmiProvider + QueryClientProvider wrapper
- `components/wallet-connect.tsx` - Wallet connect/disconnect button
- `components/chat/chat-interface.tsx` - Chat UI with wrapFetchWithPayment integration

## Styling Conventions
- Uses OKLCH color space for CSS variables
- Theme colors defined in `app/globals.css` with light/dark mode support
- Dark mode uses `.dark` class variant
- Use `cn()` from `@/lib/utils` to merge Tailwind classes

## Environment Variables
```bash
NANOCHAT_URL=http://localhost:8000           # Nanochat inference server
TREASURY_ADDRESS=0xcAF6f4AF9C1DF98530E74A3eCbb88dF077CBBC87  # Receives payments
```

### Future (Phase 3+)
```bash
TREASURY_PRIVATE_KEY=0x...                   # For paying Hyperbolic (agent mode)
HYPERBOLIC_X402_URL=https://...              # Hyperbolic x402 endpoint
```

## Project Documentation
- `project-docs/nanobrain-project-plan.md` - Original project concept and requirements
- `project-docs/claude-project-plan.md` - Implementation plan with progress tracking
- `project-docs/nanochat_project_overview.md` - Nanochat training details
