# SCOOP ☕ – Kaffeekasse Web-UI

Statische Seite für die SCOOP-Kaffeekasse: mit EURC SCOOP aufladen, Kaffee verbuchen
und das eigene Guthaben im Blick behalten. Eine Tasse sind 2,5 SCOOP und entsprechen
0,25 €. Der Kurs ist fest: 1 SCOOP = 0,10 EURC (1 EURC = 10 SCOOP). Verbindet sich
per Wallet Standard mit Solflare oder Phantom (oder einer beliebigen anderen Wallet,
die den Standard unterstützt).

Am Handy die Seite im Browser der Wallet-App öffnen, damit die Wallet verfügbar ist.

Live: https://scoop-bros.github.io/scoop/

Mainnet läuft keylos über `https://solana-rpc.publicnode.com`; Devnet über
`https://api.devnet.solana.com`. Die Seite ist eine einzelne `index.html` ohne
Build-Schritt und ohne externes Skript; sie sendet nur RPC-Anfragen an diese
beiden Endpunkte. publicnode ist Community-Betrieb ohne SLA.

Zahlungsmint je Netzwerk: Mainnet Circle-EURC `HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr`,
Devnet der Test-Mint der Kasse `BHDWiNzzgPkNj8gX9SZU7U6fywJhrSK99hBC9A3tbR9f`
(als Test-EURC geführt). Beim Laden prüft die Seite, dass die On-Chain-Config diese
Mint und den Kurs 10 SCOOP/EURC enthält. Weicht ab – etwa eine ältere USDC-Kasse –,
bleiben Kaffee und SCOOP-Guthaben nutzbar, aber Aufladen und Abheben sind gesperrt
und die Abweichung wird angezeigt. Der Vertrag kennt keine Mint-Wechsel-Instruction;
für eine Mainnet-Neuanlage muss `init` den EURC-Mint mit `--rate 10` bekommen.

In diesem öffentlichen Repo liegen keine Secrets. Keine Keys, Tokens oder
persönlichen RPC-URLs committen.

## Lokal starten

```bash
python3 -m http.server -d . 8000
```

Öffne http://localhost:8000/ . Alternativ die Datei direkt im Browser öffnen; für
Wallet-Extensions ist der HTTP-Server die verlässlichere Variante.

## Tests

```bash
pnpm install
pnpm exec playwright install chromium
pnpm test
```

Der Test mockt alle RPC-Anfragen; er braucht kein Netz und keine Wallet-Extension.

## Backend

Programm, CLI, Deploy und Betrieb liegen im privaten Repo:
https://github.com/scoop-bros/scoop-backend
