# Passbook API (backend)

This is the tiny serverless function that reads a slip photo using Google Gemini,
without exposing the API key in the browser.

## Deploy to Vercel

1. Create a **new GitHub repo** (e.g. `passbook-api`) and upload the files in this
   folder (`api/scan-slip.js`, `package.json`).
2. Go to https://vercel.com → **Add New... → Project**.
3. Import the GitHub repo you just created. Click **Deploy** (default settings are fine —
   no build command needed).
4. After it deploys, go to **Project → Settings → Environment Variables**.
5. Add a variable:
   - Name: `GEMINI_API_KEY`
   - Value: (your Gemini API key from aistudio.google.com)
6. Go to **Deployments** tab → click the "..." menu on the latest deployment → **Redeploy**
   (environment variables only take effect after a redeploy).
7. Your API is now live at:
   `https://<your-project-name>.vercel.app/api/scan-slip`

Test it's alive by visiting that URL directly in a browser — you should see
`{"error":"Method not allowed. Use POST."}` (that's correct! it means the function is running).

## Next step

Copy your Vercel URL and give it to Claude (or paste it yourself) into the frontend's
`index.html`, replacing the placeholder line:

```js
const API_ENDPOINT = 'https://YOUR-VERCEL-PROJECT.vercel.app/api/scan-slip';
```
