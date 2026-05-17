/**
 * Landing page copy keyed by slug.
 * Add new slugs here — the page component will pick them up automatically.
 */

export type LpFaq = {
  q: string;
  a: string;
};

export type LpValueProp = {
  icon: string; // emoji or short label
  title: string;
  body: string;
};

export type LpStep = {
  number: number;
  title: string;
  body: string;
};

export type LpCopy = {
  locale: "en" | "es";
  twinSlug: string; // slug of the other-language equivalent
  metaTitle: string; // ≤ 60 chars
  metaDescription: string; // ≤ 160 chars
  h1: string;
  subHeadline: string;
  ctaLabel: string;
  valueProps: [LpValueProp, LpValueProp, LpValueProp];
  howItWorksTitle: string;
  steps: [LpStep, LpStep, LpStep];
  socialProof: string;
  formTitle: string;
  formCta: string;
  thankYouTitle: string;
  thankYouBody: string;
  faqTitle: string;
  faqs: LpFaq[];
  footerCtaTitle: string;
  footerCtaBody: string;
  footerCtaButton: string;
  // Labels for form fields
  labels: {
    name: string;
    email: string;
    phone: string;
    dealership: string;
  };
};

export const LP_COPY: Record<string, LpCopy> = {
  "whatsapp-marketing-dealerships": {
    locale: "en",
    twinSlug: "marketing-whatsapp-concesionarios",
    metaTitle: "WhatsApp Marketing for Car Dealerships | CIAfeeds",
    metaDescription:
      "Turn Meta Catalog ads into WhatsApp conversations. CIAfeeds connects your inventory feed to Click-to-WhatsApp campaigns so leads arrive in your sales team's chat.",
    h1: "Sell More Cars With WhatsApp — Your Inventory, Auto-Synced to Meta",
    subHeadline:
      "Stop losing leads to web forms. CIAfeeds pushes your live inventory into Meta Catalog ads that open a WhatsApp chat instantly — no app download, no hold music.",
    ctaLabel: "Get your free feed →",
    valueProps: [
      {
        icon: "🔄",
        title: "Live inventory sync",
        body: "Your Meta Catalog updates every time a vehicle sells or changes price. No CSV exports, no manual uploads.",
      },
      {
        icon: "💬",
        title: "Click-to-WhatsApp in every ad",
        body: "Every catalog ad routes the tap directly to WhatsApp with the vehicle pre-filled — your team closes in chat.",
      },
      {
        icon: "📊",
        title: "Lead tracking built in",
        body: "Every WhatsApp lead is tagged with the exact ad and vehicle that triggered it, so you know your ROI.",
      },
    ],
    howItWorksTitle: "How It Works",
    steps: [
      {
        number: 1,
        title: "Connect your inventory URL",
        body: "Paste the URL of your existing dealer website or DMS feed. We handle the rest.",
      },
      {
        number: 2,
        title: "We build your Meta Catalog feed",
        body: "CIAfeeds normalizes your data into the exact format Meta requires — photos, prices, VINs, availability.",
      },
      {
        number: 3,
        title: "Run Click-to-WhatsApp ads",
        body: "Launch a Catalog Ad campaign in Meta Ads Manager with WhatsApp as the destination. Leads start coming in within hours.",
      },
    ],
    socialProof:
      "Trusted by dealerships across the US — from 10-car independent lots to 200-unit franchised dealers.",
    formTitle: "Get your free catalog feed",
    formCta: "Start free →",
    thankYouTitle: "You're on the list.",
    thankYouBody:
      "We'll reach out within one business day to set up your catalog feed. Check your email for next steps.",
    faqTitle: "Common questions",
    faqs: [
      {
        q: "Do I need a developer to set this up?",
        a: "No. You give us your inventory URL and we generate the feed. The only technical step on your end is adding a URL to Meta Catalog Manager.",
      },
      {
        q: "What DMS or websites do you support?",
        a: "Any publicly accessible inventory page — Dealer.com, DealerSocket, VinSolutions, custom sites. If it has a URL, we can read it.",
      },
      {
        q: "How fast does the catalog update?",
        a: "By default, every 6 hours. You can request hourly updates on the Pro plan.",
      },
      {
        q: "Do customers need the WhatsApp app?",
        a: "Yes — WhatsApp is free and already installed on most smartphones in the US, especially among Hispanic car buyers.",
      },
      {
        q: "Is there a long-term contract?",
        a: "No. Monthly billing, cancel anytime.",
      },
      {
        q: "What happens to unsold vehicles that leave the lot?",
        a: "They are automatically removed from your Meta Catalog on the next refresh cycle so you never advertise a car you don't have.",
      },
    ],
    footerCtaTitle: "Ready to fill your WhatsApp with car leads?",
    footerCtaBody:
      "Set up takes under 10 minutes. Your first catalog feed is free.",
    footerCtaButton: "Get started free →",
    labels: {
      name: "Your name",
      email: "Work email",
      phone: "Phone (optional)",
      dealership: "Dealership name",
    },
  },

  "marketing-whatsapp-concesionarios": {
    locale: "es",
    twinSlug: "whatsapp-marketing-dealerships",
    metaTitle: "Marketing en WhatsApp para Concesionarios | CIAfeeds",
    metaDescription:
      "Convierte los anuncios de Meta Catalog en conversaciones de WhatsApp. CIAfeeds conecta tu inventario en tiempo real a campañas Click-to-WhatsApp para que los leads lleguen directo al chat de tu equipo.",
    h1: "Vende más autos con WhatsApp — Tu inventario, sincronizado con Meta",
    subHeadline:
      "Deja de perder clientes en formularios web. CIAfeeds sube tu inventario a Meta Catalog y lo conecta a un chat de WhatsApp con un solo toque — sin descargas, sin esperas.",
    ctaLabel: "Obtén tu feed gratis →",
    valueProps: [
      {
        icon: "🔄",
        title: "Inventario en tiempo real",
        body: "Tu Catalog en Meta se actualiza cada vez que vendes o cambias el precio de un vehículo. Sin exportaciones CSV, sin cargas manuales.",
      },
      {
        icon: "💬",
        title: "Click-to-WhatsApp en cada anuncio",
        body: "Cada anuncio lleva al cliente directo a WhatsApp con el vehículo ya seleccionado — tu equipo cierra la venta en el chat.",
      },
      {
        icon: "📊",
        title: "Seguimiento de leads incluido",
        body: "Cada lead de WhatsApp viene etiquetado con el anuncio y el vehículo exacto que lo generó, para que sepas tu retorno.",
      },
    ],
    howItWorksTitle: "Cómo funciona",
    steps: [
      {
        number: 1,
        title: "Conecta la URL de tu inventario",
        body: "Pega la URL de tu sitio web de concesionario o feed de DMS. Nosotros hacemos el resto.",
      },
      {
        number: 2,
        title: "Construimos tu feed para Meta Catalog",
        body: "CIAfeeds normaliza tu información al formato exacto que requiere Meta — fotos, precios, VINs, disponibilidad.",
      },
      {
        number: 3,
        title: "Lanza anuncios Click-to-WhatsApp",
        body: "Crea una campaña de Catalog Ads en Meta Ads Manager con WhatsApp como destino. Los leads llegan en horas.",
      },
    ],
    socialProof:
      "Con la confianza de concesionarios en todo EE. UU. — desde lotes independientes de 10 autos hasta franquicias de 200 unidades.",
    formTitle: "Obtén tu feed gratuito",
    formCta: "Empezar gratis →",
    thankYouTitle: "¡Listo!",
    thankYouBody:
      "Te contactaremos en un día hábil para configurar tu feed. Revisa tu correo para los próximos pasos.",
    faqTitle: "Preguntas frecuentes",
    faqs: [
      {
        q: "¿Necesito un desarrollador para configurarlo?",
        a: "No. Solo comparte la URL de tu inventario y nosotros generamos el feed. El único paso técnico de tu parte es agregar una URL en Meta Catalog Manager.",
      },
      {
        q: "¿Qué DMS o sitios web soportan?",
        a: "Cualquier página de inventario accesible públicamente — Dealer.com, DealerSocket, VinSolutions, sitios personalizados. Si tiene URL, podemos leerla.",
      },
      {
        q: "¿Qué tan seguido se actualiza el catálogo?",
        a: "Por defecto, cada 6 horas. Puedes solicitar actualizaciones por hora en el plan Pro.",
      },
      {
        q: "¿Los clientes necesitan tener WhatsApp?",
        a: "Sí — WhatsApp es gratuito y ya está instalado en la mayoría de los teléfonos en EE. UU., especialmente entre compradores hispanos.",
      },
      {
        q: "¿Hay contrato a largo plazo?",
        a: "No. Facturación mensual, cancela cuando quieras.",
      },
      {
        q: "¿Qué pasa con los vehículos que se venden?",
        a: "Se eliminan automáticamente de tu Catalog en Meta en el próximo ciclo de actualización para que nunca anuncíes un auto que ya no tienes.",
      },
    ],
    footerCtaTitle: "¿Listo para llenar tu WhatsApp de leads de autos?",
    footerCtaBody: "La configuración toma menos de 10 minutos. Tu primer feed es gratis.",
    footerCtaButton: "Empezar gratis →",
    labels: {
      name: "Tu nombre",
      email: "Correo laboral",
      phone: "Teléfono (opcional)",
      dealership: "Nombre del concesionario",
    },
  },

  "hispanic-auto-marketing": {
    locale: "en",
    twinSlug: "marketing-automotriz-hispanos",
    metaTitle: "Hispanic Auto Marketing for Dealerships | CIAfeeds",
    metaDescription:
      "Reach US Hispanic car buyers in Spanish on WhatsApp and Meta. CIAfeeds builds bilingual catalog feeds and Click-to-WhatsApp campaigns that convert Hispanic leads.",
    h1: "Reach Hispanic Car Buyers Where They Actually Spend Time",
    subHeadline:
      "Hispanic households are the fastest-growing car-buyer segment in the US. CIAfeeds runs bilingual Meta Catalog ads and WhatsApp conversations that match how they actually shop.",
    ctaLabel: "Start reaching Hispanic buyers →",
    valueProps: [
      {
        icon: "🇺🇸",
        title: "Bilingual by default",
        body: "Your ads and WhatsApp templates run in both English and Spanish — no extra setup, no bad translations.",
      },
      {
        icon: "📱",
        title: "WhatsApp is how they buy",
        body: "Over 70% of US Hispanic smartphone users use WhatsApp weekly. Meet them in the app they already trust.",
      },
      {
        icon: "🎯",
        title: "Targeted Meta audiences",
        body: "We configure Meta's Spanish-language and Hispanic cultural interest targeting so your budget reaches the right people.",
      },
    ],
    howItWorksTitle: "How It Works",
    steps: [
      {
        number: 1,
        title: "Feed your inventory in",
        body: "Connect your existing dealer website URL. We extract vehicle data automatically.",
      },
      {
        number: 2,
        title: "We build bilingual catalog ads",
        body: "CIAfeeds generates Meta Catalog entries in both English and Spanish, with price, photos, and availability.",
      },
      {
        number: 3,
        title: "Launch and chat in Spanish",
        body: "Ads go live on Meta. When a Hispanic buyer taps, they land in a WhatsApp chat your team can answer in Spanish.",
      },
    ],
    socialProof:
      "Dealerships using CIAfeeds' Hispanic marketing package report 2-3× higher WhatsApp engagement from Spanish-speaking shoppers.",
    formTitle: "Get your bilingual catalog feed",
    formCta: "Get started free →",
    thankYouTitle: "Got it. We'll be in touch.",
    thankYouBody:
      "Expect an email within one business day to discuss your Hispanic marketing setup.",
    faqTitle: "Common questions",
    faqs: [
      {
        q: "My team doesn't speak Spanish — can we still do this?",
        a: "Yes. CIAfeeds' WhatsApp templates are pre-translated. You can also set up an AI-assisted first response so no lead goes cold while you find a Spanish-speaking team member.",
      },
      {
        q: "What percentage of US car buyers are Hispanic?",
        a: "Hispanic consumers account for roughly 20% of new vehicle purchases in the US (per Experian Automotive 2025 data) and the share grows every year.",
      },
      {
        q: "Do I need separate Meta ad campaigns?",
        a: "You can add Spanish audiences to your existing campaigns, or we recommend a dedicated bilingual campaign for cleaner reporting.",
      },
      {
        q: "Is the Spanish natural or machine-translated?",
        a: "We use US-Hispanic Spanish — the conversational style used in states like Texas, California, and Florida — not Castilian Spanish.",
      },
      {
        q: "How is this different from just boosting a Spanish Facebook post?",
        a: "Dynamic Catalog Ads show specific vehicles from your live inventory. Boosted posts show static content. The dynamic approach is far more relevant to buyers and usually 40-60% cheaper per lead.",
      },
    ],
    footerCtaTitle: "Tap into the fastest-growing buyer segment",
    footerCtaBody:
      "Your bilingual Meta + WhatsApp setup can be live within 48 hours.",
    footerCtaButton: "Get started →",
    labels: {
      name: "Your name",
      email: "Work email",
      phone: "Phone (optional)",
      dealership: "Dealership name",
    },
  },

  "marketing-automotriz-hispanos": {
    locale: "es",
    twinSlug: "hispanic-auto-marketing",
    metaTitle: "Marketing Automotriz para Compradores Hispanos | CIAfeeds",
    metaDescription:
      "Llega a los compradores hispanos de autos en EE. UU. en español en WhatsApp y Meta. CIAfeeds crea feeds bilingües y campañas Click-to-WhatsApp que convierten leads hispanos.",
    h1: "Conecta con los compradores hispanos de autos donde realmente están",
    subHeadline:
      "Los hogares hispanos son el segmento de compradores de autos que más crece en EE. UU. CIAfeeds corre anuncios bilingües en Meta y conversaciones de WhatsApp que se adaptan a como ellos realmente compran.",
    ctaLabel: "Empieza a llegar a compradores hispanos →",
    valueProps: [
      {
        icon: "🇺🇸",
        title: "Bilingüe por defecto",
        body: "Tus anuncios y plantillas de WhatsApp corren en inglés y español — sin configuración extra, sin malas traducciones.",
      },
      {
        icon: "📱",
        title: "WhatsApp es su forma de comprar",
        body: "Más del 70% de los hispanos con smartphone en EE. UU. usan WhatsApp cada semana. Llégales en la app que ya usan.",
      },
      {
        icon: "🎯",
        title: "Audiencias de Meta bien segmentadas",
        body: "Configuramos el targeting de idioma español e intereses culturales hispanos en Meta para que tu presupuesto llegue a las personas correctas.",
      },
    ],
    howItWorksTitle: "Cómo funciona",
    steps: [
      {
        number: 1,
        title: "Conecta tu inventario",
        body: "Comparte la URL de tu sitio web de concesionario. Extraemos los datos de los vehículos de forma automática.",
      },
      {
        number: 2,
        title: "Creamos tus anuncios bilingües",
        body: "CIAfeeds genera entradas de Meta Catalog en inglés y español, con precio, fotos y disponibilidad.",
      },
      {
        number: 3,
        title: "Lanza y chatea en español",
        body: "Los anuncios salen en Meta. Cuando un comprador hispano hace toque, llega a un chat de WhatsApp que tu equipo puede atender en español.",
      },
    ],
    socialProof:
      "Los concesionarios que usan el paquete de marketing hispano de CIAfeeds reportan 2-3× mayor interacción en WhatsApp de compradores hispanohablantes.",
    formTitle: "Obtén tu feed bilingüe gratis",
    formCta: "Empezar gratis →",
    thankYouTitle: "¡Recibido! Te contactamos pronto.",
    thankYouBody:
      "Espera un correo en un día hábil para hablar sobre tu configuración de marketing hispano.",
    faqTitle: "Preguntas frecuentes",
    faqs: [
      {
        q: "Mi equipo no habla español — ¿aun puedo hacer esto?",
        a: "Sí. Las plantillas de WhatsApp de CIAfeeds están pre-traducidas. También puedes configurar una primera respuesta asistida por IA para que ningún lead se enfríe mientras encuentras a un miembro del equipo que hable español.",
      },
      {
        q: "¿Qué porcentaje de compradores de autos en EE. UU. son hispanos?",
        a: "Los consumidores hispanos representan aproximadamente el 20% de las compras de vehículos nuevos en EE. UU. (según datos de Experian Automotive 2025) y la cifra crece cada año.",
      },
      {
        q: "¿Necesito campañas de Meta separadas?",
        a: "Puedes agregar audiencias en español a tus campañas existentes, o recomendamos una campaña bilingüe dedicada para un reporte más limpio.",
      },
      {
        q: "¿El español es natural o traducido por máquina?",
        a: "Usamos español hispano de EE. UU. — el estilo conversacional de estados como Texas, California y Florida — no español de España.",
      },
      {
        q: "¿En qué se diferencia esto de impulsar una publicación en español en Facebook?",
        a: "Los Catalog Ads dinámicos muestran vehículos específicos de tu inventario en tiempo real. Las publicaciones impulsadas muestran contenido estático. El enfoque dinámico es mucho más relevante y suele costar entre un 40-60% menos por lead.",
      },
    ],
    footerCtaTitle: "Aprovecha el segmento de compradores que más crece",
    footerCtaBody:
      "Tu configuración bilingüe de Meta + WhatsApp puede estar activa en 48 horas.",
    footerCtaButton: "Empezar →",
    labels: {
      name: "Tu nombre",
      email: "Correo laboral",
      phone: "Teléfono (opcional)",
      dealership: "Nombre del concesionario",
    },
  },
};

export const LP_SLUGS = Object.keys(LP_COPY) as Array<keyof typeof LP_COPY>;
