import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LandingCarousel from "@/app/components/LandingCarousel";
import ServiceDetails from "@/app/components/ServiceDetails";
import StickyCTAs from "@/app/components/StickyCTAs";
import SocialProof from "@/app/components/SocialProof";
import Chatbot from "@/app/components/Chatbot";
import PixelInitializer from "@/app/components/PixelInitializer";
import { getExtraImages } from "@/lib/getExtraImages";
import { getGeoCity } from "@/lib/getGeoCity";
import RelatedServices from "@/app/components/RelatedServices";
import { translateBatch } from "@/lib/translate";
import { applyServicesFallbacks } from "@/lib/serviceUrlValidator";

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; listingId: string }>;
}) {
  const { slug, listingId } = await params;

  const dealer = await prisma.dealer.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!dealer) return { title: "Service Not Found" };

  const listing = await prisma.listing.findFirst({
    where: { id: listingId, dealerId: dealer.id, vertical: "services", publishStatus: "published", archivedAt: null },
    select: { title: true, data: true },
  });
  if (!listing) return { title: "Service Not Found" };

  const data = (listing.data ?? {}) as Record<string, unknown>;
  const name = String(data.name ?? listing.title ?? "Service");

  return { title: `${name} | ${dealer.name}` };
}

export default async function ServiceLandingPage({
  params,
}: {
  params: Promise<{ slug: string; listingId: string }>;
}) {
  const { slug, listingId } = await params;

  const dealer = await prisma.dealer.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      phone: true,
      fbPageId: true,
      ctaPreference: true,
      translationLang: true,
      translationTone: true,
      metaPixelId: true,
      feedUrlMode: true,
      address: true,
    },
  });

  if (!dealer) notFound();

  const listing = await prisma.listing.findFirst({
    where: {
      id: listingId,
      dealerId: dealer.id,
      vertical: "services",
      publishStatus: "published",
      archivedAt: null,
    },
    select: {
      title: true,
      price: true,
      data: true,
      imageUrls: true,
      canonicalUrl: true,
      url: true,
    },
  });

  if (!listing) notFound();

  let relatedListings: { id: string; title: string; price: number | null; imageUrls: string[] }[] = [];
  if (dealer.feedUrlMode === "landing") {
    relatedListings = await prisma.listing.findMany({
      where: {
        dealerId: dealer.id,
        vertical: "services",
        publishStatus: "published",
        archivedAt: null,
        NOT: { id: listingId },
      },
      select: { id: true, title: true, price: true, imageUrls: true },
      orderBy: { createdAt: "desc" },
      take: 12,
    });
  }

  const data = (listing.data ?? {}) as Record<string, unknown>;
  applyServicesFallbacks(data, { name: dealer.name, address: dealer.address ?? null });

  // Fire server-side Meta CAPI ViewContent event
  if (dealer.metaPixelId) {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pixelId: dealer.metaPixelId,
        eventName: "ViewContent",
        data: {
          content_ids: [listingId],
          content_type: "product",
          value: listing.price || 0,
          currency: "USD",
        },
        dealerId: dealer.id,
      }),
    }).catch((err) => console.error("[services-landing] track error:", err));
  }

  // Image assembly
  const baseImages = (listing.imageUrls ?? []).filter(
    (u): u is string => Boolean(u) && !u.includes("/placeholder") && !u.includes("logo")
  );
  const serviceUrl = listing.canonicalUrl || String(data.url ?? listing.url ?? "");
  const extraImages = serviceUrl ? await getExtraImages(serviceUrl, "service") : [];
  const seen = new Set(baseImages);
  const allImages = [
    ...baseImages,
    ...extraImages.filter((u) => !seen.has(u)),
  ];

  // Social proof
  const NAMES = ["Maria", "John", "Sarah"];
  const geo = await getGeoCity();
  const fakeViewer = geo
    ? {
        name: NAMES[(Math.random() * NAMES.length) | 0],
        city: `${geo.city} area`,
      }
    : undefined;

  // --- Translation ---
  const lang = dealer.translationLang ?? "en";
  const tone = dealer.translationTone ?? undefined;
  let translations: Record<string, string> = {};

  if (lang && lang !== "en") {
    const textsToTranslate: Record<string, string> = {
      // ServiceDetails labels
      nameLabel: "Service Name",
      priceLabel: "Price",
      categoryLabel: "Category",
      descriptionLabel: "Description",
      locationLabel: "Location",
      conditionLabel: "Condition",
      brandLabel: "Brand",
      bookingLabel: "Book Now",
      // SocialProof
      viewedText: "viewed this service in",
      // StickyCTAs
      ctaSms: "Text Us",
      ctaWhatsapp: "WhatsApp Us",
      ctaMessenger: "Message on Messenger",
      ctaSmsBody: "Hi, I'm interested in your services",
      ctaWhatsappBody: "Hi, I'm interested in your services",
      // Chatbot
      chatScript1: "Hi there! Someone nearby was just looking at this service. Want to learn more?",
      chatScript2: "Just drop your name and contact info below and we'll reach out!",
      chatHeader: "Service Inquiry",
      chatNamePlh: "Your name *",
      chatEmailPlh: "Email",
      chatPhonePlh: "Phone",
      chatSendBtn: "Send",
      chatSendingBtn: "Sending...",
      chatOpenBtn: "Chat Now",
      chatCloseBtn: "Close",
      chatThanksCarfax: "Thanks {name}! Here's more info: {url}",
      chatThanksNoCarfax: "Thanks {name}! A team member will reach out shortly.",
      chatError: "Oops, something went wrong. Please try again.",
      chatNetworkError: "Network error. Please try again.",
      chatEnded: "Conversation ended",
    };

    const description = String(data.description ?? "");
    if (description) {
      textsToTranslate.description = description;
    }

    translations = await translateBatch(textsToTranslate, dealer.id, lang, tone);
  }

  const listingForDetails = {
    title: listing.title,
    price: listing.price,
    data: {
      ...data,
      description: translations.description || String(data.description ?? ""),
      url: serviceUrl || String(data.url ?? ""),
    },
  };

  const detailsTranslations = lang !== "en" ? {
    nameLabel: translations.nameLabel,
    priceLabel: translations.priceLabel,
    categoryLabel: translations.categoryLabel,
    descriptionLabel: translations.descriptionLabel,
    locationLabel: translations.locationLabel,
    conditionLabel: translations.conditionLabel,
    brandLabel: translations.brandLabel,
    bookingLabel: translations.bookingLabel,
  } : undefined;

  const ctaTranslations = lang !== "en" ? {
    sms: translations.ctaSms,
    whatsapp: translations.ctaWhatsapp,
    messenger: translations.ctaMessenger,
    smsBody: translations.ctaSmsBody,
    whatsappBody: translations.ctaWhatsappBody,
  } : undefined;

  const chatbotTranslations = lang !== "en" ? {
    scripts: [translations.chatScript1, translations.chatScript2],
    header: translations.chatHeader,
    namePlh: translations.chatNamePlh,
    emailPlh: translations.chatEmailPlh,
    phonePlh: translations.chatPhonePlh,
    sendBtn: translations.chatSendBtn,
    sendingBtn: translations.chatSendingBtn,
    openBtn: translations.chatOpenBtn,
    closeBtn: translations.chatCloseBtn,
    thanksCarfax: translations.chatThanksCarfax,
    thanksNoCarfax: translations.chatThanksNoCarfax,
    error: translations.chatError,
    networkError: translations.chatNetworkError,
    ended: translations.chatEnded,
  } : {
    scripts: [
      "Hi there! Someone nearby was just looking at this service. Want to learn more?",
      "Just drop your name and contact info below and we'll reach out!",
    ],
    header: "Service Inquiry",
    thanksNoCarfax: "Thanks {name}! A team member will reach out shortly.",
  };

  const pixelId = dealer.metaPixelId || undefined;

  return (
    <div className="min-h-screen bg-white">
      <div className="py-6"><LandingCarousel images={allImages} /></div>
      {pixelId && <PixelInitializer pixelId={pixelId} vehicleId={listingId} price={listing.price} />}
      <SocialProof fakeViewer={fakeViewer} tViewed={translations.viewedText} defaultText="viewed this service in" />
      <div className="max-w-5xl mx-auto px-4">
        <ServiceDetails listing={listingForDetails} dealer={dealer} translations={detailsTranslations} />
      </div>
      {dealer.feedUrlMode === "landing" && relatedListings.length > 0 && (
        <div className="max-w-5xl mx-auto px-4 mt-12">
          <RelatedServices dealerName={dealer.name} dealerSlug={slug} listings={relatedListings} />
        </div>
      )}
      <StickyCTAs dealer={dealer} tCtas={ctaTranslations} />
      <Chatbot listingId={listingId} dealerId={dealer.id} pixelId={pixelId} price={listing.price} translations={chatbotTranslations} />
    </div>
  );
}
