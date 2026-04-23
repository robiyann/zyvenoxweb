export default {
  async email(message, env, ctx) {
    try {
      // Stream raw email and convert to text
      const raw = await streamToText(message.raw);
      
      // Hit local tunnel backend! 
      // Ensure you set INBOUND_URL and INBOUND_SECRET in CF worker variables
      const response = await fetch(env.INBOUND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Inbound-Secret': env.INBOUND_SECRET
        },
        body: JSON.stringify({
          to: message.to,
          from: message.from,
          raw: raw
        })
      });

      if (!response.ok) {
        console.error('Failed to forward email. Backend responded:', response.status);
        message.setReject('Failed to accept email locally.');
      }
    } catch (err) {
      console.error('Error forwarding email:', err);
      message.setReject('Internal worker exception.');
    }
  }
};

// Helper stream to text
async function streamToText(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let result = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode(); // flush remaining

  return result;
}
