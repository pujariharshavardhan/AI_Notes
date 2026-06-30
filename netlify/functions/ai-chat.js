exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        hasKey: !!process.env.GROQ_API_KEY,
        keyPrefix: process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.substring(0, 6) : 'NOT SET',
      }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { prompt } = JSON.parse(event.body || '{}');
    if (!prompt) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No prompt provided' }) };

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'AI not configured on server. Set GROQ_API_KEY in Netlify environment variables.' }),
      };
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2048,
        temperature: 0.7,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `Groq error ${res.status}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: data.choices[0].message.content }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
