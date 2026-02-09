import { FrameResponse } from "../types/responses";
import type { FrameReceiver, FrameReceiverConfig } from "../types/session";

export type { FrameReceiver, FrameReceiverConfig } from "../types/session";

export const createFrameReceiver = (
  port: number,
  onFrame: (frame: string, timestamp: number) => void,
  onClose: () => void,
  config: FrameReceiverConfig
): FrameReceiver => {
  const ws = new WebSocket(`${config.wsUrl}:${port}`);

  const handleMessage = (event: MessageEvent) => {
    const data = event.data.toString();
    const parsed = FrameResponse.safeParse(JSON.parse(data));
    if (!parsed.success) {
      return;
    }
    onFrame(parsed.data.data, Date.now());
  };

  const handleError = () => ws.close();

  const handleClose = () => {
    ws.removeEventListener("message", handleMessage);
    ws.removeEventListener("error", handleError);
    ws.removeEventListener("close", handleClose);
    onClose();
  };

  ws.addEventListener("message", handleMessage);
  ws.addEventListener("error", handleError);
  ws.addEventListener("close", handleClose);

  return { close: () => ws.close() };
};
