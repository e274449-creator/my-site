document.addEventListener('DOMContentLoaded', () => {
  const year = new Date().getFullYear();
  const brand = document.querySelector('.brand');

  if (brand) {
    brand.textContent = brand.textContent.trim();
  }

  console.log('Neue Website bereit. Jahr:', year);
});
