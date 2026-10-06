export async function closeCdpPage({ debugging, page, socket,
  fetchImpl = globalThis.fetch, WebSocketImpl = globalThis.WebSocket }) {
  const errors = [];
  try {
    if (socket && socket.readyState < WebSocketImpl.CLOSING) socket.close();
  } catch (error) {
    errors.push(error);
  }
  try {
    if (page?.id) {
      const response = await fetchImpl(`${debugging}/json/close/${page.id}`);
      if (!response.ok) errors.push(new Error('Chrome page cleanup failed'));
    }
  } catch (error) {
    errors.push(error);
  }
  return errors;
}

export function createCdpCommandChannel(socket, {
  WebSocketImpl = globalThis.WebSocket, timeoutMs = 5_000,
} = {}) {
  const pending = new Map();
  let nextId = 1;

  function rejectAll(message) {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error(message));
    }
    pending.clear();
  }

  socket.onmessage = ({ data }) => {
    let message;
    try { message = JSON.parse(data); }
    catch { rejectAll('Chrome socket returned invalid data'); return; }
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(
      `Chrome command failed: ${request.method}: ${message.error.message}`));
    else request.resolve(message.result);
  };
  socket.onerror = () => rejectAll('Chrome socket failed');
  socket.onclose = () => rejectAll('Chrome socket closed');

  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        if (socket.readyState !== WebSocketImpl.OPEN) {
          reject(new Error('Chrome socket unavailable'));
          return;
        }
        const callId = nextId++;
        const timer = setTimeout(() => {
          pending.delete(callId);
          reject(new Error(`Chrome command timed out: ${method}`));
        }, timeoutMs);
        pending.set(callId, { resolve, reject, timer, method });
        try { socket.send(JSON.stringify({ id: callId, method, params })); }
        catch (error) {
          clearTimeout(timer);
          pending.delete(callId);
          reject(error);
        }
      });
    },
    pendingCount() { return pending.size; },
  };
}

export async function openCdpPage({ debugging, fetchImpl = globalThis.fetch,
  WebSocketImpl = globalThis.WebSocket, timeoutMs = 5_000 }) {
  let page;
  let socket;
  try {
    const response = await fetchImpl(`${debugging}/json/new?about:blank`, { method: 'PUT' });
    if (!response.ok) throw new Error('Chrome page creation failed');
    page = await response.json();
    socket = new WebSocketImpl(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Chrome socket open timed out')), timeoutMs);
      socket.onopen = () => { clearTimeout(timer); resolve(); };
      socket.onerror = () => { clearTimeout(timer); reject(new Error('Chrome socket open failed')); };
    });
    return { page, socket };
  } catch (error) {
    await closeCdpPage({ debugging, page, socket, fetchImpl, WebSocketImpl });
    throw error;
  }
}
