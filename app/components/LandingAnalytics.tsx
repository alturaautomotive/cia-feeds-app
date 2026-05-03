"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

const PIXEL_ID = process.env.NEXT_PUBLIC_LANDING_PIXEL_ID;

export default function LandingAnalytics() {
  useEffect(() => {
    if (!PIXEL_ID) return;

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

    const interval = setInterval(() => {
      if (typeof window.fbq === "function") {
        clearInterval(interval);
        window.fbq("init", PIXEL_ID);
        window.fbq("track", "PageView");
        window.fbq("track", "ViewContent", { content_name: "landing" });
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  if (!PIXEL_ID) return null;

  return (
    <noscript>
      <img
        height="1"
        width="1"
        style={{ display: "none" }}
        src={`https://www.facebook.com/tr?id=${encodeURIComponent(PIXEL_ID)}&ev=PageView&noscript=1`}
        alt=""
      />
    </noscript>
  );
}
