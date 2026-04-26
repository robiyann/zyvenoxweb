const axios = require('axios');
const API_URL = 'http://127.0.0.1:3721';

async function test() {
  console.log('🚀 Starting Token System Verification...');
  
  try {
    // 1. Get Domains
    console.log('\n--- 1. Fetching Domains ---');
    const domainsRes = await axios.get(`${API_URL}/api/domains`);
    const domain = domainsRes.data.domains[0];
    console.log('Selected domain:', domain);

    // 2. Generate Mailbox
    console.log('\n--- 2. Generating Mailbox ---');
    const genRes = await axios.post(`${API_URL}/api/mailboxes/generate`, { domain });
    const { address, token } = genRes.data;
    console.log('Address:', address);
    console.log('Token:', token);
    
    if (!token) throw new Error('Token not returned!');
    if (!token.startsWith(domain.split('.')[0])) throw new Error('Token format invalid!');

    // 3. Fetch emails via token (should be empty)
    console.log('\n--- 3. Fetching Inbox via Token ---');
    const inboxRes = await axios.get(`${API_URL}/api/mailboxes/token/${token}`);
    console.log('Inbox count:', inboxRes.data.count);
    if (inboxRes.data.count !== 0) throw new Error('Inbox should be empty!');
    if (inboxRes.data.address !== address) throw new Error('Address mismatch in token response!');

    // 4. Test Invalid Token
    console.log('\n--- 4. Testing Invalid Token ---');
    try {
      await axios.get(`${API_URL}/api/mailboxes/token/invalid_token_123`);
      throw new Error('Should have failed with 404');
    } catch (err) {
      if (err.response?.status === 404) {
        console.log('PASS: Invalid token rejected correctly.');
      } else {
        throw err;
      }
    }

    console.log('\n✅ ALL TOKEN API TESTS PASSED!');
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    if (err.response) console.error('Response:', err.response.data);
    process.exit(1);
  }
}

test();
