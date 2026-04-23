"use client";

import { useState, useEffect } from "react";

const NAMES = ["Maria", "John", "Sarah"];

export default function SocialProof() {
  const [viewerMsg, setViewerMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("https://ipapi.co/json")
      .then((res) => res.json())
      .then((data: { city?: string }) => {
        const name = NAMES[(Math.random() * NAMES.length) | 0];
        const nearbyCity = data.city ? `${data.city} area` : "your area";
        setViewerMsg(`${name} viewed this vehicle in ${nearbyCity}`);
      })
      .catch(() => {
        setViewerMsg(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading)
    return (
      <div className="bg-indigo-100 p-4 text-center text-sm">
        👀 Loading viewer info...
      </div>
    );
  if (!viewerMsg) return null;

  return (
    <div className="bg-indigo-100 p-4 text-center text-sm">
      👀 {viewerMsg}
    </div>
  );
}
