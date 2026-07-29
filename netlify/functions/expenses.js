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

exports.handler = async (event) => {
  const store = expensesStore();

  try {
    if (!isAuthorized(event)) return json(401, { error: 'Unauthorized.' });

    if (event.httpMethod === 'GET') return await listAll(store);

    return json(405, { error: 'Method not allowed.' });
  } catch (err) {
    return json(500, { error: 'Server error: ' + err.message });
  }
};
