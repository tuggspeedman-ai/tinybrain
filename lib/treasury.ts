import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY as `0x${string}`;

if (!TREASURY_PRIVATE_KEY) {
  throw new Error('TREASURY_PRIVATE_KEY environment variable is required');
}

const account = privateKeyToAccount(TREASURY_PRIVATE_KEY);

export const treasuryWallet = createWalletClient({
  account,
  chain: base,
  transport: http(),
});

export const treasuryAddress = account.address;
