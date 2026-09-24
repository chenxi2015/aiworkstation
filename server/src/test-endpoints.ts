import { createApp } from './app.js';

async function runTests() {
  const app = createApp();
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✓ ${msg}`);
      passed++;
    } else {
      console.error(`  ✗ ${msg}`);
      failed++;
    }
  }

  console.log('--- Running Server API Architecture & Response Tests ---');

  // Test 1: GET /health (Top-level) -> 200, JSON
  {
    const res = await app.request('/health');
    assert(res.status === 200, 'GET /health returns HTTP 200');
    assert(res.headers.get('content-type')?.includes('application/json') ?? false, 'GET /health returns JSON header');
    const json = await res.json();
    assert(json.code === 0 && json.data.status === 'ok', 'GET /health response body matches ApiResponse standard');
  }

  // Test 2: Global 404 Handler -> 404, JSON
  {
    const res = await app.request('/api/non-existing-route');
    assert(res.status === 404, 'Unknown route returns HTTP 404');
    const json = await res.json();
    assert(json.code === 40401 && json.data === null, 'Unknown route returns standardized error JSON');
  }

  // Test 3: Zod Validation - GET /api/auth/wx/check without ticket -> 400, JSON
  {
    const res = await app.request('/api/auth/wx/check');
    assert(res.status === 400, 'GET /api/auth/wx/check missing ticket returns HTTP 400');
    const json = await res.json();
    assert(json.code === 42201, 'Returns VALIDATION_ERROR code (42201)');
    assert(typeof json.message === 'string' && json.message.includes('ticket'), 'Error message indicates ticket issue');
  }

  // Test 4: Zod Validation - POST /api/pay/create-order without auth -> 401, JSON
  {
    const res = await app.request('/api/pay/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: 'pro_monthly' }),
    });
    assert(res.status === 401, 'POST /api/pay/create-order without token returns HTTP 401');
    const json = await res.json();
    assert(json.code === 40101, 'Returns UNAUTHORIZED code (40101)');
  }

  // Test 5: Zod Validation - POST /api/pay/create-order with invalid body -> 400, JSON
  {
    // Sign a dummy token to pass auth middleware
    const { signJwtToken } = await import('./utils/crypto.js');
    const token = signJwtToken({ userId: 'usr_test_1', openid: 'wx_test_1' });

    const res = await app.request('/api/pay/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}), // Missing planId
    });
    assert(res.status === 400, 'POST /api/pay/create-order with empty body returns HTTP 400');
    const json = await res.json();
    assert(json.code === 42201, 'Returns VALIDATION_ERROR code (42201)');
    assert(json.message.includes('planId'), 'Error message points to planId field');
  }

  // Test 6: GET /api/pay/plans -> 200, JSON
  {
    const res = await app.request('/api/pay/plans');
    assert(res.status === 200, 'GET /api/pay/plans returns HTTP 200');
    const json = await res.json();
    assert(json.code === 0 && Array.isArray(json.data), 'Returns standard ApiResponse with plans array');
  }

  // Test 7: GET /api/auth/wx/qrcode -> 200, JSON
  {
    const res = await app.request('/api/auth/wx/qrcode');
    assert(res.status === 200, 'GET /api/auth/wx/qrcode returns HTTP 200');
    const json = await res.json();
    assert(json.code === 0 && Boolean(json.data.ticket), 'Returns standard ApiResponse with QR ticket data');
  }

  console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
