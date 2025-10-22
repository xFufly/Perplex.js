
# Perplexity.js — Minimal Node.js client for Perplexity AI

This small library provides a minimal client to query the Perplexity API.


Features:
- Synchronous request to the SSE endpoint `/rest/sse/perplexity_ask`.
- Methods: `search` (returns the final response), `streamSearch` (async iterator for streaming messages).

Installation:

```bash
npm install https://github.com/xFufly/Perplex.js
```



Usage (example):

```js
import { PerplexityClient } from 'perplex.js';
const c = new PerplexityClient();
// To use your account, manually export cookies from your browser
// (for example using a cookie export extension) and save them
// into `perplexity_cookies.json` as an array of {name, value, domain, ...} objects.
// Then:
// const cookies = JSON.parse(fs.readFileSync('./perplexity_cookies.json', 'utf8'));
// const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
// const c = new PerplexityClient({ cookies: cookieHeader });
// await c.search('What is the capital of France?');
```

Notes:
 - Authentication is performed via session cookies. This library does not require an API key.
 - Endpoints and payload formats aim to match Perplexity's publicly observed API.
