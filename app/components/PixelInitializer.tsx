"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

interface Props {
  pixelId: string;
  /**
   * The catalog item ID (vehicle ID, listing ID, or product ID) the user
   * is viewing. Omitted on storefront homepage / listings-index pages
   * where there's no single content to attribute. If omitted, only
   * PageView fires (no ViewContent).
   */
  contentId?: string;
  /**
   * Meta's `content_type` enum. Different catalog types need different
   * values for the ViewContent to correlate with the catalog:
   *   - "vehicle"      — for automotive (VEHICLE catalog)
   *   - "home_listing" — for real estate (HOME_LISTING catalog)
   *   - "product"      — for services + ecommerce (PRODUCT_ITEM catalog)
   * Defaults to "product" when not supplied.
   */
  contentType?: "vehicle" | "home_listing" | "product";
  price?: number | null;
  /**
   * Dedup key shared with the server-side CAPI event. Meta correlates
   * Pixel and CAPI events with the same `eventID` to avoid double-counting
   * in dashboards and audience signals.
   */
  eventId?: string;
}

/**
 * Meta Pixel injector for dealer storefronts.
 *
 * Fires PageView on every render, and ViewContent when contentId is set.
 * Both events use the same `eventID` as the corresponding server-side CAPI
 * event so Meta dedupes them.
 *
 * Renders a `<noscript>` 1x1 PageView pixel fallback for users with JS
 * disabled (still attributes a PageView even in that case).
 */
export default function PixelInitializer({
  pixelId,
  contentId,
  contentType = "product",
  price,
  eventId,
}: Props) {
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

    // Wait for fbq to become available, then init + track.
    const interval = setInterval(() => {
      if (typeof window.fbq === "function") {
        clearInterval(interval);
        window.fbq("init", pixelId);

        // PageView: always fire. If we have an eventId, pass it so CAPI
        // can dedup (PageView's eventId is `pv-${eventId}` so it doesn't
        // collide with ViewContent's eventId on the same request).
        const pvOpts = eventId ? { eventID: `pv-${eventId}` } : undefined;
        if (pvOpts) {
          window.fbq("track", "PageView", {}, pvOpts);
        } else {
          window.fbq("track", "PageView");
        }

        // ViewContent: only when we know which content was viewed.
        if (contentId) {
          const vcOpts = eventId ? { eventID: eventId } : undefined;
          const vcData: Record<string, unknown> = {
            content_ids: [contentId],
            content_type: contentType,
            ...(price != null ? { value: price, currency: "USD" } : {}),
          };
          if (vcOpts) {
            window.fbq("track", "ViewContent", vcData, vcOpts);
          } else {
            window.fbq("track", "ViewContent", vcData);
          }
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [pixelId, contentId, contentType, price, eventId]);

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
