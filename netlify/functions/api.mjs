import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { getMoomStore } from './lib/stores.mjs';
import Stripe from 'stripe';

let productsStore;
let ordersStore;
let imagesStore;

function getProductsStore() {
  productsStore ||= getMoomStore('moom-products');
  return productsStore;
}

function getOrdersStore() {
  ordersStore ||= getMoomStore('moom-orders');
  return ordersStore;
}

function getImagesStore() {
  imagesStore ||= getMoomStore('moom-images');
  return imagesStore;
}
const SESSION_COOKIE = 'moom_admin_session';
const SESSION_MAX_AGE = 8 * 60 * 60;

function getStripe() {
  return process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
}

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
  const existing = await store.get(key, { type: 'json', consistency: 'strong' });
  if (Array.isArray(existing)) return existing;
  await store.setJSON(key, seed);
  return seed;
}

async function saveArray(store, key, value) {
  await store.setJSON(key, value);
}

async function releaseExpiredReservations() {
  const [orders, products] = await Promise.all([
    readArray(getOrdersStore(), 'orders', []),
    readArray(getProductsStore(), 'inventory', seedProducts)
  ]);
  const now = Date.now();
  const expiredOrders = orders.filter((order) =>
    ['Personalisierte Produktbestellung', 'Warenkorb-Bestellung'].includes(order.orderType) &&
    order.paymentStatus !== 'Bezahlt' &&
    order.checkoutExpiresAt &&
    Date.parse(order.checkoutExpiresAt) <= now
  );
  if (!expiredOrders.length) return;

  const expiredIds = new Set(expiredOrders.map((order) => order.id));
  const expiredProductIds = new Set(expiredOrders.flatMap((order) => order.productIds || [order.productId]).filter(Boolean));
  const activeProductIds = new Set(orders
    .filter((order) => !expiredIds.has(order.id) && order.paymentStatus !== 'Bezahlt' && order.checkoutExpiresAt && Date.parse(order.checkoutExpiresAt) > now)
    .flatMap((order) => order.productIds || [order.productId])
    .filter(Boolean));

  for (let index = 0; index < orders.length; index += 1) {
    if (expiredIds.has(orders[index].id)) {
      orders[index] = { ...orders[index], status: 'Abgelaufen', paymentStatus: 'Abgelaufen' };
    }
  }
  for (let index = 0; index < products.length; index += 1) {
    if (expiredProductIds.has(products[index].id) && !activeProductIds.has(products[index].id) && products[index].status === 'Reserviert') {
      products[index] = { ...products[index], status: 'Verfügbar' };
    }
  }
  await Promise.all([
    saveArray(getOrdersStore(), 'orders', orders),
    saveArray(getProductsStore(), 'inventory', products)
  ]);
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

function getRawBody(event) {
  if (!event.body) return Buffer.alloc(0);
  return Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
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
    await getImagesStore().set(key, bytes, { metadata: { contentType } });
    return `/.netlify/functions/media/${key}`;
  }));
}

async function handleApiEvent(event) {
  const method = event.httpMethod;
  const route = getApiPath(event);
  const body = parseBody(event);

  try {
    if (route === '/stripe/webhook' && method === 'POST') {
      const stripe = getStripe();
      const signature = event.headers?.['stripe-signature'] || event.headers?.['Stripe-Signature'];
      if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET || !signature) {
        return json(503, { message: 'Stripe Webhook ist noch nicht eingerichtet.' });
      }

      let stripeEvent;
      try {
        stripeEvent = stripe.webhooks.constructEvent(getRawBody(event), signature, process.env.STRIPE_WEBHOOK_SECRET);
      } catch (error) {
        console.warn('Stripe webhook signature verification failed:', error.message);
        return json(400, { message: 'Ungültige Stripe-Webhook-Signatur.' });
      }

      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(stripeEvent.type)) {
        const checkout = stripeEvent.data.object;
        if (checkout.payment_status === 'paid') {
          const orderId = checkout.metadata?.moomOrderId;
          const productIds = checkout.metadata?.productIds
            ? JSON.parse(checkout.metadata.productIds)
            : checkout.metadata?.productId ? [checkout.metadata.productId] : [];
          if (orderId && productIds.length) {
            const orders = await readArray(getOrdersStore(), 'orders', []);
            const orderIndex = orders.findIndex((item) => item.id === orderId);
            if (orderIndex >= 0) {
              if (orders[orderIndex].paymentStatus !== 'Bezahlt') {
                orders[orderIndex] = {
                  ...orders[orderIndex],
                  status: 'Bezahlt',
                  paymentStatus: 'Bezahlt',
                  stripeCheckoutSessionId: checkout.id,
                  paidAt: new Date((checkout.created || Math.floor(Date.now() / 1000)) * 1000).toISOString()
                };
              }
              await saveArray(getOrdersStore(), 'orders', orders);

              const products = await readArray(getProductsStore(), 'inventory', seedProducts);
              const soldIds = new Set(productIds);
              let productsChanged = false;
              for (let productIndex = 0; productIndex < products.length; productIndex += 1) {
                if (soldIds.has(products[productIndex].id) && products[productIndex].status !== 'Verkauft') {
                  products[productIndex] = { ...products[productIndex], status: 'Verkauft' };
                  productsChanged = true;
                }
              }
              if (productsChanged) await saveArray(getProductsStore(), 'inventory', products);
            }
          }
        }
      }

      return json(200, { received: true });
    }

    if (route === '/checkout/cart' && method === 'POST') {
      const stripe = getStripe();
      if (!stripe) return json(503, { message: 'Onlinezahlung ist noch nicht aktiviert. Stripe muss zuerst in Netlify eingerichtet werden.' });

      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim();
      const requestedIds = Array.isArray(body.productIds) ? body.productIds.map((id) => String(id).trim()) : [];
      const productIds = [...new Set(requestedIds)];
      if (!name || !email) return json(400, { message: 'Bitte Name und E-Mail ausfüllen.' });
      if (!productIds.length || productIds.length > 10) return json(400, { message: 'Der Warenkorb muss 1 bis 10 unterschiedliche Produkte enthalten.' });

      await releaseExpiredReservations();
      const products = await readArray(getProductsStore(), 'inventory', seedProducts);
      const selectedProducts = productIds.map((id) => products.find((product) => product.id === id));
      if (selectedProducts.some((product) => !product)) return json(404, { message: 'Ein Produkt im Warenkorb wurde nicht gefunden. Bitte lade den Shop neu.' });
      if (selectedProducts.some((product) => product.status !== 'Verfügbar')) {
        return json(409, { message: 'Mindestens ein Produkt im Warenkorb ist nicht mehr verfügbar. Bitte aktualisiere deinen Warenkorb.' });
      }

      const lineItems = selectedProducts.map((product) => {
        const unitAmount = Math.round(Number(product.price) * 100);
        if (!Number.isSafeInteger(unitAmount) || unitAmount <= 0) throw new Error(`Ungültiger Preis für Produkt ${product.id}`);
        return {
          quantity: 1,
          price_data: {
            currency: 'chf',
            unit_amount: unitAmount,
            product_data: {
              name: product.title,
              description: `Golden Goose ${product.model} · Grösse ${product.size}`
            }
          }
        };
      });

      const orderId = `order-${Date.now()}-${randomBytes(3).toString('hex')}`;
      const checkoutExpiresAt = new Date(Date.now() + 31 * 60 * 1000).toISOString();
      const order = {
        id: orderId,
        name,
        email,
        orderType: 'Warenkorb-Bestellung',
        productIds,
        products: selectedProducts.map((product) => ({ id: product.id, title: product.title, price: Number(product.price), size: product.size })),
        productTitle: selectedProducts.map((product) => product.title).join(', '),
        productPrice: selectedProducts.reduce((sum, product) => sum + Number(product.price), 0),
        paymentStatus: 'Zahlung ausstehend',
        status: 'Zahlung ausstehend',
        checkoutExpiresAt,
        createdAt: new Date().toISOString()
      };
      const orders = await readArray(getOrdersStore(), 'orders', []);
      orders.unshift(order);
      for (let index = 0; index < products.length; index += 1) {
        if (productIds.includes(products[index].id)) products[index] = { ...products[index], status: 'Reserviert' };
      }
      await Promise.all([
        saveArray(getOrdersStore(), 'orders', orders),
        saveArray(getProductsStore(), 'inventory', products)
      ]);

      try {
        const forwardedProto = event.headers?.['x-forwarded-proto'] || 'https';
        const host = event.headers?.['x-forwarded-host'] || event.headers?.host;
        if (!host) throw new Error('Shop-Domain konnte nicht ermittelt werden.');
        const siteOrigin = `${forwardedProto}://${host}`;
        const checkout = await stripe.checkout.sessions.create({
          mode: 'payment',
          submit_type: 'pay',
          customer_email: email,
          billing_address_collection: 'auto',
          shipping_address_collection: { allowed_countries: ['CH'] },
          line_items: lineItems,
          metadata: { moomOrderId: order.id, productIds: JSON.stringify(productIds) },
          payment_intent_data: { metadata: { moomOrderId: order.id, productIds: JSON.stringify(productIds) } },
          expires_at: Math.floor(Date.parse(checkoutExpiresAt) / 1000),
          success_url: `${siteOrigin}/checkout-erfolg.html?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${siteOrigin}/?checkout=cancelled`
        });

        order.stripeCheckoutSessionId = checkout.id;
        const currentOrders = await readArray(getOrdersStore(), 'orders', []);
        const orderIndex = currentOrders.findIndex((item) => item.id === order.id);
        if (orderIndex >= 0) {
          currentOrders[orderIndex] = { ...currentOrders[orderIndex], stripeCheckoutSessionId: checkout.id };
          await saveArray(getOrdersStore(), 'orders', currentOrders);
        }
        return json(200, { url: checkout.url });
      } catch (error) {
        const currentProducts = await readArray(getProductsStore(), 'inventory', seedProducts);
        for (let index = 0; index < currentProducts.length; index += 1) {
          if (productIds.includes(currentProducts[index].id) && currentProducts[index].status === 'Reserviert') {
            currentProducts[index] = { ...currentProducts[index], status: 'Verfügbar' };
          }
        }
        const currentOrders = await readArray(getOrdersStore(), 'orders', []);
        const orderIndex = currentOrders.findIndex((item) => item.id === order.id);
        if (orderIndex >= 0) currentOrders[orderIndex] = { ...currentOrders[orderIndex], status: 'Checkout-Fehler', paymentStatus: 'Checkout-Fehler' };
        await Promise.all([
          saveArray(getProductsStore(), 'inventory', currentProducts),
          saveArray(getOrdersStore(), 'orders', currentOrders)
        ]);
        console.error('Stripe cart checkout creation failed:', error);
        return json(502, { message: 'Die sichere Zahlungsseite konnte nicht erstellt werden. Bitte versuche es erneut.' });
      }
    }

    if (route === '/checkout' && method === 'POST') {
      const stripe = getStripe();
      if (!stripe) return json(503, { message: 'Onlinezahlung ist noch nicht aktiviert. STRIPE_SECRET_KEY fehlt in den Netlify-Environment-Variablen.' });

      const orderId = String(body.orderId || '').trim();
      if (!orderId) return json(400, { message: 'Bestellnummer fehlt.' });

      const orders = await readArray(getOrdersStore(), 'orders', []);
      const order = orders.find((item) => item.id === orderId);
      if (!order || order.orderType !== 'Personalisierte Produktbestellung') return json(404, { message: 'Bestellung wurde nicht gefunden.' });
      if (order.paymentStatus === 'Bezahlt') return json(409, { message: 'Diese Bestellung wurde bereits bezahlt.' });
      if (order.checkoutExpiresAt && Date.now() > Date.parse(order.checkoutExpiresAt)) {
        await releaseExpiredReservations();
        return json(410, { message: 'Der Checkout ist abgelaufen. Bitte starte die Bestellung erneut.' });
      }

      const products = await readArray(getProductsStore(), 'inventory', seedProducts);
      const product = products.find((item) => item.id === order.productId);
      if (!product || product.status !== 'Reserviert') return json(409, { message: 'Das reservierte Produkt ist nicht mehr verfügbar.' });
      const unitAmount = Math.round(Number(product.price) * 100);
      if (!Number.isSafeInteger(unitAmount) || unitAmount <= 0) return json(400, { message: 'Der Produktpreis ist ungültig.' });

      if (order.stripeCheckoutSessionId) {
        try {
          const previousSession = await stripe.checkout.sessions.retrieve(order.stripeCheckoutSessionId);
          if (previousSession.status === 'open' && previousSession.url) return json(200, { url: previousSession.url });
        } catch (error) {
          console.warn('Could not reuse previous Stripe Checkout session:', error.message);
        }
      }

      const forwardedProto = event.headers?.['x-forwarded-proto'] || 'https';
      const host = event.headers?.['x-forwarded-host'] || event.headers?.host;
      if (!host) return json(500, { message: 'Die Shop-Domain konnte nicht ermittelt werden.' });
      const siteOrigin = `${forwardedProto}://${host}`;
      const checkoutExpiresAt = new Date(Date.now() + 31 * 60 * 1000).toISOString();
      const checkout = await stripe.checkout.sessions.create({
        mode: 'payment',
        submit_type: 'pay',
        customer_email: order.email,
        billing_address_collection: 'auto',
        shipping_address_collection: { allowed_countries: ['CH'] },
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'chf',
            unit_amount: unitAmount,
            product_data: {
              name: product.title,
              description: `Golden Goose ${product.model} · Grösse ${product.size} · Aufdruck: ${order.customText}`
            }
          }
        }],
        metadata: { moomOrderId: order.id, productId: product.id },
        payment_intent_data: { metadata: { moomOrderId: order.id, productId: product.id } },
        expires_at: Math.floor(Date.parse(checkoutExpiresAt) / 1000),
        success_url: `${siteOrigin}/checkout-erfolg.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteOrigin}/product.html?id=${encodeURIComponent(product.id)}&checkout=cancelled`
      });

      const orderIndex = orders.findIndex((item) => item.id === orderId);
      orders[orderIndex] = { ...orders[orderIndex], stripeCheckoutSessionId: checkout.id, checkoutExpiresAt };
      await saveArray(getOrdersStore(), 'orders', orders);
      return json(200, { url: checkout.url });
    }

    if (route === '/checkout/verify' && method === 'GET') {
      const stripe = getStripe();
      if (!stripe) return json(503, { message: 'Zahlungsstatus ist momentan nicht verfügbar.' });
      const sessionId = new URL(event.rawUrl).searchParams.get('session_id');
      if (!sessionId || !sessionId.startsWith('cs_')) return json(400, { message: 'Checkout-Referenz fehlt oder ist ungültig.' });
      const checkout = await stripe.checkout.sessions.retrieve(sessionId);
      if (checkout.payment_status !== 'paid') return json(200, { paid: false });
      const orders = await readArray(getOrdersStore(), 'orders', []);
      const order = orders.find((item) => item.id === checkout.metadata?.moomOrderId && item.stripeCheckoutSessionId === checkout.id);
      if (!order) return json(404, { paid: false, message: 'Bestellung wird noch abgeglichen. Bitte lade diese Seite in Kürze erneut.' });
      return json(200, {
        paid: true,
        productTitle: order.productTitle,
        customText: order.customText,
        products: order.products || [{ title: order.productTitle, price: order.productPrice, customText: order.customText }],
        amountTotal: checkout.amount_total,
        currency: checkout.currency
      });
    }

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
      await releaseExpiredReservations();
      const products = await readArray(getProductsStore(), 'inventory', seedProducts);
      return json(200, products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    }

    const productMatch = route.match(/^\/products\/([^/]+)$/);
    if (productMatch && method === 'GET') {
      await releaseExpiredReservations();
      const products = await readArray(getProductsStore(), 'inventory', seedProducts);
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
      const products = await readArray(getProductsStore(), 'inventory', seedProducts);
      products.unshift(product);
      await saveArray(getProductsStore(), 'inventory', products);
      return json(201, { success: true, product });
    }

    if (productMatch && method === 'PUT') {
      const denied = requireAdmin(event);
      if (denied) return denied;
      const products = await readArray(getProductsStore(), 'inventory', seedProducts);
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
      await saveArray(getProductsStore(), 'inventory', products);
      return json(200, { success: true, product: updated });
    }

    if (productMatch && method === 'DELETE') {
      const denied = requireAdmin(event);
      if (denied) return denied;
      const products = await readArray(getProductsStore(), 'inventory', seedProducts);
      const filtered = products.filter((item) => item.id !== decodeURIComponent(productMatch[1]));
      if (filtered.length === products.length) return json(404, { message: 'Produkt nicht gefunden.' });
      await saveArray(getProductsStore(), 'inventory', filtered);
      return json(200, { success: true, message: 'Produkt gelöscht.' });
    }

    if (route === '/orders' && method === 'POST') {
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim();
      const productId = String(body.productId || '').trim();
      const customText = String(body.customText || '').trim();
      if (!name || !email || (!productId && (!body.customName || !body.message))) return json(400, { message: 'Bitte alle Pflichtfelder ausfüllen.' });
      if (productId && !process.env.STRIPE_SECRET_KEY) return json(503, { message: 'Onlinezahlung ist noch nicht aktiviert. Stripe muss zuerst in Netlify eingerichtet werden.' });
      let details = {};
      if (productId) {
        const products = await readArray(getProductsStore(), 'inventory', seedProducts);
        const product = products.find((item) => item.id === productId);
        if (!product) return json(404, { message: 'Das ausgewählte Produkt wurde nicht gefunden.' });
        if (product.status !== 'Verfügbar') return json(409, { message: 'Dieses Produkt ist leider nicht mehr verfügbar.' });
        if (!customText || customText.length > 50) return json(400, { message: 'Bitte gib den gewünschten Aufdruck ein (maximal 50 Zeichen).' });
        details = {
          productId,
          productTitle: product.title,
          productPrice: Number(product.price),
          customText,
          orderType: 'Personalisierte Produktbestellung',
          paymentStatus: 'Zahlung ausstehend',
          checkoutExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
        };
        const index = products.findIndex((item) => item.id === productId);
        products[index] = { ...products[index], status: 'Reserviert' };
        await saveArray(getProductsStore(), 'inventory', products);
      }
      const order = {
        id: `order-${Date.now()}-${randomBytes(3).toString('hex')}`, name, email,
        customName: String(body.customName || customText).trim(), message: String(body.message || '').trim(),
        ...details, status: details.paymentStatus || 'Anfrage', createdAt: new Date().toISOString()
      };
      const orders = await readArray(getOrdersStore(), 'orders', []);
      orders.unshift(order);
      await saveArray(getOrdersStore(), 'orders', orders);
      return json(201, {
        success: true,
        order,
        message: productId
          ? 'Das Unikat ist für 30 Minuten reserviert. Du kannst jetzt sicher bezahlen.'
          : 'Deine Anfrage wurde gesendet.'
      });
    }

    if (route === '/orders' && method === 'GET') {
      const denied = requireAdmin(event);
      if (denied) return denied;
      const orders = await readArray(getOrdersStore(), 'orders', []);
      return json(200, orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    }

    return json(404, { message: 'API-Endpunkt nicht gefunden.' });
  } catch (error) {
    console.error('Netlify API error:', error);
    if (error.message?.includes('environment has not been configured to use Netlify Blobs')) {
      return json(503, { message: 'Netlify Blobs ist für diese Site noch nicht verfügbar. Prüfe, ob die Site dem Netlify-Projekt zugeordnet ist und die Function im Live-Deploy läuft.' });
    }
    return json(500, { message: 'Ein interner Fehler in der Netlify Function ist aufgetreten.' });
  }
}

export default async function handler(request) {
  const requestBytes = Buffer.from(await request.arrayBuffer());
  const url = new URL(request.url);
  const event = {
    httpMethod: request.method,
    path: url.pathname,
    rawUrl: request.url,
    headers: Object.fromEntries(request.headers.entries()),
    body: requestBytes.length ? requestBytes.toString('base64') : null,
    isBase64Encoded: true
  };
  const result = await handleApiEvent(event);
  const responseBody = result.isBase64Encoded
    ? Buffer.from(result.body || '', 'base64')
    : (result.body || '');
  return new Response(responseBody, {
    status: result.statusCode || 200,
    headers: result.headers || {}
  });
}
