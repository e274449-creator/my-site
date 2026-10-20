# MOOM mit Netlify veröffentlichen

## Vor dem Deployment

Die Netlify-Version nutzt Netlify Functions für Admin, Produkte, Bestellungen und Bilder. Produkte, Bestellungen und hochgeladene Bilder werden in Netlify Blobs gespeichert. Die ersten drei Beispielprodukte werden beim ersten API-Aufruf initialisiert.

## Lokal testen

1. In `.env` lokal `ADMIN_PASSWORD`, `SESSION_SECRET` und `MOOM_LOCAL_BLOBS=true` setzen. `.env` ist von Git ausgeschlossen.
2. `npm run netlify:dev` starten und `http://localhost:8888` öffnen.
3. Lokal gilt nur das Passwort aus der lokalen `.env`.

## Auf Netlify deployen

1. Das Projekt in ein privates GitHub-Repository pushen.
2. In Netlify **Add new site → Import an existing project** wählen und das Repository verbinden.
3. Als Publish directory `public` und als Functions directory `netlify/functions` verwenden. Die übrigen Routing-Regeln stehen in `netlify.toml`.
4. In den Netlify-Site-Einstellungen unter **Environment variables** zwei eigene, lange Geheimnisse anlegen:
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET`

   Diese produktiven Geheimnisse dürfen nicht in `.env.example`, GitHub oder im Chat abgelegt werden. `MOOM_LOCAL_BLOBS` darf auf Netlify **nicht** gesetzt werden.
5. Deploy ausführen und nach dem Deploy `/api/products` sowie `/admin` testen. Ein erster Produkt-API-Aufruf initialisiert den Blobs-Store.
6. Danach in Netlify unter **Domain management** `moomshoes.com` hinzufügen. Die dort angezeigten DNS-Einträge bei Swizzonic eintragen. Vorhandene MX-/E-Mail-DNS-Einträge nicht löschen. Auf das Netlify-HTTPS-Zertifikat warten.

## Grenzen des aktuellen Bestellablaufs

Der Personalisierungsablauf nimmt eine Bestellanfrage entgegen und reserviert das Unikat; er verarbeitet keine Onlinezahlung. Zahlungsdetails werden weiterhin persönlich abgestimmt. Produktbilder über den Admin sind auf drei Dateien zu je maximal 1 MB begrenzt.
