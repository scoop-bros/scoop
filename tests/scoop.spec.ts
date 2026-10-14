import { test, expect, Page } from '@playwright/test';
import { ATA_SCOOP, ATA_EURC, DEVNET, MAINNET, CONFIG, MINT, VAULT, PD, PROG, EURC_DEVNET, EURC_MAINNET, FIXED_RATE, b58d, configAccount, mintAccount, mockRpc, pdAccount, tokenAccount } from './helpers';

const url = `file://${__dirname}/../index.html`;
const U = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';
const A = '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1';
// Falsche Zahlungsmint mit 6 Dezimalen, wie sie nach einer USDC-Initialisierung in der Config liegen würde.
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// uU (EURC-ATA) fehlt in der Map → RPC liefert null → Seite rechnet 0n → EURC-Hinweis erscheint.
// Config: EURC-Mint des Netzwerks + fester Kurs 10 SCOOP/EURC.
const base = (me: string, mint = EURC_DEVNET) => ({
  [CONFIG]: configAccount(FIXED_RATE, mint),
  [MINT]: mintAccount(100000000n),   // 100 SCOOP Umlauf
  [VAULT]: tokenAccount(20000000n),  // 20 EURC Kasse
  [PD]: pdAccount(me),
  [ATA_SCOOP[me]]: tokenAccount(5000000n) // uS: 5,00 SCOOP = 2,0 Tassen
});

const injectWallet = async (page: Page, address: string): Promise<void> => {
  await page.addInitScript(({ addr }: { addr: string }) => {
    const accounts = [{
      address: addr,
      chains: ['solana:mainnet', 'solana:devnet'],
      features: ['solana:signAndSendTransaction', 'standard:connect']
    }];
    // Die Seite dispatcht beim Laden `wallet-standard:app-ready` mit ihrer register-API.
    const wallet = {
      version: '1.0.0',
      name: 'Fake Wallet',
      icon: 'data:image/svg+xml;base64,',
      chains: ['solana:mainnet', 'solana:devnet'],
      accounts,
      features: {
        'standard:connect': { version: '1.0.0', connect: async () => ({ accounts }) },
        'solana:signAndSendTransaction': {
          version: '1.0.0',
          signAndSendTransaction: async () => ({ signature: new Uint8Array(64) })
        },
        'standard:events': { version: '1.0.0', on: () => () => {} },
        'standard:disconnect': { version: '1.0.0', disconnect: async () => {} }
      }
    };
    addEventListener('wallet-standard:app-ready', (e: any) => {
      e.detail.register(wallet);
    });
  }, { addr: address });
};

test('Devnet ist Default: Banner sichtbar, keine Wallet: Fallback-Liste', async ({ page }) => {
  await mockRpc(page, {});
  await page.goto(url);
  await expect(page.locator('#net')).toBeVisible();
  await expect(page.locator('#connect')).toContainText('Keine Wallet gefunden');
  await expect(page.getByRole('button', { name: 'In Phantom öffnen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'In Solflare öffnen' })).toBeVisible();
});

test('Devnet, verbundene Wallet: Tassen, Kassen-Zeile, Konto-Hinweise', async ({ page }) => {
  await mockRpc(page, base(U));
  await injectWallet(page, U);
  await page.goto(url);
  await page.getByRole('button', { name: 'Mit Fake Wallet verbinden' }).click();
  await expect(page.locator('#bal')).toBeVisible();
  await expect(page.locator('#scoops')).toHaveText('5,00 SCOOP · 0,00 EURC');
  await expect(page.locator('#cups')).toHaveText('2,0');
  await expect(page.locator('#kasse')).toContainText('20,00 EURC');
  await expect(page.locator('#kasse')).toContainText('100,00 SCOOP');
  await expect(page.locator('#kasse')).toContainText('1 SCOOP = 0,10 EURC');
  await expect(page.locator('#bad')).toBeHidden();
  await expect(page.locator('#hints .hint')).toHaveCount(2);
  await expect(page.locator('#hints')).toContainText('Du brauchst etwas SOL für Gebühren');
  await expect(page.locator('#hints')).toContainText('Auf dieser Wallet liegt kein EURC.');
});

test('Nicht-Admin: Admin-Karte versteckt', async ({ page }) => {
  await mockRpc(page, { ...base(U), [PD]: pdAccount(A) }); // PD gehört A, verbunden ist U
  await injectWallet(page, U);
  await page.goto(url);
  await page.getByRole('button', { name: 'Mit Fake Wallet verbinden' }).click();
  await expect(page.locator('#cups')).toHaveText('2,0');
  await expect(page.locator('#admCard')).toBeHidden();
});

test('Admin: Admin-Karte sichtbar', async ({ page }) => {
  await mockRpc(page, base(A));
  await injectWallet(page, A);
  await page.goto(url);
  await page.getByRole('button', { name: 'Mit Fake Wallet verbinden' }).click();
  await expect(page.locator('#cups')).toHaveText('2,0');
  await expect(page.locator('#admCard')).toBeVisible();
});

test('?net=mainnet: Requests an publicnode, kein api-key in Request-URLs', async ({ page }) => {
  const calls: string[] = [];
  await mockRpc(page, base(U, EURC_MAINNET), calls); // Mainnet-Config mit Circle-EURC
  await injectWallet(page, U);
  await page.goto(url + '?net=mainnet');
  await page.getByRole('button', { name: 'Mit Fake Wallet verbinden' }).click();
  await expect(page.locator('#scoops')).toHaveText('5,00 SCOOP · 0,00 EURC');
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every(c => new URL(c.split(' ')[1]).origin === MAINNET)).toBe(true);
  expect(calls.some(c => /api-key/i.test(c))).toBe(false);
});

test('Devnet-Default: Wallet-Daten kommen vom Devnet-RPC', async ({ page }) => {
  const calls: string[] = [];
  await mockRpc(page, base(U), calls);
  await injectWallet(page, U);
  await page.goto(url);
  await page.getByRole('button', { name: 'Mit Fake Wallet verbinden' }).click();
  await expect(page.locator('#scoops')).toHaveText('5,00 SCOOP · 0,00 EURC');
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every(c => new URL(c.split(' ')[1]).origin === DEVNET)).toBe(true);
});

test('Alte USDC-Config: Kasse erkannt, Aufladen und Abheben gesperrt', async ({ page }) => {
  await mockRpc(page, base(A, USDC)); // Config zeigt noch die USDC-Mint
  await injectWallet(page, A); // Admin: wäre sonst die Admin-Karte sichtbar
  await page.goto(url);
  await page.getByRole('button', { name: 'Mit Fake Wallet verbinden' }).click();
  await expect(page.locator('#cups')).toHaveText('2,0'); //SCOOP-Konten weiterhin nutzbar
  await expect(page.locator('#bad')).toBeVisible();
  await expect(page.locator('#badMsg')).toContainText('EPjF');
  await expect(page.locator('#buyCard')).toHaveClass(/off/); // .off = gedimmt + klickgesperrt
  await expect(page.locator('#buyB')).toBeDisabled();
  await expect(page.locator('#admCard')).toBeHidden();
  await expect(page.locator('#hints')).toContainText('noch nicht auf EURC');
});

test('Aufladen: buy-Instruction enthält EURC-Betrag und Mindestoutput', async ({ page }) => {
  const uU = ATA_EURC[U][EURC_DEVNET];
  const txs: Uint8Array[] = [];
  const baseAccounts = base(U);
  const accounts = {
    ...baseAccounts,
    [uU]: tokenAccount(10000000n) // 10 EURC, damit 5 EURC laden gehen
  };
  await mockRpc(page, accounts);
  await page.addInitScript(({ addr }: { addr: string }) => {
    // Wallet wie in injectWallet, aber signAndSendTransaction gibt das Transaktions-Byte zurück.
    const accounts = [{ address: addr, chains: ['solana:mainnet', 'solana:devnet'], features: ['solana:signAndSendTransaction', 'standard:connect'] }];
    const wallet = {
      version: '1.0.0', name: 'Fake Wallet', icon: 'data:image/svg+xml;base64,', chains: ['solana:mainnet', 'solana:devnet'], accounts,
      features: {
        'standard:connect': { version: '1.0.0', connect: async () => ({ accounts }) },
        'solana:signAndSendTransaction': { version: '1.0.0', signAndSendTransaction: async (t: { transaction: Uint8Array }) => { window.__txs.push(t.transaction); return { signature: new Uint8Array(64) } } },
        'standard:events': { version: '1.0.0', on: () => () => {} },
        'standard:disconnect': { version: '1.0.0', disconnect: async () => {} }
      }
    };
    window.__txs = [] as unknown as Uint8Array[];
    addEventListener('wallet-standard:app-ready', (e: any) => e.detail.register(wallet));
  }, { addr: U });
  await page.goto(url);
  await page.getByRole('button', { name: 'Mit Fake Wallet verbinden' }).click();
  await expect(page.locator('#bad')).toBeHidden();
  await page.locator('#buyB').click();
  await page.waitForFunction(() => (window as any).__txs.length === 1);
  const tx = new Uint8Array(await page.evaluate(() => (window as any).__txs[0].slice()));
  // Layout von buildTx in index.html:
  // [version 1][sig 64][nS,roS,roN 3][cu numAccts][accts n*32][blockhash 32][cu ixCount][ixs…]
  // Jeder Ix: [progIdx 1][cu numKeys][keyIdx k][cu dataLen][data]
  let p = 1 + 64;
  p += 3; // header nS/roS/roN
  const cu = (): number => {
    const a = tx[p], b = tx[p + 1];
    if (a < 128) { p += 1; return a; }
    p += 2;
    return (a & 127) | (b << 7);
  };
  const numAccts = cu();
  p += numAccts * 32;
  p += 32; // blockhash
  const ixCount = cu();
  const ixs: Uint8Array[] = [];
  for (let i = 0; i < ixCount; i++) {
    p++; // program id index
    const k = cu(); // num account indices
    p += k; // account indices (je 1 Byte)
    const dl = cu(); // data length
    ixs.push(tx.slice(p, p + dl));
    p += dl;
  }
  const buy = ixs.find(d => d[0] === 0x00 && d[1] === 0xb8 && d[2] === 0x35)!; // DISC.buy
  expect(buy).toBeDefined();
  const u64le = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset + o, 8).getBigUint64(0, true).toString();
  expect(u64le(buy, 8)).toBe('5000000');               // 5 EURC
  expect(u64le(buy, 16)).toBe('50000000');             // min 50 SCOOP = 5 EURC × 10
});

test('Falscher Kurs: Kasse gesperrt, Abweichung benannt', async ({ page }) => {
  await mockRpc(page, { ...base(U), [CONFIG]: configAccount(8873901n, EURC_DEVNET) }); // EURC-Mint, alter EUR/USD-Kurs
  await injectWallet(page, U);
  await page.goto(url);
  await page.getByRole('button', { name: 'Mit Fake Wallet verbinden' }).click();
  await expect(page.locator('#bad')).toBeVisible();
  await expect(page.locator('#badMsg')).toContainText('8,87');
  await expect(page.locator('#buyCard')).toHaveClass(/off/);
  await expect(page.locator('#buyB')).toBeDisabled();
});
