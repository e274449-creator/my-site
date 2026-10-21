import { getMoomStore } from './lib/stores.mjs';

export default async function handler(request) {
  const prefix = '/.netlify/functions/media/';
  const routePath = new URL(request.url).pathname;
  const key = decodeURIComponent(routePath.includes(prefix) ? routePath.slice(routePath.indexOf(prefix) + prefix.length) : routePath.replace(/^\/media\//, ''));
  if (!key || key.includes('/') || key.includes('..')) {
    return new Response('Ungültige Bildadresse.', { status: 400 });
  }

  try {
    const imagesStore = getMoomStore('moom-images');
    const result = await imagesStore.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!result) return new Response('Bild nicht gefunden.', { status: 404 });
    return new Response(result.data, {
      status: 200,
      headers: {
        'Content-Type': result.metadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch (error) {
    console.error('Netlify media error:', error);
    return new Response('Bild konnte nicht geladen werden.', { status: 500 });
  }
}
