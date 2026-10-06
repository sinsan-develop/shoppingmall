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
