"use client";

import { useCallback, useState } from "react";
import { UrlBar } from "@/components/url-bar";

interface FrameTabContentProps {
  frameUrl: string | undefined;
}

export function FrameTabContent({ frameUrl }: FrameTabContentProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [key, setKey] = useState(0);

  const iframeRef = useCallback((node: HTMLIFrameElement | null) => {
    if (!node) {
      return;
    }
    node.addEventListener("load", () => setIsLoading(false));
  }, []);

  const handleRefresh = () => {
    setIsLoading(true);
    setKey((key) => key + 1);
  };

  if (!frameUrl) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center bg-bg-muted p-4">
          <div className="text-sm text-text-muted">
            No container URL available
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <UrlBar isLoading={isLoading} onRefresh={handleRefresh} url={frameUrl} />
      <div className="flex grow bg-white">
        <iframe
          className="flex-1 border-none"
          key={key}
          ref={iframeRef}
          src={frameUrl}
          title="Frame"
        />
      </div>
    </div>
  );
}
