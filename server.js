// server.js
// Hauptserver für das MOOM Modelabel.
// Das Projekt nutzt Express für die API und statische Seiten, Multer für Uploads und JSON-Dateien als einfache Datenspeicherung.

const express = require('express');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'starsfromthemoom';
const SESSION_SECRET = process.env.SESSION_SECRET || 'moom-session-secret';

if (process.env.NODE_ENV === 'production' && (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET)) {
  throw new Error('In production müssen ADMIN_PASSWORD und SESSION_SECRET gesetzt sein.');
}

// Verzeichnisse
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

// Datenordner sicherstellen
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Dateisystem-Checks für JSON-Dateien
if (!fs.existsSync(PRODUCTS_FILE)) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(ORDERS_FILE)) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify([], null, 2));
}

// JSON-Dateien als Array lesen
function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Dateinamen für Uploads erzeugen
function makeUploadFileName(originalName) {
  const safeName = originalName.replace(/\s+/g, '-').toLowerCase();
  const timestamp = Date.now();
  return `${timestamp}-${safeName}`;
}

// Multer-Konfiguration für Bild-Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, makeUploadFileName(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Nur Bilder im JPG-, PNG-, WebP- oder SVG-Format sind erlaubt.'));
    }
  }
});

// Session für Admin-Login
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

// Body-Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Statische öffentliche Dateien
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// Public routes
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/product', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'product.html'));
});

// Admin Login-Status prüfen
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }

  return res.status(401).json({
    success: false,
    message: 'Nicht autorisiert.'
  });
}

// Admin-Login-Block
app.get('/admin', (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.sendFile(path.join(PUBLIC_DIR, 'admin', 'index.html'));
  }

  return res.redirect('/admin/login.html');
});

app.get('/admin/login', (req, res) => {
  res.redirect('/admin/login.html');
});

app.get('/admin/login.html', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin', 'login.html'));
});

app.get('/admin/index.html', (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.sendFile(path.join(PUBLIC_DIR, 'admin', 'index.html'));
  }

  return res.redirect('/admin/login.html');
});

app.post('/api/admin/login', (req, res) => {
  const { code } = req.body;

  if (code === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ success: true, message: 'Eingeloggt.' });
  }

  return res.status(401).json({
    success: false,
    message: 'Falscher Zugangscode.'
  });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: 'Erfolgreich ausgeloggt.' });
  });
});

app.get('/api/admin/session', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.isAdmin) });
});

// Produkte API
app.get('/api/products', (req, res) => {
  const products = readJson(PRODUCTS_FILE);
  const sorted = [...products].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(sorted);
});

app.get('/api/products/:id', (req, res) => {
  const products = readJson(PRODUCTS_FILE);
  const product = products.find((item) => item.id === req.params.id);

  if (!product) {
    return res.status(404).json({ message: 'Produkt nicht gefunden.' });
  }

  return res.json(product);
});

app.post('/api/products', requireAdmin, upload.array('images', 10), (req, res) => {
  try {
    const products = readJson(PRODUCTS_FILE);

    const uploadedFiles = (req.files || []).map((file) => `/uploads/${file.filename}`);
    if (uploadedFiles.length === 0) {
      return res.status(400).json({ message: 'Bitte mindestens ein Bild hochladen.' });
    }

    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    const price = Number(req.body.price || 0);
    const size = String(req.body.size || '').trim();
    const condition = String(req.body.condition || '').trim();
    const model = String(req.body.model || '').trim();
    const materials = String(req.body.materials || '').trim();
    const status = String(req.body.status || 'Verfügbar').trim();
    const collection = String(req.body.collection || 'Normal').trim();
    const isBestseller = collection === 'Birthday Edition';
    const isDuckTapeEdition = collection === 'Golden Goose Duck Tape Edition';
    const mainImage = String(req.body.mainImage || uploadedFiles[0]).trim();

    if (!title || !description || !price || !size || !condition || !model) {
      return res.status(400).json({ message: 'Bitte alle Pflichtfelder ausfüllen.' });
    }

    const newProduct = {
      id: `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      description,
      price,
      size,
      condition,
      model,
      materials: materials || 'Handgefertigt / 1/1 Unikat',
      status,
      collection,
      isBestseller,
      isDuckTapeEdition,
      note: '1/1 Unikat',
      featuredImage: mainImage,
      images: uploadedFiles,
      createdAt: new Date().toISOString()
    };

    products.unshift(newProduct);
    writeJson(PRODUCTS_FILE, products);

    return res.status(201).json({ success: true, product: newProduct });
  } catch (error) {
    return res.status(500).json({ message: 'Fehler beim Speichern des Produkts.', error: error.message });
  }
});

function handleProductUploadOrJson(req, res, next) {
  const contentType = req.headers['content-type'] || '';

  if (contentType.includes('multipart/form-data')) {
    return upload.array('images', 10)(req, res, next);
  }

  return next();
}

app.put('/api/products/:id', requireAdmin, handleProductUploadOrJson, (req, res) => {
  try {
    const products = readJson(PRODUCTS_FILE);
    const index = products.findIndex((item) => item.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ message: 'Produkt nicht gefunden.' });
    }

    const currentProduct = products[index];
    const uploadedFiles = Array.isArray(req.files) ? req.files.map((file) => `/uploads/${file.filename}`) : [];
    const nextImages = uploadedFiles.length > 0 ? uploadedFiles : currentProduct.images || [];
    const incomingData = req.body && typeof req.body === 'object' ? req.body : {};
    const mainImage = String(incomingData.mainImage || currentProduct.featuredImage || nextImages[0] || '').trim();

    const collection = String(incomingData.collection || currentProduct.collection || 'Normal').trim();
    const isBestseller = collection === 'Birthday Edition';
    const isDuckTapeEdition = collection === 'Golden Goose Duck Tape Edition';

    const updatedProduct = {
      ...currentProduct,
      title: String(incomingData.title || currentProduct.title).trim(),
      description: String(incomingData.description || currentProduct.description).trim(),
      price: Number(incomingData.price || currentProduct.price),
      size: String(incomingData.size || currentProduct.size).trim(),
      condition: String(incomingData.condition || currentProduct.condition).trim(),
      model: String(incomingData.model || currentProduct.model).trim(),
      materials: String(incomingData.materials || currentProduct.materials).trim(),
      status: String(incomingData.status || currentProduct.status).trim(),
      collection,
      isBestseller,
      isDuckTapeEdition,
      note: '1/1 Unikat',
      featuredImage: mainImage,
      images: nextImages
    };

    products[index] = updatedProduct;
    writeJson(PRODUCTS_FILE, products);

    return res.json({ success: true, product: updatedProduct });
  } catch (error) {
    return res.status(500).json({ message: 'Fehler beim Aktualisieren des Produkts.', error: error.message });
  }
});

app.delete('/api/products/:id', requireAdmin, (req, res) => {
  const products = readJson(PRODUCTS_FILE);
  const filtered = products.filter((item) => item.id !== req.params.id);

  if (filtered.length === products.length) {
    return res.status(404).json({ message: 'Produkt nicht gefunden.' });
  }

  writeJson(PRODUCTS_FILE, filtered);
  return res.json({ success: true, message: 'Produkt gelöscht.' });
});

// Bestellungen API
app.post('/api/orders', (req, res) => {
  const { name, email, customName, message, productId, customText } = req.body || {};

  if (!name || !email || (!productId && (!customName || !message))) {
    return res.status(400).json({ message: 'Bitte alle Felder ausfüllen.' });
  }

  let productDetails = {};
  if (productId) {
    const product = readJson(PRODUCTS_FILE).find((item) => item.id === String(productId));
    if (!product) {
      return res.status(404).json({ message: 'Das ausgewählte Produkt wurde nicht gefunden.' });
    }
    if (product.status !== 'Verfügbar') {
      return res.status(409).json({ message: 'Dieses Produkt ist leider nicht mehr verfügbar.' });
    }
    if (!customText || String(customText).trim().length > 50) {
      return res.status(400).json({ message: 'Bitte gib den gewünschten Aufdruck ein (maximal 50 Zeichen).' });
    }
    productDetails = {
      productId: product.id,
      productTitle: product.title,
      productPrice: Number(product.price),
      customText: String(customText).trim(),
      orderType: 'Personalisierte Produktbestellung',
      paymentStatus: 'Zahlung ausstehend'
    };
  }

  const orders = readJson(ORDERS_FILE);
  const order = {
    id: `order-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: String(name).trim(),
    email: String(email).trim(),
    customName: String(customName || customText || '').trim(),
    message: String(message || '').trim(),
    ...productDetails,
    status: productDetails.paymentStatus || 'Anfrage',
    createdAt: new Date().toISOString()
  };

  orders.unshift(order);
  writeJson(ORDERS_FILE, orders);

  return res.status(201).json({ success: true, message: 'Deine Anfrage wurde gesendet.' });
});

app.get('/api/orders', requireAdmin, (req, res) => {
  const orders = readJson(ORDERS_FILE);
  const sorted = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(sorted);
});

// Fallback: falls ein Produkt-Upload aus einem Browser mit FormData fehlschlägt, wird ein klarer Fehler ausgespielt
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  }

  if (err) {
    return res.status(400).json({ message: err.message || 'Uploadfehler.' });
  }

  return next();
});

// Server starten
app.listen(PORT, HOST, () => {
  const localIp = require('os').networkInterfaces();
  const addresses = [];

  Object.values(localIp).forEach((interfaces) => {
    interfaces.forEach((detail) => {
      if (detail.family === 'IPv4' && !detail.internal) {
        addresses.push(detail.address);
      }
    });
  });

  const displayUrls = [
    `http://localhost:${PORT}`,
    ...(addresses.length ? addresses.map((ip) => `http://${ip}:${PORT}`) : [])
  ];

  console.log(`MOOM läuft auf: ${displayUrls.join(' | ')}`);
});
