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

```text
starsfromthemoom
```

## Wichtige Hinweise

- Produkte liegen in `data/products.json`.
- Bestellungen liegen in `data/orders.json`.
- Hochgeladene Bilder landen in `uploads/`.
- Die Admin-Seiten sind nur mit dem Zugangscode erreichbar.
