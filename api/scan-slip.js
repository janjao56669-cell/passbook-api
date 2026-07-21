// Vercel serverless function.
// Receives a base64 image + category lists from the frontend, calls Google Gemini
// server-side (API key stays hidden here, never sent to the browser), and returns
// structured JSON describing the transaction.

export default async function handler(req, res) {
  // Allow the GitHub Pages frontend to call this endpoint.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const { image, mediaType, categoriesIn, categoriesOut } = req.body || {};

    if (!image) {
      res.status(400).json({ error: 'Missing "image" (base64) in request body.' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Server is missing GEMINI_API_KEY environment variable.' });
      return;
    }

    const catIn = Array.isArray(categoriesIn) && categoriesIn.length ? categoriesIn : ['อื่นๆ'];
    const catOut = Array.isArray(categoriesOut) && categoriesOut.length ? categoriesOut : ['อื่นๆ'];
    const catList = `รายรับ: ${catIn.join(', ')} | รายจ่าย: ${catOut.join(', ')}`;

    const prompt = `นี่คือรูปภาพสลิปการโอนเงินหรือใบเสร็จ ช่วยดูข้อมูลแล้วตอบกลับเป็น JSON เท่านั้น ไม่ต้องมีคำอธิบายอื่น ไม่ต้องใส่ code fence รูปแบบ JSON ที่ต้องการ:
{"type": "in หรือ out (in ถ้าเป็นเงินเข้า/ได้รับ, out ถ้าเป็นเงินออก/จ่ายไป)", "amount": ตัวเลขจำนวนเงินเท่านั้น ไม่มีคอมม่า, "date": "YYYY-MM-DD หรือ null ถ้าไม่เห็นวันที่", "note": "ชื่อผู้รับหรือผู้โอน หรือรายละเอียดสั้นๆ", "category": "เลือกหมวดหมู่ที่ใกล้เคียงที่สุดจากรายการนี้เท่านั้น: ${catList}"}`;

    const model = 'gemini-2.5-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mediaType || 'image/jpeg', data: image } },
            { text: prompt }
          ]
        }]
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      res.status(502).json({ error: 'Gemini API returned an error.', status: geminiRes.status, detail: errText.slice(0, 500) });
      return;
    }

    const data = await geminiRes.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n');

    if (!text) {
      res.status(502).json({ error: 'Gemini returned an empty response (possibly blocked by safety filters).' });
      return;
    }

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      res.status(502).json({ error: 'Could not find JSON in the AI response.', raw: text.slice(0, 300) });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(match[0]);
    } catch (e) {
      res.status(502).json({ error: 'Failed to parse JSON from AI response.', raw: match[0].slice(0, 300) });
      return;
    }

    if (typeof parsed.amount === 'string') {
      parsed.amount = parseFloat(parsed.amount.replace(/[^\d.]/g, ''));
    }

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: err && err.message ? err.message : 'Unknown server error.' });
  }
}
