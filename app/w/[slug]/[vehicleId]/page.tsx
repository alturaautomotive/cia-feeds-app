import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LandingCarousel from "@/app/components/LandingCarousel";
import VehicleDetails from "@/app/components/VehicleDetails";
import StickyCTAs from "@/app/components/StickyCTAs";
import SocialProof from "@/app/components/SocialProof";
import Chatbot from "@/app/components/Chatbot";
import { getExtraImages } from "@/lib/getExtraImages";
import { getGeoCity } from "@/lib/getGeoCity";
import { translateBatch } from "@/lib/translate";

export const revalidate = 3600; // cache for 1 hour

export default async function VehicleLandingPage({
  params,
}: {
  params: Promise<{ slug: string; vehicleId: string }>;
}) {
  const { slug, vehicleId } = await params;

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
    },
  });

  if (!dealer) notFound();

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, dealerId: dealer.id },
    select: {
      make: true,
      model: true,
      year: true,
      price: true,
      mileageValue: true,
      stateOfVehicle: true,
      exteriorColor: true,
      trim: true,
      drivetrain: true,
      transmission: true,
      fuelType: true,
      msrp: true,
      vin: true,
      url: true,
      address: true,
      imageUrl: true,
      images: true,
      description: true,
    },
  });

  if (!vehicle) notFound();

  const baseImages = [vehicle.imageUrl, ...vehicle.images].filter(
    (u): u is string => Boolean(u)
  );

  const extraImages = vehicle.url ? await getExtraImages(vehicle.url) : [];
  const seen = new Set(baseImages);
  const allImages = [
    ...baseImages,
    ...extraImages.filter((u) => !seen.has(u)),
  ];

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
      // VehicleDetails labels
      priceLabel: "Price",
      msrpLabel: "MSRP",
      mileageLabel: "Mileage",
      conditionLabel: "Condition",
      colorLabel: "Color",
      trimLabel: "Trim",
      drivetrainLabel: "Drivetrain",
      transmissionLabel: "Transmission",
      fuelLabel: "Fuel",
      descriptionTitle: "Description",
      vinLabel: "VIN",
      locationLabel: "Location",
      // SocialProof
      viewedText: "viewed this vehicle in",
      // StickyCTAs
      ctaSms: "Text Us",
      ctaWhatsapp: "WhatsApp Us",
      ctaMessenger: "Message on Messenger",
      ctaSmsBody: "Hi, I'm interested in your inventory",
      ctaWhatsappBody: "Hi, I'm interested in your inventory",
      // Chatbot
      chatScript1: "Hi there! Someone nearby was just looking at this vehicle. Want a free Carfax report?",
      chatScript2: "Just drop your name and contact info below and we'll send it right over!",
      chatHeader: "Vehicle Inquiry",
      chatNamePlh: "Your name *",
      chatEmailPlh: "Email",
      chatPhonePlh: "Phone",
      chatSendBtn: "Send",
      chatSendingBtn: "Sending...",
      chatOpenBtn: "Chat Now",
      chatCloseBtn: "Close",
      chatThanksCarfax: "Thanks {name}! Here's the Carfax report: {url}",
      chatThanksNoCarfax: "Thanks {name}! A team member will reach out shortly.",
      chatError: "Oops, something went wrong. Please try again.",
      chatNetworkError: "Network error. Please try again.",
      chatEnded: "Conversation ended",
    };

    if (vehicle.description) {
      textsToTranslate.description = vehicle.description;
    }

    translations = await translateBatch(textsToTranslate, dealer.id, lang, tone);
  }

  const vehicleForDetails = {
    ...vehicle,
    vin: vehicle.vin,
    description: translations.description || vehicle.description,
  };

  const detailsTranslations = lang !== "en" ? {
    priceLabel: translations.priceLabel,
    msrpLabel: translations.msrpLabel,
    mileageLabel: translations.mileageLabel,
    conditionLabel: translations.conditionLabel,
    colorLabel: translations.colorLabel,
    trimLabel: translations.trimLabel,
    drivetrainLabel: translations.drivetrainLabel,
    transmissionLabel: translations.transmissionLabel,
    fuelLabel: translations.fuelLabel,
    descriptionTitle: translations.descriptionTitle,
    vinLabel: translations.vinLabel,
    locationLabel: translations.locationLabel,
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
  } : undefined;

  return (
    <div className="min-h-screen bg-white">
      <LandingCarousel images={allImages} />
      <SocialProof fakeViewer={fakeViewer} tViewed={translations.viewedText} />
      <VehicleDetails vehicle={vehicleForDetails} dealer={dealer} translations={detailsTranslations} />
      <StickyCTAs dealer={dealer} tCtas={ctaTranslations} />
      <Chatbot vehicleId={vehicleId} dealerId={dealer.id} vin={vehicle.vin ?? undefined} translations={chatbotTranslations} />
    </div>
  );
}
