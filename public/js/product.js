const productDetail = document.getElementById('productDetail');

function getProductIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

async function loadSingleProduct() {
  const productId = getProductIdFromUrl();
  if (!productId) {
    productDetail.innerHTML = '<p>Kein Produkt ausgewählt.</p>';
    return;
  }

  try {
    const response = await fetch(`/api/products/${productId}`);
    if (!response.ok) throw new Error('Produkt nicht gefunden');

    const product = await response.json();
    const images = Array.isArray(product.images) && product.images.length ? product.images : [product.featuredImage || '/images/placeholder.jpg'];
    const mainImage = product.featuredImage || images[0];
    const collection = product.collection || 'Normal';
    const isAvailable = product.status === 'Verfügbar';

    productDetail.innerHTML = `
      <div class="gallery">
        <div class="gallery-main">
          <img src="${mainImage}" alt="${product.title}" id="mainProductImage" />
        </div>
        <div class="gallery-thumbs">
          ${images
            .map(
              (image, index) => `
                <button class="gallery-thumb" type="button" data-image="${image}" aria-label="Bild ${index + 1} anzeigen">
                  <img src="${image}" alt="${product.title} Bild ${index + 1}" />
                </button>
              `
            )
            .join('')}
        </div>
      </div>

      <div class="product-info">
        <p class="eyebrow">1/1 Unikat</p>
        <h1>${product.title}</h1>
        <span class="status ${collection === 'Normal' ? '' : 'reserved'}">${collection}</span>
        <p class="price">CHF ${Number(product.price).toFixed(2)}</p>
        <span class="status ${product.status === 'Verkauft' ? 'sold' : product.status === 'Reserviert' ? 'reserved' : ''}">${product.status}</span>

        <div class="meta-list">
          <div><strong>Grösse:</strong> ${product.size}</div>
          <div><strong>Zustand:</strong> ${product.condition}</div>
          <div><strong>Modell:</strong> ${product.model}</div>
          <div><strong>Materialien:</strong> ${product.materials}</div>
        </div>

        <p>${product.description}</p>

        ${isAvailable ? `
          <a href="#purchasePanel" class="button primary">Personalisieren &amp; zur Kaufansicht</a>
          <section class="purchase-panel" id="purchasePanel">
            <p class="eyebrow">Deine Kaufansicht</p>
            <h2>${product.title}</h2>
            <p id="purchaseProductSummary">Einmaliges Paar · Grösse ${product.size} · CHF ${Number(product.price).toFixed(2)}</p>
            <p class="purchase-note">Mit dem Absenden wird das Unikat für dich reserviert. Wir bestätigen die Bestellung und Zahlungsdetails persönlich, bevor etwas angefertigt wird.</p>
            <form id="personalizationForm" class="order-form">
              <label>Name<input type="text" name="name" autocomplete="name" required /></label>
              <label>E-Mail<input type="email" name="email" autocomplete="email" required /></label>
              <label>Produkt auswählen
                <select name="productId" id="purchaseProductSelect" required>
                  <option value="${product.id}" selected>${product.title} · Grösse ${product.size} · CHF ${Number(product.price).toFixed(2)}</option>
                </select>
              </label>
              <label>Gewünschter Aufdruck (max. 50 Zeichen)<input type="text" name="customText" maxlength="50" placeholder="z. B. Nils" required /></label>
              <label>Zusätzliche Nachricht (optional)<textarea name="message" rows="3" placeholder="Noch ein Wunsch oder eine Frage?"></textarea></label>
              <button type="submit" class="button primary">Bestellung anfragen &amp; Unikat reservieren</button>
              <p id="personalizationMessage" class="form-message" aria-live="polite"></p>
            </form>
          </section>
        ` : '<p class="purchase-note">Dieses Unikat ist aktuell nicht verfügbar.</p>'}
      </div>
    `;

    const thumbButtons = document.querySelectorAll('.gallery-thumb');
    const mainProductImage = document.getElementById('mainProductImage');
    thumbButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const image = button.dataset.image;
        if (mainProductImage && image) mainProductImage.src = image;
      });
    });

    const personalizationForm = document.getElementById('personalizationForm');
    if (personalizationForm) {
      const productSelect = document.getElementById('purchaseProductSelect');
      const productSummary = document.getElementById('purchaseProductSummary');
      fetch('/api/products')
        .then((productsResponse) => productsResponse.json())
        .then((products) => {
          products.filter((item) => item.status === 'Verfügbar').forEach((item) => {
            if (item.id === product.id) return;
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.title} · Grösse ${item.size} · CHF ${Number(item.price).toFixed(2)}`;
            productSelect.appendChild(option);
          });
        });

      productSelect.addEventListener('change', () => {
        const selectedProduct = productSelect.options[productSelect.selectedIndex];
        productSummary.textContent = selectedProduct.textContent;
      });

      personalizationForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitButton = personalizationForm.querySelector('button[type="submit"]');
        const message = document.getElementById('personalizationMessage');
        const formData = new FormData(personalizationForm);
        const payload = Object.fromEntries(formData.entries());
        submitButton.disabled = true;

        try {
          const orderResponse = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const result = await orderResponse.json();
          if (!orderResponse.ok) throw new Error(result.message || 'Die Bestellung konnte nicht gesendet werden.');

          document.getElementById('purchasePanel').innerHTML = `
            <p class="eyebrow">Bestellung vorgemerkt</p>
            <h2>Danke, ${payload.name}.</h2>
            <p>${result.message}</p>
            <div class="purchase-summary">
              <strong>${result.order.productTitle}</strong>
              <span>Aufdruck: ${payload.customText}</span>
              <span>${productSelect.options[productSelect.selectedIndex].textContent}</span>
              <span>Status: Zahlung ausstehend</span>
            </div>
            <p class="purchase-note">Es wurde noch keine Zahlung ausgelöst. Wir melden uns unter ${payload.email}, um die Bestellung und Zahlung mit dir abzuschliessen.</p>
            <a href="/#shop" class="button primary">Zurück zum Shop</a>
          `;
          document.getElementById('purchasePanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (error) {
          message.textContent = error.message || 'Fehler beim Senden. Bitte versuche es erneut.';
          submitButton.disabled = false;
        }
      });
    }
  } catch (error) {
    productDetail.innerHTML = '<p>Dieses Produkt konnte nicht geladen werden.</p>';
  }
}

loadSingleProduct();
