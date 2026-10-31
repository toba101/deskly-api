const http = require('http');

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

const server = http.createServer(async (req, res) => {
  const method = req.method;
  const url = req.url;

  // @endpoint GET /health
  if (method === 'GET' && url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'payments-mock' }));
    return;
  }

  // @endpoint POST /charge
  if (method === 'POST' && url === '/charge') {
    await readBody(req);

    const attempt = await pm.state.increment('payments:charge:attempts');

    if (attempt % 3 === 0) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'PAYMENT_GATEWAY_ERROR',
        message: 'Internal payment processor failure',
        attempt
      }));
      return;
    }

    if (attempt % 3 === 1 && attempt > 1) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        chargeId: 'ch_' + Date.now(),
        status: 'succeeded',
        attempt,
        note: 'Recovered after gateway error'
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      chargeId: 'ch_' + Date.now(),
      status: 'succeeded',
      attempt
    }));
    return;
  }

  // @endpoint DELETE /charge/state
  if (method === 'DELETE' && url === '/charge/state') {
    await pm.state.delete('payments:charge:attempts');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ reset: true, message: 'Attempt counter cleared' }));
    return;
  }

  // @endpoint GET /charge/:chargeId
  const chargeMatch = url.match(/^\/charge\/([^/?]+)$/);
  if (method === 'GET' && chargeMatch) {
    const chargeId = chargeMatch[1];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      chargeId,
      status: 'succeeded',
      amount: 5000,
      currency: 'usd'
    }));
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'NOT_FOUND', message: 'Route not found' }));
});

server.listen(process.env.PORT || 3000);
