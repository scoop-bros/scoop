import { test, expect, Page } from '@playwright/test';
import { ATA_SCOOP, DEVNET, MAINNET, CONFIG, MINT, VAULT, PD, configAccount, mintAccount, mockRpc, pdAccount, tokenAccount } from './helpers';

const url = `file://${__dirname}/../index.html`;
const U = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';
const A = '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1';

// uU (USDC-ATA) fehlt in der Map → RPC liefert null → Seite rechnet 0n → USDC-Hinweis erscheint.
const base = (me: string) => ({
  [CONFIG]: configAccount(8873901n), // 10 / 1.1269 = 8,873901; Anzeige über sc(): 8,87
  [MINT]: mintAccount(100000000n),   // 100 SCOOP Umlauf
  [VAULT]: tokenAccount(20000000n),  // 20 USDC Kasse
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
  await expect(page.locator('#scoops')).toHaveText('5,00 SCOOP · 0,00 USDC');
  await expect(page.locator('#cups')).toHaveText('2,0');
  await expect(page.locator('#kasse')).toContainText('20,00 USDC');
  await expect(page.locator('#kasse')).toContainText('100,00 SCOOP');
  await expect(page.locator('#kasse')).toContainText('8,87');
  await expect(page.locator('#hints .hint')).toHaveCount(2);
  await expect(page.locator('#hints')).toContainText('Du brauchst etwas SOL für Gebühren');
  await expect(page.locator('#hints')).toContainText('Auf dieser Wallet liegt kein USDC.');
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
  await mockRpc(page, base(U), calls);
  await injectWallet(page, U);
  await page.goto(url + '?net=mainnet');
  await page.getByRole('button', { name: 'Mit Fake Wallet verbinden' }).click();
  await expect(page.locator('#scoops')).toHaveText('5,00 SCOOP · 0,00 USDC');
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
  await expect(page.locator('#scoops')).toHaveText('5,00 SCOOP · 0,00 USDC');
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every(c => new URL(c.split(' ')[1]).origin === DEVNET)).toBe(true);
});
