const BROWSER_WS_HOST = process.env.BROWSER_WS_HOST ?? "browser";

export interface FrameReceiver {
  close: () => void;
}

export const createFrameReceiver = (
  sessionId: string,
  port: number,
  onFrame: (frame: string, timestamp: number) => void,
  onClose: () => void,
): FrameReceiver => {
  const ws = new WebSocket(`ws://${BROWSER_WS_HOST}:${port}`);

  ws.onmessage = (event) => {
    const data = event.data.toString();
    if (data.includes('"type":"frame"')) {
      onFrame(data, Date.now());
    }
  };

  ws.onclose = onClose;
  ws.onerror = () => ws.close();

  return { close: () => ws.close() };
};
