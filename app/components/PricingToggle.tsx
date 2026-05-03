"use client";

import { useState } from "react";
import Link from "next/link";

interface Props {
  monthlyPrice?: number;
}

export default function PricingToggle({ monthlyPrice = 99 }: Props) {
  // TODO: wire to a real annual Stripe price when plan tiers are introduced.
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  return (
    <div className="text-center">
      <div className="inline-flex rounded-full border border-gray-200 p-1 mb-6">
        <button
          onClick={() => setBilling("monthly")}
          className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${
            billing === "monthly"
              ? "bg-indigo-600 text-white"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setBilling("annual")}
          className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${
            billing === "annual"
              ? "bg-indigo-600 text-white"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Annual
        </button>
      </div>

      <div className="text-5xl font-extrabold text-indigo-600">
        ${monthlyPrice}
        <span className="text-lg font-normal text-gray-500">/mo</span>
      </div>

      {billing === "annual" && (
        <div className="mt-2 inline-block bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full">
          2 months free
        </div>
      )}

      <p className="text-sm text-gray-500 mt-2 mb-6">
        Per account. Unlimited listings.
      </p>

      <Link
        href="/signup"
        data-element-id="cta-pricing"
        className="block bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg mb-3"
      >
        Get Started &rarr;
      </Link>
      <p className="text-xs text-gray-400">Cancel anytime. No contracts.</p>
    </div>
  );
}
