# MOOM mit Netlify veröffentlichen

## Vor dem Deployment

Die Netlify-Version nutzt Netlify Functions für Admin, Produkte, Bestellungen und Bilder. Produkte, Bestellungen und hochgeladene Bilder werden in Netlify Blobs gespeichert. Die ersten drei Beispielprodukte werden beim ersten API-Aufruf initialisiert.

## Lokal testen

1. In `.env` lokal `ADMIN_PASSWORD`, `SESSION_SECRET` und `MOOM_LOCAL_BLOBS=true` setzen. Für lokale Stripe-Tests zusätzlich `STRIPE_SECRET_KEY` mit einem Stripe-Testschlüssel setzen. `.env` ist von Git ausgeschlossen.
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
6. Stripe-Zahlungen einrichten:
   - Stripe-Konto eröffnen/verifizieren und im Stripe-Dashboard zunächst den **Testmodus** verwenden.
   - In Netlify die Environment Variable `STRIPE_SECRET_KEY` mit dem Test-Secret-Key (`sk_test_…`) setzen. `STRIPE_WEBHOOK_SECRET` erst setzen, nachdem der Webhook-Endpunkt angelegt wurde.
   - Im Stripe-Dashboard einen Webhook-Endpunkt `https://DEINE-DOMAIN/api/stripe/webhook` anlegen. Als Ereignisse mindestens `checkout.session.completed` und `checkout.session.async_payment_succeeded` auswählen.
   - Das angezeigte Signaturgeheimnis (`whsec_…`) in Netlify als `STRIPE_WEBHOOK_SECRET` setzen.
   - Erneut deployen und mit Stripe-Testkarte `4242 4242 4242 4242` samt zukünftigem Ablaufdatum und beliebigem CVC testen. Testmodus löst keine echte Abbuchung aus.
   - Vor dem Verkauf Testschlüssel durch Live-Schlüssel (`sk_live_…`) ersetzen und auch den **Live-Webhooks**-Signaturschlüssel eintragen. Beide Webhook-Geheimnisse und Schlüssel geheim halten; niemals in GitHub oder im Chat speichern.
   - Im Stripe-Dashboard die gewünschten Zahlungsmethoden aktivieren. Das ist Stripe Checkout; **Shop Pay** ist eine Shopify-Zahlungsart und wird dadurch nicht aktiviert.
   - Der Checkout erlaubt aktuell Versandadressen in der Schweiz und berechnet CHF. Für andere Lieferländer muss die erlaubte Länderliste angepasst werden.
7. Danach in Netlify unter **Domain management** `moomshoes.com` hinzufügen. Die dort angezeigten DNS-Einträge bei Swizzonic eintragen. Vorhandene MX-/E-Mail-DNS-Einträge nicht löschen. Auf das Netlify-HTTPS-Zertifikat warten.

## Zahlungsablauf und Grenzen

Personalisierte Einzelstücke werden vor dem Checkout kurz reserviert. Stripe leitet zurück auf eine Erfolgsseite; erst ein gültig signierter Webhook markiert die Bestellung als bezahlt und das Produkt als verkauft. Abgelaufene Reservierungen werden beim nächsten Produktabruf freigegeben. Vor Live-Verkauf Webhook, Bestellstatus und Auszahlungs-/Steuereinstellungen im Stripe-Konto prüfen. Produktbilder über den Admin sind auf drei Dateien zu je maximal 1 MB begrenzt.
