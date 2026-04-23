"use client";

interface Props {
  fakeViewer?: { name: string; city: string };
}

export default function SocialProof({ fakeViewer }: Props) {
  if (!fakeViewer) return null;

  return (
    <div className="bg-indigo-100 p-4 text-center text-sm">
      👀 {fakeViewer.name} viewed this vehicle in {fakeViewer.city}
    </div>
  );
}
