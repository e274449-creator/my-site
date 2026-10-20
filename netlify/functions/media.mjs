import { getMoomStore } from './lib/stores.mjs';

export const handler = async (event) => {
  const prefix = '/.netlify/functions/media/';
  const routePath = event.path || '';
  const key = decodeURIComponent(routePath.includes(prefix) ? routePath.slice(routePath.indexOf(prefix) + prefix.length) : routePath.replace(/^\/media\//, ''));
  if (!key || key.includes('/') || key.includes('..')) {
    return { statusCode: 400, body: 'Ungültige Bildadresse.' };
  }

  try {
    const imagesStore = getMoomStore('moom-images');
    const result = await imagesStore.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!result) return { statusCode: 404, body: 'Bild nicht gefunden.' };
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        'Content-Type': result.metadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff'
      },
      body: Buffer.from(result.data).toString('base64')
    };
  } catch (error) {
    console.error('Netlify media error:', error);
    return { statusCode: 500, body: 'Bild konnte nicht geladen werden.' };
  }
};
