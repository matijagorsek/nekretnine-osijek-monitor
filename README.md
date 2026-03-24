# 🏠 Nekretnine Osijek Monitor

Automatski scrapa hrvatske oglasne portale za nekretnine u Osijeku i šalje Telegram notifikaciju kad se pojavi nešto novo.

## Izvori

- **Njuškalo** — stanovi + kuće u Osijeku
- **Index.hr oglasi** — stanovi + kuće u Osijeku
- **Nekretnine.hr** — stanovi + kuće u Osijeku
- **Lokalne agencije** — Maestro, Apolonija, Premia (lako dodaješ nove)

## Značajke

- 🔄 **Cross-site deduplikacija** — prepoznaje isti oglas na različitim portalima po cijeni, kvadraturi i lokaciji
- 🔍 **Filtriranje** — tip, cijena, veličina, sobe, kvart
- 📨 **Telegram notifikacije** — lijepo formatirane s linkom na oglas
- ⏰ **Cron raspored** — default svaki dan u 12:00 (Europe/Zagreb)
- 💾 **SQLite** — pamti već viđene oglase

## Brzi setup

### 1. Telegram bot

1. Otvori [@BotFather](https://t.me/BotFather) na Telegramu
2. `/newbot` → daj mu ime (npr. "Nekretnine Osijek Bot")
3. Kopiraj **bot token**
4. Pošalji botu poruku (bilo što), zatim otvori:
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
5. Nađi `chat.id` u odgovoru — to je tvoj **chat ID**

### 2. Konfiguracija

```bash
cp .env.example .env
```

Popuni `.env`:
```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=123456789

# Prilagodi filtere po želji
FILTER_PRICE_MAX=150000
FILTER_SIZE_MIN=50
FILTER_LOCATIONS=gornji grad,sjenjak,retfala
```

### 3. Pokretanje

**Lokalno:**
```bash
npm install
npm start          # pokreće cron (svaki dan u 12:00)
npm run scrape     # jednokratno pokretanje odmah
```

**Docker:**
```bash
docker build -t nekretnine-monitor .
docker run -d --env-file .env -v $(pwd)/data:/app/data nekretnine-monitor
```

**Railway:**
```bash
railway up
# Dodaj env varijable u Railway dashboardu
```

## Dodavanje novih agencija

Otvori `src/scrapers/local-agencies.js` i dodaj objekt u `AGENCIES` array:

```js
{
  name: "Nova Agencija",
  url: "https://nova-agencija.hr/prodaja/osijek",
  selectors: {
    item: ".listing-card",
    link: "a",
    title: "h3",
    price: ".price",
  },
}
```

## Struktura

```
src/
├── index.js              # Main entry + cron
├── config.js             # Env config loader
├── db.js                 # SQLite (seen listings)
├── dedupe.js             # Cross-site deduplication
├── filters.js            # Price/size/location filters
├── telegram.js           # Telegram notifications
├── http.js               # Fetch with retry + rate limiting
└── scrapers/
    ├── njuskalo.js       # Njuškalo parser
    ├── index-oglasi.js   # Index.hr parser
    ├── nekretnine-hr.js  # Nekretnine.hr parser
    └── local-agencies.js # Generic parser for local agencies
```

## Napomene

- Scraperi koriste polite delays (1-5s između requestova) da ne opterećuju servere
- User-Agent rotacija za izbjegavanje blokiranja
- Ako se layout portala promijeni, treba ažurirati CSS selektore u scraperu
- SQLite baza raste sporo (~1KB po oglasu), ne treba brisanje
