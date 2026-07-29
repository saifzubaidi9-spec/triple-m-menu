const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

const MAX_TEXT = 120;
const MAX_LINE_ITEMS = 50;

// Every operation on this endpoint requires the key — unlike orders.js,
// there's no "public open POST" case here: only the owners themselves
// ever create an expense record.
function isAuthorized(event) {
  const expected = process.env.EXPENSES_ADMIN_KEY;
  if (!expected) return false;
  const header = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  if (!header.startsWith('Bearer ')) return false;
  const provided = header.slice(7);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function clip(str, max) {
  return String(str || '').trim().slice(0, max);
}

function makeId() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase();
}

function expensesStore() {
  return getStore({
    name: 'expenses',
    siteID: process.env.BLOBS_SITE_ID,
    token: process.env.BLOBS_TOKEN,
  });
}

async function listAll(store) {
  const { blobs } = await store.list();
  const records = await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })));
  const owners = records.filter((r) => r && r.recordType === 'owner');
  const invoices = records.filter((r) => r && r.recordType === 'invoice');
  return json(200, { owners, invoices });
}

function computeTotal(lineItems) {
  return lineItems.reduce((sum, li) => sum + (Number(li.price) || 0), 0);
}

// Callers must preserve each line item's existing id when sending an
// updated lineItems array back — omit id (or pass an empty string) only
// for a genuinely new line item; anything else gets a fresh makeId()
// here, which would silently orphan the old id if a caller forgot to
// round-trip it.
function sanitizeLineItems(rawItems) {
  const items = Array.isArray(rawItems) ? rawItems.slice(0, MAX_LINE_ITEMS) : [];
  return items.map((it) => ({
    id: clip(it.id, MAX_TEXT) || makeId(),
    product: clip(it.product, MAX_TEXT),
    qty: clip(it.qty, MAX_TEXT),
    price: Number(it.price) || 0,
  }));
}

async function createRecord(store, payload) {
  const recordType = payload.recordType === 'owner' ? 'owner' : payload.recordType === 'invoice' ? 'invoice' : null;
  if (!recordType) return json(400, { error: 'recordType must be "owner" or "invoice".' });

  const now = Date.now();
  let record;

  if (recordType === 'owner') {
    const name = clip(payload.name, MAX_TEXT);
    record = { id: makeId(), recordType: 'owner', name, hidden: false, createdAt: now, updatedAt: now };
  } else {
    const ownerId = clip(payload.ownerId, MAX_TEXT);
    if (!ownerId) return json(400, { error: 'Invoice ownerId is required.' });
    const name = clip(payload.name, MAX_TEXT);
    const date = clip(payload.date, 20);
    const lineItems = sanitizeLineItems(payload.lineItems);
    record = {
      id: makeId(), recordType: 'invoice', ownerId, name, date,
      lineItems, total: computeTotal(lineItems),
      createdAt: now, updatedAt: now,
    };
  }

  await store.setJSON(record.id, record);
  return json(201, record);
}

async function updateRecord(store, payload) {
  const id = clip(payload.id, MAX_TEXT);
  if (!id) return json(400, { error: 'Record id is required.' });

  const existing = await store.get(id, { type: 'json' });
  if (!existing) return json(404, { error: 'Record not found.' });

  const updated = Object.assign({}, existing);
  if (existing.recordType === 'owner') {
    if (payload.name !== undefined) updated.name = clip(payload.name, MAX_TEXT);
    if (payload.hidden !== undefined) updated.hidden = !!payload.hidden;
  } else {
    if (payload.name !== undefined) updated.name = clip(payload.name, MAX_TEXT);
    if (payload.date !== undefined) updated.date = clip(payload.date, 20);
    if (payload.lineItems !== undefined) {
      updated.lineItems = sanitizeLineItems(payload.lineItems);
      updated.total = computeTotal(updated.lineItems);
    }
  }
  updated.updatedAt = Date.now();

  await store.setJSON(id, updated);
  return json(200, updated);
}

async function deleteRecord(store, id) {
  if (!id) return json(400, { error: 'Record id is required.' });
  await store.delete(id);
  return json(200, { ok: true });
}

exports.handler = async (event) => {
  const store = expensesStore();

  try {
    if (!isAuthorized(event)) return json(401, { error: 'Unauthorized.' });

    if (event.httpMethod === 'GET') return await listAll(store);
    if (event.httpMethod === 'POST') return await createRecord(store, JSON.parse(event.body || '{}'));
    if (event.httpMethod === 'PATCH') return await updateRecord(store, JSON.parse(event.body || '{}'));
    if (event.httpMethod === 'DELETE') {
      const id = clip((event.queryStringParameters || {}).id, MAX_TEXT);
      return await deleteRecord(store, id);
    }

    return json(405, { error: 'Method not allowed.' });
  } catch (err) {
    return json(500, { error: 'Server error: ' + err.message });
  }
};
