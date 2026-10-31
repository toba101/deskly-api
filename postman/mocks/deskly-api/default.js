const http = require('http');

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

// --- Seed data ---

const DESKS = [
  { id: 'desk-1', name: 'Desk 1A', zone: 'north', floor: 1, available: true },
  { id: 'desk-2', name: 'Desk 2B', zone: 'south', floor: 2, available: true },
  { id: 'desk-3', name: 'Desk 3C', zone: 'quiet', floor: 3, available: true },
  { id: 'desk-4', name: 'Desk 4D', zone: 'north', floor: 1, available: false },
];

const BOOKINGS = [
  {
    id: 'bkg_seed01',
    deskId: 'desk-1',
    date: '2026-11-01',
    bookedBy: 'alice@example.com',
    status: 'confirmed',
    createdAt: '2026-10-20T09:00:00Z',
  },
  {
    id: 'bkg_seed02',
    deskId: 'desk-2',
    date: '2026-11-02',
    bookedBy: 'bob@example.com',
    status: 'confirmed',
    createdAt: '2026-10-21T10:30:00Z',
  },
];

// --- Auth helper ---

function requireApiKey(req, res) {
  const key = req.headers['x-api-key'];
  if (!key) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'UNAUTHORIZED', message: 'Missing X-API-Key header' }));
    return false;
  }
  return true;
}

// --- Server ---

const server = http.createServer(async (req, res) => {
  const method = req.method;
  const rawUrl = req.url;
  const urlObj = new URL(rawUrl, 'http://localhost');
  const pathname = urlObj.pathname;

  // @endpoint GET /health
  if (method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'deskly-mock', timestamp: new Date().toISOString() }));
    return;
  }

  // @endpoint GET /desks
  if (method === 'GET' && pathname === '/desks') {
    if (!requireApiKey(req, res)) return;
    const zone = urlObj.searchParams.get('zone');
    const result = zone ? DESKS.filter((d) => d.zone === zone) : DESKS;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ desks: result, total: result.length }));
    return;
  }

  // @endpoint GET /desks/:id
  const deskMatch = pathname.match(/^\/desks\/([^/?]+)$/);
  if (method === 'GET' && deskMatch) {
    if (!requireApiKey(req, res)) return;
    const desk = DESKS.find((d) => d.id === deskMatch[1]);
    if (!desk) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'NOT_FOUND', message: `Desk '${deskMatch[1]}' not found` }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(desk));
    return;
  }

  // @endpoint GET /bookings
  if (method === 'GET' && pathname === '/bookings') {
    if (!requireApiKey(req, res)) return;
    const dateFilter = urlObj.searchParams.get('date');
    const deskFilter = urlObj.searchParams.get('deskId');
    let result = [...BOOKINGS];
    if (dateFilter) result = result.filter((b) => b.date === dateFilter);
    if (deskFilter) result = result.filter((b) => b.deskId === deskFilter);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ bookings: result, total: result.length }));
    return;
  }

  // @endpoint POST /bookings
  if (method === 'POST' && pathname === '/bookings') {
    if (!requireApiKey(req, res)) return;
    const raw = await readBody(req);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'BAD_REQUEST', message: 'Request body must be valid JSON' }));
      return;
    }

    const { deskId, date, bookedBy } = body;
    if (!deskId || !date || !bookedBy) {
      res.writeHead(422, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'deskId, date, and bookedBy are required' }));
      return;
    }

    const desk = DESKS.find((d) => d.id === deskId);
    if (!desk) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'NOT_FOUND', message: `Desk '${deskId}' not found` }));
      return;
    }

    const conflict = BOOKINGS.find((b) => b.deskId === deskId && b.date === date && b.status !== 'cancelled');
    if (conflict) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'CONFLICT', message: `Desk '${deskId}' is already booked on ${date}` }));
      return;
    }

    const newBooking = {
      id: 'bkg_' + Date.now(),
      deskId,
      date,
      bookedBy,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };
    BOOKINGS.push(newBooking);

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(newBooking));
    return;
  }

  // @endpoint GET /bookings/:id
  const bookingMatch = pathname.match(/^\/bookings\/([^/?]+)$/);
  if (method === 'GET' && bookingMatch) {
    if (!requireApiKey(req, res)) return;
    const booking = BOOKINGS.find((b) => b.id === bookingMatch[1]);
    if (!booking) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'NOT_FOUND', message: `Booking '${bookingMatch[1]}' not found` }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(booking));
    return;
  }

  // @endpoint DELETE /bookings/:id
  if (method === 'DELETE' && bookingMatch) {
    if (!requireApiKey(req, res)) return;
    const idx = BOOKINGS.findIndex((b) => b.id === bookingMatch[1]);
    if (idx === -1) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'NOT_FOUND', message: `Booking '${bookingMatch[1]}' not found` }));
      return;
    }
    BOOKINGS[idx] = { ...BOOKINGS[idx], status: 'cancelled' };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ deleted: true, id: bookingMatch[1] }));
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'NOT_FOUND', message: 'Route not found' }));
});

server.listen(process.env.PORT || 4000);
