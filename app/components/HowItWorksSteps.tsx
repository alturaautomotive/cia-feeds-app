"use client";

import { useState } from "react";

interface Step {
  emoji: string;
  title: string;
  description: string;
  screenshot: string;
}

interface Props {
  steps: Step[];
}

export default function HowItWorksSteps({ steps }: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {steps.map((step, i) => (
          <div
            key={step.title}
            className={`border rounded-xl p-6 text-center cursor-pointer transition-colors ${
              hoveredIndex === i
                ? "border-indigo-400 bg-indigo-50"
                : "border-gray-200"
            }`}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <div className="text-4xl mb-3">{step.emoji}</div>
            <h3 className="font-bold text-base text-gray-900 mb-2">
              {step.title}
            </h3>
            <p className="text-sm text-gray-500">{step.description}</p>
          </div>
        ))}
      </div>
      <div className="w-full max-w-3xl mx-auto h-[300px] bg-gray-50 rounded-xl mt-8 flex items-center justify-center overflow-hidden">
        {hoveredIndex !== null ? (
          <img
            src={steps[hoveredIndex].screenshot}
            alt={steps[hoveredIndex].title}
            className="w-full h-full object-contain"
          />
        ) : (
          <span className="text-gray-400 text-sm">
            Hover a step above to preview
          </span>
        )}
      </div>
    </div>
  );
}
