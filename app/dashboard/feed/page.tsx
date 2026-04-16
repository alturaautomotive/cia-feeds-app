import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { getEffectiveDealerContext } from "@/lib/impersonation";
import { VERTICAL_LABELS, type Vertical } from "@/lib/verticals";
import FeedUrlCard from "./FeedUrlCard";
import EmbedWidgetCard from "./EmbedWidgetCard";

const BACK_LABEL: Record<string, string> = {
  automotive: "Vehicles",
  services: "Services",
  ecommerce: "Products",
  realestate: "Listings",
};

export default async function FeedPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { effectiveDealerId } =
    await getEffectiveDealerContext();

  if (!effectiveDealerId) {
    redirect("/login");
  }

  const isSubscribed = await checkSubscription(effectiveDealerId);
  if (!isSubscribed) {
    redirect("/subscribe");
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: effectiveDealerId },
    select: { slug: true, vertical: true, phone: true, fbPageId: true, ctaPreference: true, address: true },
  });

  const slug = dealer?.slug ?? (session.user.slug as string | undefined) ?? "";
  const dealerVertical = dealer?.vertical ?? "automotive";

  if (!slug) {
    redirect("/login");
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const feedUrl = `${appUrl}/feeds/${slug}.csv`;
  const catalogApiUrl = `${appUrl}/api/catalog/${slug}`;
  const dealerPhone = dealer?.phone ?? null;
  const dealerFbPageId = dealer?.fbPageId ?? null;
  const dealerCtaPreference = dealer?.ctaPreference ?? null;

  const userName = session.user.name ?? "";

  const publishedServicesCount =
    dealerVertical === "services"
      ? await prisma.listing.count({
          where: {
            dealerId: effectiveDealerId,
            vertical: "services",
            publishStatus: "published",
            archivedAt: null,
          },
        })
      : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm text-indigo-600 hover:text-indigo-500"
            >
              &larr; {BACK_LABEL[dealerVertical] ?? "Dashboard"}
            </Link>
            <span className="font-bold text-lg text-gray-900">CIAfeeds</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{userName}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Your Meta Catalog Feed
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Use this URL in Meta&apos;s catalog setup to power your{" "}
          {VERTICAL_LABELS[dealerVertical as Vertical] ?? dealerVertical} catalog feed.
        </p>

        {!dealer?.address?.trim() ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-4">
            <p>
              Please add your dealership address in your{" "}
              <Link
                href="/dashboard/profile"
                className="text-indigo-600 hover:text-indigo-500 underline font-medium"
              >
                Profile
              </Link>{" "}
              before your feed can be used.
            </p>
          </div>
        ) : dealerVertical === "services" && publishedServicesCount === 0 ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-md p-4">
            <p>
              You don&apos;t have any published services yet. Validate your service URLs to publish them and enable your feed.
            </p>
          </div>
        ) : (
          <>
            <FeedUrlCard feedUrl={feedUrl} vertical={dealerVertical} />

            <EmbedWidgetCard
              slug={slug}
              phone={dealerPhone}
              fbPageId={dealerFbPageId}
              vertical={dealerVertical}
              catalogApiUrl={catalogApiUrl}
              ctaPreference={dealerCtaPreference}
            />
          </>
        )}
      </div>
    </div>
  );
}
