import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { getMoomStore } from './lib/stores.mjs';

const productsStore = getMoomStore('moom-products');
const ordersStore = getMoomStore('moom-orders');
const imagesStore = getMoomStore('moom-images');
const SESSION_COOKIE = 'moom_admin_session';
const SESSION_MAX_AGE = 8 * 60 * 60;

const seedProducts = [
  {
    id: 'product-1792435395592-l1wytj', title: 'Test Design', description: 'Beschreibung', price: 499,
    size: '39', condition: 'Sehr gut', model: 'Golden Goose Superstar', materials: 'Handarbeit',
    status: 'Verfügbar', collection: 'Normal', isBestseller: false, isDuckTapeEdition: false,
    note: '1/1 Unikat', featuredImage: '/uploads/1792435395590-moom-test.svg',
    images: ['/uploads/1792435395590-moom-test.svg'], createdAt: '2026-10-19T18:43:15.592Z'
  },
  {
    id: 'sample-1', title: 'Café Cream',
    description: 'Ein minimalistisch gestalteter Vintage Golden Goose in cremigem Beige mit einem subtilen, handgemalten Detail. Jede Oberfläche wurde individuell bearbeitet und mit persönlichem Namen versehen.',
    price: 420, size: '38', condition: 'Sehr gut', model: 'Golden Goose Superstar',
    materials: 'Vintage Leather, Handfarbe, custom finish', status: 'Verfügbar', collection: 'Normal',
    isBestseller: false, isDuckTapeEdition: false, note: '1/1 Unikat',
    featuredImage: '/uploads/sample-cream.svg', images: ['/uploads/sample-cream.svg', '/uploads/sample-cream-2.svg'],
    createdAt: '2026-10-19T00:00:00.000Z'
  },
  {
    id: 'sample-2', title: 'Stone Drift',
    description: 'Ein ruhiger, sandiger Ton mit einer handgefertigten, leicht strukturierten Oberflächenbehandlung. Das Modell steht für ruhige Eleganz im Streetwear-Style.',
    price: 450, size: '39', condition: 'Gut', model: 'Golden Goose Superstar',
    materials: 'Vintage Leather, handgemalte Details, custom detailing', status: 'Reserviert', collection: 'Normal',
    isBestseller: false, isDuckTapeEdition: false, note: '1/1 Unikat',
    featuredImage: '/uploads/sample-stone.svg', images: ['/uploads/sample-stone.svg', '/uploads/sample-stone-2.svg'],
    createdAt: '2026-10-19T00:00:00.000Z'
  }
];

const json = (statusCode, payload, extraHeaders = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  body: JSON.stringify(payload)
});

function getCookie(event, name) {
  const cookieHeader = event.headers?.cookie || event.headers?.Cookie || '';
  const item = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : '';
}

function signSession(timestamp, secret) {
  return createHmac('sha256', secret).update(timestamp).digest('hex');
}

function isAdmin(event) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const [timestamp, signature] = getCookie(event, SESSION_COOKIE).split('.');
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Date.now() - Number(timestamp) > SESSION_MAX_AGE * 1000) return false;
  const expected = signSession(timestamp, secret);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function cookie(value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

async function readArray(store, key, seed = []) {
  const existing = await store.get(key, { type: 'json' });
  if (Array.isArray(existing)) return existing;
  await store.setJSON(key, seed);
  return seed;
}

async function saveArray(store, key, value) {
  await store.setJSON(key, value);
}

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getApiPath(event) {
  const rawPath = event.path || new URL(event.rawUrl).pathname;
  const functionPrefix = '/.netlify/functions/api';
  if (rawPath.startsWith(functionPrefix)) return rawPath.slice(functionPrefix.length) || '/';
  if (rawPath.startsWith('/api')) return rawPath.slice(4) || '/';
  return rawPath;
}

function requireAdmin(event) {
  return isAdmin(event) ? null : json(401, { success: false, message: 'Bitte zuerst als Admin anmelden.' });
}

async function storeProductImages(images) {
  if (!Array.isArray(images) || images.length === 0) return null;
  if (images.length > 3) throw new Error('Bitte höchstens 3 Bilder gleichzeitig hochladen.');
  const preparedImages = [];
  let totalBytes = 0;
  for (const image of images) {
    const match = /^data:(image\/(?:jpeg|png|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(String(image.data || ''));
    if (!match) throw new Error('Ein Bild hat ein ungültiges Format. Erlaubt sind JPG, PNG, WebP und SVG.');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 1024 * 1024) throw new Error('Bilder dürfen jeweils höchstens 1 MB gross sein.');
    totalBytes += bytes.length;
    preparedImages.push({ bytes, contentType: match[1] });
  }
  if (totalBytes > 3 * 1024 * 1024) throw new Error('Die Bilder dürfen zusammen höchstens 3 MB gross sein.');
  return Promise.all(preparedImages.map(async ({ bytes, contentType }) => {
    const key = `${Date.now()}-${randomBytes(6).toString('hex')}`;
    await imagesStore.set(key, bytes, { metadata: { contentType } });
    return `/.netlify/functions/media/${key}`;
  }));
}

export const handler = async (event) => {
  const method = event.httpMethod;
  const route = getApiPath(event);
  const body = parseBody(event);

  try {
    if (route === '/admin/login' && method === 'POST') {
      if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
        return json(503, { success: false, message: 'Admin-Zugang ist in Netlify noch nicht konfiguriert.' });
      }
      if (body.code !== process.env.ADMIN_PASSWORD) return json(401, { success: false, message: 'Falscher Zugangscode.' });
      const timestamp = String(Date.now());
      return json(200, { success: true, message: 'Eingeloggt.' }, {
        'Set-Cookie': cookie(`${timestamp}.${signSession(timestamp, process.env.SESSION_SECRET)}`, SESSION_MAX_AGE)
      });
    }

    if (route === '/admin/logout' && method === 'POST') {
      return json(200, { success: true, message: 'Erfolgreich ausgeloggt.' }, { 'Set-Cookie': cookie('', 0) });
    }

    if (route === '/admin/session' && method === 'GET') {
      return json(200, { authenticated: isAdmin(event) });
    }

    if (route === '/products' && method === 'GET') {
      const products = await readArray(productsStore, 'inventory', seedProducts);
      return json(200, products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    }

    const productMatch = route.match(/^\/products\/([^/]+)$/);
    if (productMatch && method === 'GET') {
      const products = await readArray(productsStore, 'inventory', seedProducts);
      const product = products.find((item) => item.id === decodeURIComponent(productMatch[1]));
      return product ? json(200, product) : json(404, { message: 'Produkt nicht gefunden.' });
    }

    if (route === '/products' && method === 'POST') {
      const denied = requireAdmin(event);
      if (denied) return denied;
      const uploadedImages = await storeProductImages(body.images);
      if (!uploadedImages?.length) return json(400, { message: 'Bitte mindestens ein Bild hochladen.' });
      const title = String(body.title || '').trim();
      const description = String(body.description || '').trim();
      const price = Number(body.price || 0);
      const size = String(body.size || '').trim();
      const condition = String(body.condition || '').trim();
      const model = String(body.model || '').trim();
      if (!title || !description || !price || !size || !condition || !model) return json(400, { message: 'Bitte alle Pflichtfelder ausfüllen.' });
      const collection = String(body.collection || 'Normal').trim();
      const product = {
        id: `product-${Date.now()}-${randomBytes(3).toString('hex')}`, title, description, price, size, condition, model,
        materials: String(body.materials || 'Handgefertigt / 1/1 Unikat').trim(),
        status: String(body.status || 'Verfügbar').trim(), collection,
        isBestseller: collection === 'Birthday Edition',
        isDuckTapeEdition: collection === 'Golden Goose Duck Tape Edition',
        note: '1/1 Unikat', featuredImage: uploadedImages[0], images: uploadedImages, createdAt: new Date().toISOString()
      };
      const products = await readArray(productsStore, 'inventory', seedProducts);
      products.unshift(product);
      await saveArray(productsStore, 'inventory', products);
      return json(201, { success: true, product });
    }

    if (productMatch && method === 'PUT') {
      const denied = requireAdmin(event);
      if (denied) return denied;
      const products = await readArray(productsStore, 'inventory', seedProducts);
      const index = products.findIndex((item) => item.id === decodeURIComponent(productMatch[1]));
      if (index < 0) return json(404, { message: 'Produkt nicht gefunden.' });
      const current = products[index];
      const collection = String(body.collection || current.collection || 'Normal').trim();
      const updated = {
        ...current, ...body, id: current.id, collection,
        isBestseller: collection === 'Birthday Edition',
        isDuckTapeEdition: collection === 'Golden Goose Duck Tape Edition'
      };
      delete updated.imagesUpload;
      products[index] = updated;
      await saveArray(productsStore, 'inventory', products);
      return json(200, { success: true, product: updated });
    }

    if (productMatch && method === 'DELETE') {
      const denied = requireAdmin(event);
      if (denied) return denied;
      const products = await readArray(productsStore, 'inventory', seedProducts);
      const filtered = products.filter((item) => item.id !== decodeURIComponent(productMatch[1]));
      if (filtered.length === products.length) return json(404, { message: 'Produkt nicht gefunden.' });
      await saveArray(productsStore, 'inventory', filtered);
      return json(200, { success: true, message: 'Produkt gelöscht.' });
    }

    if (route === '/orders' && method === 'POST') {
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim();
      const productId = String(body.productId || '').trim();
      const customText = String(body.customText || '').trim();
      if (!name || !email || (!productId && (!body.customName || !body.message))) return json(400, { message: 'Bitte alle Pflichtfelder ausfüllen.' });
      let details = {};
      if (productId) {
        const products = await readArray(productsStore, 'inventory', seedProducts);
        const product = products.find((item) => item.id === productId);
        if (!product) return json(404, { message: 'Das ausgewählte Produkt wurde nicht gefunden.' });
        if (product.status !== 'Verfügbar') return json(409, { message: 'Dieses Produkt ist leider nicht mehr verfügbar.' });
        if (!customText || customText.length > 50) return json(400, { message: 'Bitte gib den gewünschten Aufdruck ein (maximal 50 Zeichen).' });
        details = { productId, productTitle: product.title, productPrice: Number(product.price), customText, orderType: 'Personalisierte Produktbestellung', paymentStatus: 'Zahlung ausstehend' };
        const index = products.findIndex((item) => item.id === productId);
        products[index] = { ...products[index], status: 'Reserviert' };
        await saveArray(productsStore, 'inventory', products);
      }
      const order = {
        id: `order-${Date.now()}-${randomBytes(3).toString('hex')}`, name, email,
        customName: String(body.customName || customText).trim(), message: String(body.message || '').trim(),
        ...details, status: details.paymentStatus || 'Anfrage', createdAt: new Date().toISOString()
      };
      const orders = await readArray(ordersStore, 'orders', []);
      orders.unshift(order);
      await saveArray(ordersStore, 'orders', orders);
      return json(201, { success: true, order, message: productId ? 'Deine Bestellung ist eingegangen. Das Unikat wurde für dich reserviert.' : 'Deine Anfrage wurde gesendet.' });
    }

    if (route === '/orders' && method === 'GET') {
      const denied = requireAdmin(event);
      if (denied) return denied;
      const orders = await readArray(ordersStore, 'orders', []);
      return json(200, orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    }

    return json(404, { message: 'API-Endpunkt nicht gefunden.' });
  } catch (error) {
    console.error('Netlify API error:', error);
    return json(400, { message: error.message || 'Die Anfrage konnte nicht verarbeitet werden.' });
  }
};
