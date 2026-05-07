"use client";

interface Props {
  fakeViewer?: { name: string; city: string };
  tViewed?: string;
  defaultText?: string;
}

export default function SocialProof({ fakeViewer, tViewed, defaultText }: Props) {
  if (!fakeViewer) return null;

  return (
    <div className="bg-indigo-100 p-4 text-center text-sm">
      👀 {fakeViewer.name} {tViewed || defaultText || "viewed this in"} {fakeViewer.city}
    </div>
  );
}
