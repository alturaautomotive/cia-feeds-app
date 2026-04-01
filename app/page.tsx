import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function Nav({ session }: { session: Awaited<ReturnType<typeof getServerSession>> }) {
  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="flex items-center justify-between px-6 md:px-12 py-4 max-w-6xl mx-auto">
        <span className="font-extrabold text-xl text-indigo-600">CIAfeeds</span>
        <div className="hidden md:flex gap-6">
          <Link href="#features" className="text-sm text-gray-600 hover:text-gray-900">Features</Link>
          <Link href="#pricing" className="text-sm text-gray-600 hover:text-gray-900">Pricing</Link>
          <Link href="#faq" className="text-sm text-gray-600 hover:text-gray-900">FAQ</Link>
        </div>
        {session ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">Welcome back, {session.user?.name || "Dealer"}</span>
            <Link href="/dashboard" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-md">
              Go to Dashboard →
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link href="/login" className="border border-indigo-600 text-indigo-600 bg-white hover:bg-indigo-50 text-sm font-semibold px-4 py-2 rounded-md">
              Log In
            </Link>
            <Link href="/signup" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-md">
              Get Started →
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="bg-gray-50 py-20 px-6 text-center">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 max-w-3xl mx-auto leading-tight mb-4">
        Turn Any Dealer Website Into a Meta Inventory Feed — In Minutes
      </h1>
      <p className="text-lg text-gray-500 max-w-xl mx-auto mb-8">
        CIAfeeds scrapes your Vehicle Detail Pages and generates a Meta-compatible CSV feed automatically. No dev work. No manual exports.
      </p>
      <Link href="/signup" className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base px-8 py-4 rounded-lg">
        Start for $99/mo →
      </Link>
      <p className="mt-4 text-sm text-gray-400">No setup fees · Cancel anytime · Works with any dealer website</p>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      emoji: "🔗",
      title: "Paste a VDP URL",
      description: "Drop in any Vehicle Detail Page URL from your dealer website",
    },
    {
      emoji: "⚡",
      title: "We Scrape It Instantly",
      description: "CIAfeeds extracts make, model, year, price, images and more automatically",
    },
    {
      emoji: "📋",
      title: "Get Your Meta Feed URL",
      description: "Share one URL with Meta Catalog Manager — it auto-refreshes on schedule",
    },
  ];

  return (
    <section className="py-16 px-6 max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold text-center text-gray-900 mb-10">How It Works</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {steps.map((step) => (
          <div key={step.title} className="border border-gray-200 rounded-xl p-6 text-center">
            <div className="text-4xl mb-3">{step.emoji}</div>
            <h3 className="font-bold text-base text-gray-900 mb-2">{step.title}</h3>
            <p className="text-sm text-gray-500">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Features() {
  const items = [
    "✅ Works with any dealer website — no API needed",
    "✅ Meta Automotive Inventory Ads compatible CSV format",
    "✅ Auto-extracts: VIN, make, model, year, price, mileage, condition, color, images",
    "✅ Edit & fill in missing fields from the dashboard",
    "✅ Live feed URL — Meta pulls fresh data on schedule",
    "✅ One feed URL per dealership, forever",
  ];

  return (
    <section id="features" className="bg-gray-50 py-16 px-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-10">
          Everything You Need to Run Automotive Inventory Ads
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto">
          {items.map((item) => (
            <div key={item} className="text-sm text-gray-700 py-1">{item}</div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="py-16 px-6 max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold text-center text-gray-900 mb-10">Simple, Transparent Pricing</h2>
      <div className="border-2 border-indigo-600 rounded-xl p-10 max-w-sm mx-auto text-center">
        <div className="text-5xl font-extrabold text-indigo-600">
          $99<span className="text-lg font-normal text-gray-500">/mo</span>
        </div>
        <p className="text-sm text-gray-500 mt-2 mb-6">Per dealership. Unlimited vehicles.</p>
        <Link href="/signup" className="block bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg mb-3">
          Get Started →
        </Link>
        <p className="text-xs text-gray-400">Cancel anytime. No contracts.</p>
      </div>
    </section>
  );
}

function FAQ() {
  const items = [
    {
      question: "What dealer websites does it work with?",
      answer: "Any publicly accessible VDP — franchise, independent, or aggregator pages.",
    },
    {
      question: "How does Meta get the feed?",
      answer: "You paste your unique feed URL into Meta Catalog Manager. Meta fetches it on a schedule you set.",
    },
    {
      question: "What if a field doesn't scrape correctly?",
      answer: "You can manually edit any field from your dashboard before it appears in the feed.",
    },
    {
      question: "How many vehicles can I add?",
      answer: "Unlimited.",
    },
  ];

  return (
    <section id="faq" className="bg-gray-50 py-16 px-6">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-10">Frequently Asked Questions</h2>
        {items.map((item) => (
          <div key={item.question} className="border-b border-gray-200 py-5">
            <h4 className="font-semibold text-sm text-gray-900 mb-2">{item.question}</h4>
            <p className="text-sm text-gray-500">{item.answer}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-gray-50 border-t border-gray-200 py-6 px-6 md:px-12">
      <div className="flex flex-col md:flex-row items-center justify-between max-w-6xl mx-auto gap-4 text-sm text-gray-400">
        <span>© 2025 CIAfeeds</span>
        <div className="flex gap-4">
          <Link href="/privacy" className="text-gray-500 hover:text-gray-700">Privacy Policy</Link>
          <Link href="/terms" className="text-gray-500 hover:text-gray-700">Terms of Service</Link>
          <a href="mailto:hello@ciafeeds.com" className="text-gray-500 hover:text-gray-700">Contact</a>
        </div>
      </div>
    </footer>
  );
}

export default async function Home() {
  const session = await getServerSession(authOptions);
  return (
    <>
      <Nav session={session} />
      <Hero />
      <HowItWorks />
      <Features />
      <Pricing />
      <FAQ />
      <Footer />
    </>
  );
}
