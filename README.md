# MOOM

MOOM ist eine kleine, elegante Modelabel-Website mit public storefront und passwortgeschütztem Admin-Bereich.

## Technik

- Node.js + Express
- Vanilla HTML, CSS und JavaScript
- JSON-Dateien als Datenspeicher
- Multer für Bild-Uploads

## Installation

1. Öffne das Projektverzeichnis im Terminal.
2. Installiere die Abhängigkeiten:

```bash
npm install
```

3. Starte den Server:

```bash
npm start
```

4. Öffne die Website im Browser:

- Besucherseite: http://localhost:3000
- Admin-Login: http://localhost:3000/admin/login.html

## Admin-Zugangscode

Der Admin-Zugang wird über die Umgebungsvariable `ADMIN_PASSWORD` festgelegt. Speichere den Wert lokal in `.env` und auf Netlify unter **Site configuration → Environment variables**. Zugangsdaten gehören nicht in den Quellcode oder ins Git-Repository.

Der Server benötigt zusätzlich `SESSION_SECRET`, einen langen zufälligen Schlüssel zur Signierung der Login-Sitzung. Beide Variablen müssen beim Serverstart vorhanden sein; andernfalls startet der Server absichtlich nicht.

Für die lokale Entwicklung kannst du `.env.example` als Vorlage für eine nicht versionierte `.env` verwenden und darin eigene geheime Werte setzen. Auf Netlify setzt du beide Variablen in den Site-Einstellungen und löst danach einen neuen Deploy aus.

## Wichtige Hinweise

- Produkte liegen in `data/products.json`.
- Bestellungen liegen in `data/orders.json`.
- Hochgeladene Bilder landen in `uploads/`.
- Die Admin-Seiten sind nur mit dem Zugangscode erreichbar.
