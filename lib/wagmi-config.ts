import { http, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { injected, coinbaseWallet } from "wagmi/connectors";

// Using Base mainnet with PayAI facilitator (supports Base mainnet without API keys)
export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    injected(),
    coinbaseWallet({ appName: "NanoBrain" }),
  ],
  transports: {
    [base.id]: http(),
  },
});
