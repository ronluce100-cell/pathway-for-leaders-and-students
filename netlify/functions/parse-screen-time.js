exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { image, mimeType } = body;
  if (!image || !mimeType) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing image or mimeType' }) };
  }

  const prompt = `This is a screenshot of a phone's Screen Time (iPhone) or Digital Wellbeing (Android) report.

Extract the average HOURS PER DAY spent in each of these four categories. Use your best judgment to map what you see to these categories:

1. tv — TV & Streaming: Netflix, Hulu, Disney+, Apple TV, HBO Max, Peacock, Paramount+, Prime Video, any video streaming app, "Entertainment" category total
2. youtube — YouTube & Online Video: YouTube app specifically, YouTube Music, Twitch
3. social — Social Media: Instagram, TikTok, Facebook, Snapchat, Twitter/X, BeReal, Pinterest, Reddit, "Social Networking" category total
4. games — Video Games: any game apps, "Games" category total

Rules:
- Convert time to decimal hours (1h 30m = 1.5, 45m = 0.75, 2h = 2.0)
- If Screen Time shows a WEEKLY total, divide by 7 to get daily average
- If a category has no apps visible, use 0
- If you see a "Daily Average" section, use those numbers
- Return ONLY valid JSON — no explanation, no markdown, just the JSON object

Return exactly this format:
{"tv": X, "youtube": X, "social": X, "games": X}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: image } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();
    const text = (data.content && data.content[0] && data.content[0].text) || '{}';

    const jsonMatch = text.match(/\{[^}]+\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { tv: 0, youtube: 0, social: 0, games: 0 };

    const result = {
      tv:     Math.round((parseFloat(parsed.tv)     || 0) * 10) / 10,
      youtube:Math.round((parseFloat(parsed.youtube) || 0) * 10) / 10,
      social: Math.round((parseFloat(parsed.social)  || 0) * 10) / 10,
      games:  Math.round((parseFloat(parsed.games)   || 0) * 10) / 10
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(result)
    };
  } catch(e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: e.message })
    };
  }
};
