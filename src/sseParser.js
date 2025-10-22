// Minimal SSE parser that yields {event, data} objects from a ReadableStream body
export async function* parseSSE(body) {
  const reader = body[Symbol.asyncIterator] ? body[Symbol.asyncIterator]() : body.getReader();

  let decoder = new TextDecoder('utf-8');
  let buffer = '';

  for await (const chunk of body) {
    buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });

    let idx;
    while ((idx = buffer.indexOf('\r\n\r\n')) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 4);

      const lines = raw.split(/\r\n/).filter(Boolean);
      let event = 'message';
      let data = '';

      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += (data ? '\n' : '') + line.slice(5).trim();
      }

      yield { event, data };
    }
  }

  if (buffer.trim()) {
    // last partial
    const lines = buffer.split(/\r\n/).filter(Boolean);
    let event = 'message';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += (data ? '\n' : '') + line.slice(5).trim();
    }
    yield { event, data };
  }
}
