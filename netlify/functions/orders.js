const { getStore } = require('@netlify/blobs');

const VALID_STATUSES = ['new', 'preparing', 'done', 'cancelled'];
const MAX_ITEMS = 30;
const MAX_TEXT = 120;
const MAX_NOTE = 200;

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

function makeOrderId() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase();
}

async function listOrders(store) {
  const { blobs } = await store.list();
  const orders = await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })));
  orders.sort((a, b) => b.createdAt - a.createdAt);
  return json(200, { orders });
}

async function createOrder(store, payload) {
  const studentName = clip(payload.studentName, MAX_TEXT);
  const studentNumber = clip(payload.studentNumber, MAX_TEXT);
  const rawItems = Array.isArray(payload.items) ? payload.items.slice(0, MAX_ITEMS) : [];

  if (!studentName) return json(400, { error: 'Student name is required.' });
  if (!studentNumber) return json(400, { error: 'Student number is required.' });
  if (rawItems.length === 0) return json(400, { error: 'Order has no items.' });

  const items = [];
  for (const it of rawItems) {
    const price = Number(it.price);
    const name = clip(it.name, MAX_TEXT);
    const itemId = clip(it.itemId, MAX_TEXT);
    if (!name || !itemId || !Number.isFinite(price) || price < 0) {
      return json(400, { error: 'One of the order items is invalid.' });
    }
    items.push({ itemId, name, price, notes: clip(it.notes, MAX_NOTE) });
  }

  const total = items.reduce((sum, it) => sum + it.price, 0);
  const order = {
    id: makeOrderId(),
    studentName,
    studentNumber,
    items,
    total,
    status: 'new',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await store.setJSON(order.id, order);
  return json(201, { id: order.id, total: order.total });
}

async function updateStatus(store, payload) {
  const id = clip(payload.id, MAX_TEXT);
  const status = clip(payload.status, 20);

  if (!id) return json(400, { error: 'Order id is required.' });
  if (!VALID_STATUSES.includes(status)) return json(400, { error: 'Invalid status.' });

  const order = await store.get(id, { type: 'json' });
  if (!order) return json(404, { error: 'Order not found.' });

  order.status = status;
  order.updatedAt = Date.now();
  await store.setJSON(id, order);
  return json(200, { ok: true });
}

function ordersStore() {
  // CLI/CI-triggered deploys don't get the Blobs context auto-injected
  // the way a native Netlify Git build does, so it's supplied explicitly.
  return getStore({
    name: 'orders',
    siteID: process.env.BLOBS_SITE_ID,
    token: process.env.BLOBS_TOKEN,
  });
}

exports.handler = async (event) => {
  const store = ordersStore();

  try {
    if (event.httpMethod === 'GET') {
      return await listOrders(store);
    }

    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      return await createOrder(store, payload);
    }

    if (event.httpMethod === 'PATCH') {
      const payload = JSON.parse(event.body || '{}');
      return await updateStatus(store, payload);
    }

    return json(405, { error: 'Method not allowed.' });
  } catch (err) {
    return json(500, { error: 'Server error: ' + err.message });
  }
};
