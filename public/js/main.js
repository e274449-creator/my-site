const productGrid = document.getElementById('productGrid');
const topProducts = document.getElementById('topProducts');
const orderForm = document.getElementById('orderForm');
const formMessage = document.getElementById('formMessage');
const menuToggle = document.querySelector('.menu-toggle');
const hamburgerMenu = document.getElementById('hamburgerMenu');
const adminModal = document.getElementById('adminModal');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminLoginMessage = document.getElementById('adminLoginMessage');
const adminMenuTrigger = document.querySelector('.admin-menu-trigger');
const cartModal = document.getElementById('cartModal');
const bestsellerModal = document.getElementById('bestsellerModal');
const cartItems = document.getElementById('cartItems');
const bestsellerList = document.getElementById('bestsellerList');
const modalCloseButton = document.querySelector('.modal-close');
const cartCloseButton = document.querySelector('.cart-close');
const bestsellerCloseButton = document.querySelector('.bestseller-close');
const cartOpenButtons = document.querySelectorAll('[data-open-cart]');
const bestsellerOpenButtons = document.querySelectorAll('[data-open-bestseller]');

const CART_KEY = 'moom-cart';

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  } catch (error) {
    return [];
  }
}

function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

function openCart() {
  if (!cartModal) return;
  cartModal.classList.remove('hidden');
  cartModal.setAttribute('aria-hidden', 'false');
  renderCart();
}

function closeCart() {
  if (!cartModal) return;
  cartModal.classList.add('hidden');
  cartModal.setAttribute('aria-hidden', 'true');
}

function openBestsellerModal() {
  if (!bestsellerModal) return;
  bestsellerModal.classList.remove('hidden');
  bestsellerModal.setAttribute('aria-hidden', 'false');
  renderBestsellers();
}

function closeBestsellerModal() {
  if (!bestsellerModal) return;
  bestsellerModal.classList.add('hidden');
  bestsellerModal.setAttribute('aria-hidden', 'true');
}

function renderCart() {
  if (!cartItems) return;
  const cart = getCart();

  if (!cart.length) {
    cartItems.innerHTML = '<p class="empty-cart">Dein Warenkorb ist zurzeit leer.</p>';
    return;
  }

  cartItems.innerHTML = cart
    .map((item) => `
      <div class="cart-item">
        <img src="${item.image}" alt="${item.title}" />
        <div class="meta">
          <strong>${item.title}</strong>
          <div>CHF ${Number(item.price).toFixed(2)}</div>
        </div>
        <button type="button" class="small-button danger remove-cart-item" data-id="${item.id}">Entfernen</button>
      </div>
    `)
    .join('');

  cartItems.querySelectorAll('.remove-cart-item').forEach((button) => {
    button.addEventListener('click', () => {
      const nextCart = getCart().filter((item) => item.id !== button.dataset.id);
      saveCart(nextCart);
      renderCart();
    });
  });
}

function renderBestsellers() {
  if (!bestsellerList) return;

  fetch('/api/products')
    .then((response) => response.json())
    .then((products) => {
      const bestsellers = products.filter((product) => product.isBestseller || product.collection === 'Birthday Edition').slice(0, 3);

      if (!bestsellers.length) {
        bestsellerList.innerHTML = '<p class="empty-cart">Noch keine Birthday Edition verfügbar.</p>';
        return;
      }

      bestsellerList.innerHTML = bestsellers
        .map((product) => `
          <div class="bestseller-item">
            <img src="${product.featuredImage || product.images?.[0] || '/uploads/sample-cream.svg'}" alt="${product.title}" />
            <div class="meta">
              <strong>${product.title}</strong>
              <div>${product.collection || 'Birthday Edition'} · CHF ${Number(product.price).toFixed(2)}</div>
            </div>
            <button type="button" class="small-button secondary add-best-product" data-id="${product.id}">Hinzufügen</button>
          </div>
        `)
        .join('');

      bestsellerList.querySelectorAll('.add-best-product').forEach((button) => {
        button.addEventListener('click', () => {
          const item = bestsellers.find((p) => p.id === button.dataset.id);
          if (!item) return;
          addToCart(item);
          openCart();
          closeBestsellerModal();
        });
      });
    })
    .catch(() => {
      bestsellerList.innerHTML = '<p class="empty-cart">Keine Bestseller vorhanden.</p>';
    });
}

function addToCart(product) {
  const cart = getCart();
  const item = {
    id: product.id,
    title: product.title,
    price: Number(product.price || 0),
    image: product.featuredImage || product.images?.[0] || '/uploads/sample-cream.svg'
  };

  const exists = cart.find((entry) => entry.id === item.id);
  if (!exists) {
    cart.push(item);
    saveCart(cart);
  }
}

function toggleMenu() {
  if (!hamburgerMenu || !menuToggle) return;
  const isOpen = hamburgerMenu.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
}

function openAdminModal() {
  if (!adminModal) return;
  adminModal.classList.remove('hidden');
  adminModal.setAttribute('aria-hidden', 'false');
  const input = document.getElementById('adminCode');
  if (input) input.focus();
}

function closeAdminModal() {
  if (!adminModal) return;
  adminModal.classList.add('hidden');
  adminModal.setAttribute('aria-hidden', 'true');
  if (adminLoginMessage) adminLoginMessage.textContent = '';
  const form = document.getElementById('adminLoginForm');
  if (form) form.reset();
}

if (menuToggle) {
  menuToggle.addEventListener('click', toggleMenu);
}

if (adminMenuTrigger) {
  adminMenuTrigger.addEventListener('click', () => {
    toggleMenu();
    openAdminModal();
  });
}

if (modalCloseButton) {
  modalCloseButton.addEventListener('click', closeAdminModal);
}

if (cartCloseButton) {
  cartCloseButton.addEventListener('click', closeCart);
}

if (bestsellerCloseButton) {
  bestsellerCloseButton.addEventListener('click', closeBestsellerModal);
}

if (adminModal) {
  adminModal.addEventListener('click', (event) => {
    if (event.target === adminModal) closeAdminModal();
  });
}

if (adminLoginForm) {
  adminLoginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = document.getElementById('adminCode')?.value || '';
    const submitButton = adminLoginForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    if (adminLoginMessage) adminLoginMessage.textContent = 'Anmeldung wird geprüft …';

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        const message = responseText.trimStart().startsWith('<')
          ? `Netlify hat keine API-Antwort geliefert (HTTP ${response.status}). Bitte prüfe das letzte Deployment der Netlify Function.`
          : `Die Login-Antwort ist ungültig (HTTP ${response.status}).`;
        if (adminLoginMessage) adminLoginMessage.textContent = message;
        return;
      }

      if (adminLoginMessage) {
        adminLoginMessage.textContent = data.message || (response.ok
          ? 'Eingeloggt.'
          : (data.error || `Login fehlgeschlagen (HTTP ${response.status}).`));
      }

      if (response.ok) {
        window.location.href = '/admin';
      }
    } catch (error) {
      if (adminLoginMessage) adminLoginMessage.textContent = `Login-Server nicht erreichbar: ${error.message || 'Netzwerkfehler'}`;
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

if (cartOpenButtons.length) {
  cartOpenButtons.forEach((button) => {
    button.addEventListener('click', () => {
      toggleMenu();
      openCart();
    });
  });
}

if (bestsellerOpenButtons.length) {
  bestsellerOpenButtons.forEach((button) => {
    button.addEventListener('click', () => {
      toggleMenu();
      openBestsellerModal();
    });
  });
}

if (cartModal) {
  cartModal.addEventListener('click', (event) => {
    if (event.target === cartModal) closeCart();
  });
}

if (bestsellerModal) {
  bestsellerModal.addEventListener('click', (event) => {
    if (event.target === bestsellerModal) closeBestsellerModal();
  });
}

async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error('Produkte konnten nicht geladen werden.');

    const products = await response.json();

    const topThree = products.slice(0, 3);

    if (bestsellerList) {
      const bestsellers = products.filter((product) => product.isBestseller || product.collection === 'Birthday Edition').slice(0, 3);
      bestsellerList.innerHTML = bestsellers.length
        ? bestsellers.map((product) => `
          <div class="bestseller-item">
            <img src="${product.featuredImage || product.images?.[0] || '/uploads/sample-cream.svg'}" alt="${product.title}" />
            <div class="meta"><strong>${product.title}</strong><div>${product.collection || 'Birthday Edition'} · CHF ${Number(product.price).toFixed(2)}</div></div>
            <button type="button" class="small-button secondary add-best-product" data-id="${product.id}">Hinzufügen</button>
          </div>
        `).join('')
        : '<p class="empty-cart">Noch keine Birthday Edition verfügbar.</p>';

      bestsellerList.querySelectorAll('.add-best-product').forEach((button) => {
        button.addEventListener('click', () => {
          const selected = products.find((item) => item.id === button.dataset.id);
          if (selected) {
            addToCart(selected);
            openCart();
            closeBestsellerModal();
          }
        });
      });
    }

    if (topProducts) {
      topProducts.innerHTML = topThree
        .map((product) => {
          const image = product.images && product.images[0] ? product.images[0] : product.featuredImage || '/uploads/sample-cream.svg';
          return `
            <article class="product-card">
              <a class="thumbnail" href="/product.html?id=${product.id}">
                <img src="${image}" alt="${product.title}" loading="lazy" />
              </a>
              <div class="content">
                <div class="product-meta">
                  <h3>${product.title}</h3>
                  <span class="price">CHF ${Number(product.price).toFixed(2)}</span>
                </div>
                <span class="status ${product.collection && product.collection !== 'Normal' ? 'reserved' : ''}">${product.collection || 'Normal'}</span>
                <button type="button" class="add-to-cart" data-add-cart="${product.id}">In den Warenkorb</button>
              </div>
            </article>
          `;
        })
        .join('');

      topProducts.querySelectorAll('[data-add-cart]').forEach((button) => {
        button.addEventListener('click', () => {
          const selected = products.find((item) => item.id === button.dataset.addCart);
          if (selected) {
            addToCart(selected);
            openCart();
          }
        });
      });
    }

    if (!productGrid) return;

    productGrid.innerHTML = products
      .map((product) => {
        const image = product.images && product.images[0] ? product.images[0] : product.featuredImage || '/images/placeholder.jpg';
        const statusClass = product.status === 'Verkauft' ? 'sold' : product.status === 'Reserviert' ? 'reserved' : '';
        const productLabel = product.collection || (product.isBestseller ? 'Birthday Edition' : 'Normal');
        return `
          <article class="product-card">
            <a href="/product.html?id=${product.id}">
              <img src="${image}" alt="${product.title}" loading="lazy" />
            </a>
            <div class="content">
              <div class="product-meta">
                <h3>${product.title}</h3>
                <span class="price">CHF ${Number(product.price).toFixed(2)}</span>
              </div>
              <span class="status ${statusClass}">${product.status}</span>
              <span class="status ${productLabel !== 'Normal' ? 'reserved' : ''}" style="margin-top: 0.65rem;">${productLabel}</span>
              <button type="button" class="add-to-cart" data-add-cart="${product.id}">In den Warenkorb</button>
            </div>
          </article>
        `;
      })
      .join('');

    productGrid.querySelectorAll('[data-add-cart]').forEach((button) => {
      button.addEventListener('click', () => {
        const selected = products.find((item) => item.id === button.dataset.addCart);
        if (selected) {
          addToCart(selected);
          openCart();
        }
      });
    });
  } catch (error) {
    if (topProducts) topProducts.innerHTML = '<p>Aktuell sind keine Top-3 Produkte verfügbar.</p>';
    if (productGrid) productGrid.innerHTML = '<p>Aktuell sind keine Produkte verfügbar.</p>';
  }
}

if (orderForm) {
  orderForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(orderForm);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      formMessage.textContent = data.message || 'Deine Anfrage wurde gesendet.';

      if (response.ok) {
        orderForm.reset();
      }
    } catch (error) {
      formMessage.textContent = 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.';
    }
  });
}

loadProducts();
