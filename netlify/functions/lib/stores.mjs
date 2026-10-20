import { getStore } from '@netlify/blobs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const localRoot = path.join(process.cwd(), '.netlify', 'local-blobs');
const isNetlifyRuntime = Boolean(
  process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.CONTEXT || process.env.NETLIFY_BLOBS_CONTEXT
);
const useLocalFiles = process.env.MOOM_LOCAL_BLOBS === 'true' || (!isNetlifyRuntime && process.env.NODE_ENV !== 'production');

function safeKey(key) {
  return Buffer.from(String(key)).toString('base64url');
}

function localStore(name) {
  const directory = path.join(localRoot, name);
  const dataPath = (key) => path.join(directory, `${safeKey(key)}.data`);
  const metadataPath = (key) => path.join(directory, `${safeKey(key)}.json`);

  return {
    async get(key, options = {}) {
      try {
        const data = await readFile(dataPath(key), 'utf8');
        return options.type === 'json' ? JSON.parse(data) : data;
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
    async setJSON(key, value) {
      await mkdir(directory, { recursive: true });
      await writeFile(dataPath(key), JSON.stringify(value), 'utf8');
    },
    async set(key, value, options = {}) {
      await mkdir(directory, { recursive: true });
      await writeFile(dataPath(key), Buffer.from(value));
      await writeFile(metadataPath(key), JSON.stringify(options.metadata || {}), 'utf8');
    },
    async getWithMetadata(key) {
      try {
        const [data, metadata] = await Promise.all([
          readFile(dataPath(key)),
          readFile(metadataPath(key), 'utf8').then(JSON.parse).catch(() => ({}))
        ]);
        return { data: Uint8Array.from(data).buffer, metadata };
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    }
  };
}

export function getMoomStore(name) {
  return useLocalFiles ? localStore(name) : getStore(name);
}
