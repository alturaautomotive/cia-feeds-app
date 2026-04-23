import { headers } from "next/headers";

interface GeoResult {
  city: string;
  lat: number;
  lon: number;
}

export async function getGeoCity(): Promise<GeoResult | null> {
  try {
    const hdrs = await headers();
    const forwarded = hdrs.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0].trim() || "";

    const endpoint = ip
      ? `http://ip-api.com/json/${ip}?fields=status,message,city,lat,lon`
      : `http://ip-api.com/json/?fields=status,message,city,lat,lon`;

    const res = await fetch(endpoint, { cache: "no-store" });

    const rl = res.headers.get("X-Rl");
    const ttl = res.headers.get("X-Ttl");
    if (rl === "0") {
      console.warn(
        `[getGeoCity] ip-api rate limit exhausted. Resets in ${ttl}s`
      );
      return null;
    }

    const data = await res.json();
    if (data.status !== "success") {
      console.warn(`[getGeoCity] ip-api failed: ${data.message}`);
      return null;
    }

    return { city: data.city, lat: data.lat, lon: data.lon };
  } catch (err) {
    console.error("[getGeoCity] error:", err);
    return null;
  }
}
