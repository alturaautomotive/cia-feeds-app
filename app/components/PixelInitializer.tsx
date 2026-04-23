"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

interface Props {
  pixelId: string;
  vehicleId: string;
  price?: number | null;
}

export default function PixelInitializer({ pixelId, vehicleId, price }: Props) {
  useEffect(() => {
    if (!pixelId) return;

    // Inject Meta Pixel base code
    const script = document.createElement("script");
    script.innerHTML = `
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
    `;
    document.head.appendChild(script);

    // Wait for fbq to become available then init + track
    const interval = setInterval(() => {
      if (typeof window.fbq === "function") {
        clearInterval(interval);
        window.fbq("init", pixelId);
        window.fbq("track", "PageView");
        window.fbq("track", "ViewContent", {
          content_ids: [vehicleId],
          content_type: "product",
          ...(price != null ? { value: price, currency: "USD" } : {}),
        });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [pixelId, vehicleId, price]);

  if (!pixelId) return null;

  return (
    <noscript>
      <img
        height="1"
        width="1"
        style={{ display: "none" }}
        src={`https://www.facebook.com/tr?id=${encodeURIComponent(pixelId)}&ev=PageView&noscript=1`}
        alt=""
      />
    </noscript>
  );
}
