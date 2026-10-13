import type { Page, Route } from '@playwright/test';

export const DEVNET = 'https://api.devnet.solana.com';
export const MAINNET = 'https://solana-rpc.publicnode.com';
export const CONFIG = 'FBLDbjc7tG7YZJMMvnNFnK2Q1iquNPjJ4mHiv47Ufqsk';
export const MINT = 'J9nHG1LgzTiHLZPqxtZcJ9eJapTSWhUGzkVj8Up84nXT';
export const VAULT = 'BVibkWi4cpBnyxLj5kb421VUND1BcgnmBTvZdV7ksQQ';
export const PD = 'FhoBCPQZeFvQaYXjgo4maVNAYxCUXzeCrDxS8gZr4x1c';
const AL = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export const b58e = (b: Uint8Array): string => {
  let n = 0n;
  for (const x of b) n = n * 256n + BigInt(x);
  let s = '';
  while (n > 0n) { s = AL[Number(n % 58n)] + s; n /= 58n; }
  let z = 0;
  while (z < b.length && b[z] === 0) z++;
  return '1'.repeat(z) + s;
};

const b58d = (s: string): Uint8Array => {
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(AL.indexOf(c));
  const out: number[] = [];
  while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; }
  let z = 0;
  while (z < s.length && s[z] === '1') z++;
  return Uint8Array.from([...Array(z).fill(0), ...out]);
};

export const u64le = (n: bigint): Uint8Array => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
};

export const tokenAccount = (amount: bigint): Uint8Array => {
  const d = new Uint8Array(165);
  d.set(u64le(amount), 64);
  return d;
};

export const mintAccount = (supply: bigint, decimals = 6): Uint8Array => {
  const d = new Uint8Array(82);
  d.set(u64le(supply), 36);
  d[44] = decimals;
  return d;
};

export const configAccount = (rate: bigint): Uint8Array => {
  const d = new Uint8Array(48);
  d.set(u64le(rate), 40);
  return d;
};

// Layout wie die Seite es liest: Byte 12 = 1, Bytes 13..45 = Owner-Pubkey.
export const pdAccount = (owner: string): Uint8Array => {
  const d = new Uint8Array(96);
  d.set(b58d(owner), 13);
  d[12] = 1;
  return d;
};

// Vorab berechnet für die beiden Test-Wallet-Adressen aus tests/scoop.spec.ts.
// Seeds wie in index.html: [Owner, Token-Programm, Mint] über das ATA-Programm; netzunabhängig (SCOOP, Token-2022).
export const ATA_SCOOP: Record<string, string> = {
  '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T': '44GgRrjNmjVLKm8ee4dJyiM2hYfomv7GBVVsfQUj95HT',
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1': 'EeoUMRHn1dqW4arHx1SJdkWNCX9yvca2WjyExQLuVZKA'
};

export const mockRpc = async (
  page: Page,
  accounts: Record<string, Uint8Array>,
  calls: string[] = []
): Promise<void> => {
  const handler = async (route: Route): Promise<void> => {
    const request = route.request();
    const url = request.url();
    // Die Seite selbst lädt per file://; unangetastet laden lassen.
    if (url.startsWith('file://')) return route.fallback();
    // Vor jeder Behandlung erfassen: so sieht der api-key-Guard jede URL.
    calls.push(`${request.method()} ${url}`);
    // Allowlist: nur die beiden gerouteten RPC-Origins. Alles andere wäre Live-Netz → hart fehlschlagen.
    if (![DEVNET, MAINNET].includes(new URL(url).origin)) return route.abort();
    if (request.method() === 'OPTIONS') {
      // Preflight deterministisch beantworten; niemals ins Live-Netz.
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'content-type',
          'access-control-allow-methods': 'POST'
        }
      });
    }
    const { method, params, id } = JSON.parse(request.postData()!);
    const respond = (result: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ jsonrpc: '2.0', id: id ?? 1, result })
      });
    if (method === 'getBalance') return respond({ value: 1000000 }); // 0,001 SOL → SOL-Hinweis
    if (method === 'getAccountInfo') {
      const data = accounts[(params as string[])[0]];
      return respond({
        value: data
          ? { data: [Buffer.from(data).toString('base64'), 'base64'], executable: false, lamports: 1, owner: '11111111111111111111111111111111' }
          : null
      });
    }
    return respond({ value: null });
  };
  await page.route('**/*', handler);
};
