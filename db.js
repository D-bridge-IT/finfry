// FinFry — хранилище в IndexedDB. Все данные остаются в браузере пользователя.
const NAME = 'finfry', VERSION = 1;
const STORES = ['kv', 'entries', 'docs', 'blobs', 'chat'];
let opening;

function open() {
  return opening ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES)
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, s === 'kv' ? undefined : { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
export const get = (store, key) => run(store, 'readonly', s => s.get(key));
export const all = store => run(store, 'readonly', s => s.getAll());
export const put = (store, value, key) => run(store, 'readwrite', s => key === undefined ? s.put(value) : s.put(value, key));
export const del = (store, key) => run(store, 'readwrite', s => s.delete(key));
export const clear = store => run(store, 'readwrite', s => s.clear());
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const toDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
const fromDataURL = async url => (await fetch(url)).blob();

/** Полная резервная копия одним JSON (документы — внутри, в base64) */
export async function exportAll() {
  const docs = await all('docs'), out = [];
  for (const d of docs) {
    const b = await get('blobs', d.id);
    out.push({ ...d, data: b ? await toDataURL(b.blob) : null });
  }
  return { app: 'finfry', version: 1, exported: new Date().toISOString(),
           profile: await get('kv', 'profile'), entries: await all('entries'), docs: out };
}
export async function importAll(data) {
  if (!data || data.app !== 'finfry' || !Array.isArray(data.entries)) throw new Error('Это не резервная копия FinFry');
  for (const s of ['entries', 'docs', 'blobs']) await clear(s);
  if (data.profile) await put('kv', data.profile, 'profile');
  for (const e of data.entries) if (e && e.id) await put('entries', e);
  for (const d of data.docs || []) {
    if (!d || !d.id) continue;
    const { data: url, ...meta } = d;
    await put('docs', meta);
    if (url) await put('blobs', { id: d.id, blob: await fromDataURL(url) });
  }
}
export async function wipe() { for (const s of STORES) await clear(s); }
