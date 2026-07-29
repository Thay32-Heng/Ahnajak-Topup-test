export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  if (!url.pathname.startsWith('/api/') && url.pathname !== '/api' && !url.pathname.startsWith('/uploads/')) {
    return context.next();
  }
  
  const isBodyless = context.request.method === 'GET' || context.request.method === 'HEAD';
  const body = isBodyless ? undefined : await context.request.arrayBuffer();

  const vpsIp = context.env.VPS_INTERNAL_IP;
  if (!vpsIp) {
    return new Response(JSON.stringify({ error: 'VPS_INTERNAL_IP not configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    });
  }

  for (const port of [3010, 80]) {
    try {
      const apiTarget = `http://${vpsIp}:${port}${url.pathname}${url.search}`;
      const response = await fetch(apiTarget, {
        method: context.request.method,
        headers: {
          'Content-Type': context.request.headers.get('Content-Type') || '',
          'Authorization': context.request.headers.get('Authorization') || '',
          'Host': 'localhost:3010',
          'X-Forwarded-Host': url.host,
          'X-Forwarded-Proto': 'https',
        },
        body,
      });

      const respHeaders = new Headers(response.headers);
      respHeaders.set('access-control-allow-origin', '*');
      respHeaders.set('access-control-allow-methods', '*');
      respHeaders.set('access-control-allow-headers', '*');

      return new Response(response.body, {
        status: response.status,
        headers: respHeaders,
      });
    } catch (e) {
      continue;
    }
  }

  return new Response(JSON.stringify({ error: 'Cannot reach VPS' }), {
    status: 502,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  });
}
