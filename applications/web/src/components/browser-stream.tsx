"use client";

import { useEffect, useRef, useState } from "react";
import { Copy } from "@lab/ui/components/copy";
import { cn } from "@lab/ui/utils/cn";

type BrowserStreamProps = {
  sessionId: string;
  wsBaseUrl: string;
  className?: string;
  enabled?: boolean;
};

type BrowserStatus = {
  connected: boolean;
  screencasting: boolean;
  browserLaunched: boolean;
};

export function BrowserStream({
  sessionId,
  wsBaseUrl,
  className,
  enabled = false,
}: BrowserStreamProps) {
  const [frame, setFrame] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "waiting" | "connecting" | "connected" | "disconnected"
  >("waiting");
  const [browserStatus, setBrowserStatus] = useState<BrowserStatus>({
    connected: false,
    screencasting: false,
    browserLaunched: true, // Assume launched until told otherwise
  });
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) {
      setConnectionStatus("waiting");
      setFrame(null);
      return;
    }

    setConnectionStatus("connecting");

    // wsBaseUrl may end with /ws, so we need to handle the path correctly
    const baseUrl = wsBaseUrl.replace(/\/ws\/?$/, "");
    const ws = new WebSocket(`${baseUrl}/ws/browser?sessionId=${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnectionStatus("connected");
    ws.onclose = () => setConnectionStatus("disconnected");
    ws.onerror = () => setConnectionStatus("disconnected");

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "frame") {
        setFrame(`data:image/jpeg;base64,${data.data}`);
        setBrowserStatus((prev) => ({ ...prev, browserLaunched: true, screencasting: true }));
      } else if (data.type === "status") {
        setBrowserStatus((prev) => ({
          connected: data.connected ?? false,
          screencasting: data.screencasting ?? false,
          browserLaunched: data.screencasting ? true : prev.browserLaunched,
        }));
      } else if (data.type === "error" && data.message === "Browser not launched") {
        setBrowserStatus((prev) => ({ ...prev, browserLaunched: false, screencasting: false }));
      }
    };

    return () => ws.close();
  }, [sessionId, wsBaseUrl, enabled]);

  if (connectionStatus === "waiting") {
    return (
      <div className={cn("aspect-video bg-muted flex items-center justify-center", className)}>
        <Copy size="xs" muted>
          Waiting for browser...
        </Copy>
      </div>
    );
  }

  if (connectionStatus === "connecting") {
    return (
      <div className={cn("aspect-video bg-muted flex items-center justify-center", className)}>
        <Copy size="xs" muted>
          Connecting...
        </Copy>
      </div>
    );
  }

  if (connectionStatus === "disconnected") {
    return (
      <div className={cn("aspect-video bg-muted flex items-center justify-center", className)}>
        <Copy size="xs" muted>
          Disconnected
        </Copy>
      </div>
    );
  }

  if (!browserStatus.browserLaunched) {
    return (
      <div className={cn("aspect-video bg-muted flex items-center justify-center", className)}>
        <Copy size="xs" muted>
          Browser idle
        </Copy>
      </div>
    );
  }

  if (!frame) {
    return (
      <div className={cn("aspect-video bg-muted flex items-center justify-center", className)}>
        <Copy size="xs" muted>
          Waiting for frames...
        </Copy>
      </div>
    );
  }

  return (
    <div className={cn("aspect-video bg-muted", className)}>
      <img src={frame} alt="Browser viewport" className="w-full h-full object-contain" />
    </div>
  );
}
