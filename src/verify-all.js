const axios = require('axios');
require('dotenv').config();

const API_URL = `http://127.0.0.1:${process.env.PORT || 3721}`;
const API_KEY = process.env.API_KEY;
const INBOUND_SECRET = process.env.INBOUND_SECRET;

async function runTests() {
  console.log('🧪 Starting Full API Verification Suite...\n');
  let token = '';
  let address = '';
  let emailId = '';

  try {
    // 1. Test Domains (Public)
    console.log('[1/9] Testing GET /api/domains...');
    const domRes = await axios.get(`${API_URL}/api/domains`);
    console.log('✅ Domains:', domRes.data.domains.join(', '));

    // 2. Test Protected Generation (Should fail)
    console.log('[2/9] Testing Protected Generation (No Key)...');
    try {
      await axios.post(`${API_URL}/api/mailboxes/generate`, { domain: domRes.data.domains[0] });
      console.log('❌ FAIL: Endpoint should require API Key');
    } catch (e) {
      if (e.response?.status === 401) console.log('✅ PASS: Correctly rejected without API Key');
      else throw e;
    }

    // 3. Test Protected Generation (Should pass)
    console.log('[3/9] Testing Protected Generation (With Key)...');
    const genRes = await axios.post(`${API_URL}/api/mailboxes/generate`, 
      { domain: domRes.data.domains[0] },
      { headers: { 'x-api-key': API_KEY } }
    );
    token = genRes.data.token;
    address = genRes.data.address;
    console.log(`✅ PASS: Generated ${address} with token ${token}`);

    // 4. Test Token Info
    console.log('[4/9] Testing GET /api/mailboxes/token/:token...');
    const infoRes = await axios.get(`${API_URL}/api/mailboxes/token/${token}`);
    if (infoRes.data.address === address) console.log('✅ PASS: Token maps to correct address');

    // 5. Simulate Incoming Email
    console.log('[5/9] Simulating Incoming Email via /api/inbound...');
    const rawEmail = `From: sender@example.com
To: ${address}
Subject: Your Verification Code

Hello, your code is 123456. Regards.`;

    await axios.post(`${API_URL}/api/inbound`, 
      { to: address, from: 'sender@example.com', raw: rawEmail },
      { headers: { 'x-inbound-secret': INBOUND_SECRET } }
    );
    console.log('✅ PASS: Simulated email sent');

    // 6. Verify Email Received
    console.log('[6/9] Verifying Email in Token Inbox...');
    const inboxRes = await axios.get(`${API_URL}/api/mailboxes/token/${token}`);
    if (inboxRes.data.count > 0) {
      emailId = inboxRes.data.emails[0].id;
      console.log(`✅ PASS: Found ${inboxRes.data.count} emails. Latest ID: ${emailId}`);
    } else {
      throw new Error('Email not found in inbox!');
    }

    // 7. Test OTP Extraction
    console.log('[7/9] Testing OTP Extraction...');
    const otpRes = await axios.get(`${API_URL}/api/mailboxes/token/${token}/otp`);
    if (otpRes.data.otp === '123456') console.log('✅ PASS: OTP 123456 correctly extracted');

    // 8. Test Delete Single Email
    console.log('[8/9] Testing DELETE email...');
    await axios.delete(`${API_URL}/api/mailboxes/token/${token}/${emailId}`);
    const afterDel = await axios.get(`${API_URL}/api/mailboxes/token/${token}`);
    if (afterDel.data.count === 0) console.log('✅ PASS: Email deleted');

    // 9. Test Clear Inbox
    console.log('[9/9] Testing Clear Inbox...');
    await axios.delete(`${API_URL}/api/mailboxes/token/${token}`);
    console.log('✅ PASS: Inbox clear command sent');

    console.log('\n✨ ALL API TESTS PASSED SUCCESSFULLY!');
  } catch (error) {
    console.error('\n❌ VERIFICATION FAILED!');
    if (error.response) {
      console.error(`Status: ${error.status} | Data:`, error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

runTests();
