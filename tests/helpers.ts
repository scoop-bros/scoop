import type { Page, Route } from '@playwright/test';

export const DEVNET = 'https://api.devnet.solana.com';
export const MAINNET = 'https://solana-rpc.publicnode.com';
export const CONFIG = 'D3wfDPvHtD5okZA36394LGgSpwimgoX32ybPNSxP5Hwp';
export const MINT = 'DztAhNDC6fd7XkbKzfUCcJYiuxBZ8QNKSiJwcSjngpGc';
export const VAULT = '5sgFrB7jH2ydjfT5dYySJwboZGGBRRWsPVymLWNvGX3T';
export const PD = '4xGDUL4GdXuo9W3ivjbL8vUKfGRBhH9agg1JhYYAVSv7';
export const PROG = '9eRAU5VraSzZoUg2DbknEhKFvEdpqdBUsZ2y62YxSzUt';
// Erwartete EURC-Zahlungsmints, identisch zur KONFIG in index.html.
export const EURC_DEVNET = 'BHDWiNzzgPkNj8gX9SZU7U6fywJhrSK99hBC9A3tbR9f'; // Test-EURC der Kasse
export const EURC_MAINNET = 'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr'; // Circle EURC
export const FIXED_RATE = 10000000n; // 1 EURC = 10 SCOOP
export const AL = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export { b58d };
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

// Layout wie die Seite es liest: Bytes 8..40 = Zahlungsmint (Base58-Pubkey), Byte 40..48 = rate (u64le).
export const configAccount = (rate: bigint, paymentMint: string): Uint8Array => {
  const d = new Uint8Array(48);
  d.set(b58d(paymentMint), 8);
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
  '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T': 'BGMPm5LdkUre9X4zhdRq7e2hLe4gTAhNL2DbBn2V6v1x',
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1': 'TJPofQ2tqtWEhjDD2FWyzgm31cbgwL8HiGTYwZ11ou8'
};

// EURC-ATA (klassisches SPL-Token) pro Wallet-Adresse und Test-Mint.
export const ATA_EURC: Record<string, Record<string, string>> = {
  '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T': {
    [EURC_DEVNET]: 'dBy9r8FbkzUGWjJ39ATgfhVw2cUWrM5WDZHsyWhB96p'
  },
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1': {
    [EURC_DEVNET]: 'ASswcFfSQZoXiAwqdGgZ2uxwGCAixeUUsLrXBDCQhfQ5'
  }
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
    if (method === 'getLatestBlockhash') return respond({ value: { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1 } });
    if (method === 'getSignatureStatuses') return respond({ value: [{ confirmationStatus: 'confirmed', err: null }] });
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
