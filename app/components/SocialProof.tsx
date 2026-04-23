"use client";

interface Props {
  fakeViewer?: { name: string; city: string };
  tViewed?: string;
}

export default function SocialProof({ fakeViewer, tViewed }: Props) {
  if (!fakeViewer) return null;

  return (
    <div className="bg-indigo-100 p-4 text-center text-sm">
      👀 {fakeViewer.name} {tViewed || "viewed this vehicle in"} {fakeViewer.city}
    </div>
  );
}
