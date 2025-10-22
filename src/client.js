import { request } from 'undici';
import { parseSSE } from './sseParser.js';

function defaultHeaders(cookie) {
  const headers = {
    'accept': 'text/event-stream, text/plain, */*',
    'content-type': 'application/json',
    'user-agent': 'perplexity-js/0.1',
  };

  if (cookie) headers['cookie'] = typeof cookie === 'string' ? cookie : Object.entries(cookie).map(([k,v]) => `${k}=${v}`).join('; ');
  return headers;
}

export default class PerplexityClient {
  constructor(options = {}) {
    // Perplexity access is done via session cookies (or anonymously). No API key is required.
    this.base = options.base || 'https://www.perplexity.ai';
    this.version = options.version || '2.18';
    // optional cookies: either string or object map
    this.cookies = options.cookies || null;
  }

  // Static mapping of modes -> available models
  static modelMap() {
    return {
      auto: [null],
      pro: [null, 'sonar', 'gpt-4.5', 'gpt-4o', 'claude 3.7 sonnet', 'gemini 2.0 flash', 'grok-2'],
      reasoning: [null, 'r1', 'o3-mini', 'claude 3.7 sonnet', 'gpt5', 'gpt5_thinking', 'claude37sonnetthinking'],
      'deep research': [null]
    };
  }

  static getAvailableModels(mode) {
    const map = PerplexityClient.modelMap();
    return map[mode] || [];
  }

  static getAvailableModels(mode='auto') {
    const modelPreferences = {
      auto: [null],
      pro: [null, 'sonar', 'gpt-4.5', 'gpt-4o', 'claude 3.7 sonnet', 'gemini 2.0 flash', 'grok-2'],
      reasoning: [null, 'r1', 'o3-mini', 'claude 3.7 sonnet', 'gpt5', 'gpt5_thinking'],
      'deep research': [null]
    };
    return modelPreferences[mode] ?? modelPreferences.auto;
  }

  // Build the payload for the request
  _buildPayload(query, opts = {}) {
    const { mode = 'auto', model = null, sources = ['web'], attachments = [], language = 'en-US', follow_up = null, incognito = false } = opts;

    const attachmentsFinal = attachments.concat(follow_up && follow_up.attachments ? follow_up.attachments : []);

    const modelPreferences = {
      auto: { null: 'turbo' },
      pro: {
        null: 'pplx_pro',
        'sonar': 'experimental',
        'gpt-4.5': 'gpt45',
        'gpt-4o': 'gpt4o',
        'claude 3.7 sonnet': 'claude2',
        'gemini 2.0 flash': 'gemini2flash',
        'grok-2': 'grok'
      },
      reasoning: {
        null: 'pplx_reasoning',
        'r1': 'r1',
        'o3-mini': 'o3mini',
        'claude 3.7 sonnet': 'claude37sonnetthinking',
        'gpt5': 'gpt5',
        'gpt5_thinking': 'gpt5thinking'
      },
      'deep research': { null: 'pplx_alpha' }
    };

    // safe lookup: try to pick the exact key, else fallback to the first available value
    const mpForMode = modelPreferences[mode] || modelPreferences.auto;
    let modelPref = null;
    if (mpForMode) {
      // if model is null, treat as null key
      if (model == null) modelPref = mpForMode.null ?? Object.values(mpForMode)[0];
      else if (Object.prototype.hasOwnProperty.call(mpForMode, model)) modelPref = mpForMode[model];
      else {
        // invalid model for the chosen mode
        const allowed = Object.keys(mpForMode).filter(k => k !== 'null');
        throw new Error(`Invalid model '${model}' for mode '${mode}'. Allowed: ${allowed.join(', ') || '<none>'}`);
      }
    }

    const params = {
      attachments: attachmentsFinal,
      frontend_context_uuid: cryptoRandomUUID(),
      frontend_uuid: cryptoRandomUUID(),
      is_incognito: incognito,
      language,
      last_backend_uuid: follow_up ? follow_up.backend_uuid : null,
      mode: mode === 'auto' ? 'concise' : 'copilot',
      model_preference: modelPref,
      source: 'default',
      sources,
      version: this.version
    };

    return {
      query_str: query,
      params
    };
  }

  // Simple helper to generate UUID without depending on node <16 helpers
  async _fetch(url, opts) {
    const res = await request(url, opts);
    const { statusCode, headers, body } = res;
    return { statusCode, headers, body };
  }

  // Supports both: (query, opts) and positional signature:
  // search(query, mode='auto', model=null, sources=['web'], files={}, stream=false, language='en-US', follow_up=null, incognito=false)
  async search(...args) {
    let query;
    let opts = {};

    if (args.length === 0) throw new Error('search requires at least a query string');

    query = args[0];

    // If second arg is an object, assume opts form
    if (args.length >= 2 && typeof args[1] === 'object' && !Array.isArray(args[1])) {
      opts = args[1];
    } else if (args.length >= 2) {
  // positional mapping for backwards compatibility
      const [ , mode='auto', model=null, sources=['web'], files={}, stream=false, language='en-US', follow_up=null, incognito=false ] = args;
      opts = { mode, model, sources, files, stream, language, follow_up, incognito };
    }

    if (opts.files && Object.keys(opts.files).length) {
      throw new Error('File upload support is not implemented in this Node client yet');
    }

    const payload = this._buildPayload(query, opts);
    const url = `${this.base}/rest/sse/perplexity_ask`;

    const { statusCode, headers, body } = await this._fetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: defaultHeaders(this.cookies)
    });

    if (statusCode >= 400) {
      const text = await body.text();
      const err = new Error(`Request failed ${statusCode} - ${text.slice(0, 200)}`);
      err.status = statusCode;
      throw err;
    }

  // collect SSE messages
    const messages = [];
    for await (const msg of parseSSE(body)) {
      if (msg.event === 'message') {
        let data = msg.data;
        try { data = JSON.parse(data); } catch (e) {}
        if (data && data.text) {
          try { data.text = JSON.parse(data.text); } catch (e) {}
        }
        messages.push(data);
      } else if (msg.event === 'end_of_stream') {
        break;
      }
    }

    return messages.length ? messages[messages.length - 1] : null;
  }

  // streamSearch supports same signatures as search
  async *streamSearch(...args) {
    let query;
    let opts = {};

    if (args.length === 0) throw new Error('streamSearch requires at least a query string');

    query = args[0];
    if (args.length >= 2 && typeof args[1] === 'object' && !Array.isArray(args[1])) {
      opts = args[1];
    } else if (args.length >= 2) {
      const [ , mode='auto', model=null, sources=['web'], files={}, stream=false, language='en-US', follow_up=null, incognito=false ] = args;
      opts = { mode, model, sources, files, stream, language, follow_up, incognito };
    }

    if (opts.files && Object.keys(opts.files).length) {
      throw new Error('File upload support is not implemented in this Node client yet');
    }

    const payload = this._buildPayload(query, opts);
    const url = `${this.base}/rest/sse/perplexity_ask`;

    const { statusCode, headers, body } = await this._fetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: defaultHeaders(this.cookies)
    });

    if (statusCode >= 400) {
      const text = await body.text();
      throw new Error(`Request failed ${statusCode} - ${text.slice(0, 200)}`);
    }

    for await (const msg of parseSSE(body)) {
      if (msg.event === 'message') {
        let data = msg.data;
        try { data = JSON.parse(data); } catch (e) {}
        if (data && data.text) {
          try { data.text = JSON.parse(data.text); } catch (e) {}
        }
        yield data;
      } else if (msg.event === 'end_of_stream') {
        return;
      }
    }
  }
}

function cryptoRandomUUID() {
  // Use global crypto if available
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();

  // Fallback simple UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
