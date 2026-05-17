import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const host = h.get("host") ?? "www.ciafeed.com";
  const proto = host.includes("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  return {
    title: "Marketing en WhatsApp para Concesionarios de Autos: Guía 2025-2026 | CIAfeeds",
    description:
      "Cómo los concesionarios de autos en EE. UU. usan feeds de Meta Catalog y anuncios Click-to-WhatsApp para generar más leads. Tácticas reales, datos 2025.",
    alternates: {
      canonical: `${origin}/marketing-whatsapp-concesionarios`,
      languages: {
        "es-US": `${origin}/marketing-whatsapp-concesionarios`,
        "en-US": `${origin}/whatsapp-marketing-dealerships`,
      },
    },
    openGraph: {
      title: "Marketing en WhatsApp para Concesionarios: Guía 2025-2026",
      description:
        "Cómo los concesionarios de autos en EE. UU. usan Meta Catalog feeds y anuncios Click-to-WhatsApp para generar más leads.",
      type: "website",
    },
  };
}

const faqs = [
  {
    q: "¿Funciona el marketing en WhatsApp para concesionarios de autos en EE. UU.?",
    a: "Sí. WhatsApp tiene más de 50 millones de usuarios activos mensuales en EE. UU. en 2025, con una penetración especialmente alta entre los compradores hispanos, inmigrantes y menores de 45 años. El formato Click-to-WhatsApp de Meta entrega consistentemente un costo por lead menor que las campañas estándar con formularios web.",
  },
  {
    q: "¿Qué es un feed de Meta Catalog y para qué lo necesita un concesionario?",
    a: "Un feed de Meta Catalog es un archivo estructurado (o URL) que lista cada vehículo de tu inventario con fotos, precio, año, marca, modelo y disponibilidad. Meta lo lee para impulsar los Dynamic Inventory Ads — anuncios que muestran automáticamente a cada comprador los vehículos más relevantes para él.",
  },
  {
    q: "¿Qué tan seguido debe actualizarse el feed de inventario?",
    a: "Como mínimo, dos veces al día. Si vendes un vehículo por la tarde y el feed no se actualiza hasta medianoche, podrías estar pagando clics en un auto ya vendido. CIAfeeds actualiza los feeds cada 6 horas por defecto, con actualizaciones por hora disponibles en el plan Pro.",
  },
  {
    q: "¿Cuál es la diferencia entre un lead de Click-to-WhatsApp y uno de formulario web?",
    a: "Un lead de formulario web requiere que el comprador llene un formulario, espere un correo de confirmación y luego espere a que tu BDC lo llame — un proceso que típicamente toma horas. Un lead Click-to-WhatsApp lleva al comprador directamente a una conversación en vivo con tu equipo. La velocidad de respuesta es el mayor diferencial en ventas de autos, y WhatsApp es instantáneo.",
  },
  {
    q: "¿Cuánto cuesta publicar anuncios de WhatsApp para un concesionario?",
    a: "El gasto en anuncios varía según el mercado y la competencia, pero los concesionarios típicamente ven un costo por lead de $8 a $25 dólares para campañas Click-to-WhatsApp — menos que los anuncios de display o búsqueda en la mayoría de los DMAs. CIAfeeds empieza desde $49 al mes.",
  },
  {
    q: "¿Necesito una cuenta dedicada de WhatsApp Business?",
    a: "Sí. Necesitas una WhatsApp Business Account (WABA) conectada a tu Meta Business Manager. CIAfeeds te guía por los pasos de verificación durante el proceso de incorporación.",
  },
];

export default async function MarketingWhatsAppConcesionariosPage() {
  const h = await headers();
  const host = h.get("host") ?? "www.ciafeed.com";
  const proto = host.includes("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Marketing en WhatsApp para Concesionarios de Autos",
    description:
      "Feeds de Meta Catalog y embudos Click-to-WhatsApp para concesionarios de autos en EE. UU.",
    provider: {
      "@type": "Organization",
      name: "CIAfeeds",
      url: "https://www.ciafeed.com",
    },
    areaServed: { "@type": "Country", name: "United States" },
    availableLanguage: ["en", "es"],
    url: `${origin}/marketing-whatsapp-concesionarios`,
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* Lang toggle */}
      <div className="flex justify-end mb-8">
        <Link
          href="/whatsapp-marketing-dealerships"
          className="text-sm text-blue-600 hover:underline"
        >
          English
        </Link>
      </div>

      {/* Header */}
      <header className="mb-10">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
          Guía de Marketing en WhatsApp
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight mb-4">
          Marketing en WhatsApp para Concesionarios de Autos: La Guía 2025–2026
        </h1>
        <p className="text-lg text-gray-600 leading-relaxed">
          Los formularios web pierden el 80% de los compradores de autos antes de que tu
          equipo los llame. Esta guía muestra cómo los concesionarios en EE. UU. usan
          feeds de Meta Catalog y anuncios Click-to-WhatsApp para cerrar leads en
          conversación en tiempo real — no en el buzón de voz.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/lp/marketing-whatsapp-concesionarios"
            className="sf-btn bg-blue-600 text-white font-semibold text-sm rounded-lg px-5 py-2.5 hover:bg-blue-700 transition-colors"
          >
            Obtén la guía de configuración →
          </Link>
          <Link
            href="/es/blog"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 px-5 py-2.5"
          >
            Leer el blog →
          </Link>
        </div>
      </header>

      <hr className="border-gray-100 mb-10" />

      {/* 1. Por qué ahora */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Por qué ahora</h2>
        <p className="text-gray-700 leading-relaxed mb-4">
          En 2025, WhatsApp superó los 50 millones de usuarios activos mensuales en
          EE. UU. — y ese número se concentra en los compradores de autos más activos
          de hoy: hogares hispanos, inmigrantes de primera generación y compradores
          menores de 45 años. Según el{" "}
          <strong>Informe de Ventas por WhatsApp 2026 de Infobip</strong>, las marcas
          que usan anuncios Click-to-WhatsApp registran 3× más señales de intención de
          compra comparado con campañas equivalentes hacia páginas web.
        </p>
        <p className="text-gray-700 leading-relaxed mb-4">
          Para un concesionario de autos, la matemática es simple: un comprador que toca
          un anuncio y abre un chat de WhatsApp te está dando su número de teléfono, su
          interés y su intención — todo en el primer mensaje. Compara eso con un
          formulario web donde el comprador escribe un número falso y sigue de largo.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Según datos del{" "}
          <strong>Informe de Audiencias Automotrices 2025 de Lotame</strong>, el 67% de
          los compradores hispanos de autos en EE. UU. usa WhatsApp como su aplicación
          de mensajería principal. Si tu concesionario está en mercados como Los Ángeles,
          Miami, Houston o Phoenix, ignorar WhatsApp es ignorar tu segmento de compradores
          de mayor crecimiento.
        </p>
      </section>

      {/* 2. Cómo funciona */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Cómo funciona la combinación Meta Catalog + WhatsApp
        </h2>
        <p className="text-gray-700 leading-relaxed mb-4">
          La configuración tiene tres capas:
        </p>
        <ol className="list-decimal pl-6 space-y-4 text-gray-700 mb-4">
          <li>
            <strong>Feed de inventario en tiempo real.</strong> Una URL que Meta puede
            leer — actualizada cada 6 horas — con cada vehículo de tu lote: VIN, año,
            marca, modelo, versión, precio, fotos y estatus. CIAfeeds genera y aloja
            esta URL desde tu sitio web de concesionario existente. Sin integración con
            DMS, sin cargas de CSV.
          </li>
          <li>
            <strong>Meta Catalog conectado a tu WABA.</strong> En Meta Business Manager,
            vinculas la URL del feed a un Catálogo y luego conectas ese Catálogo a tu
            WhatsApp Business Account. Meta hace el emparejamiento automáticamente.
          </li>
          <li>
            <strong>Anuncios de Catálogo Click-to-WhatsApp.</strong> Ejecutas una campaña
            de Dynamic Catalog con WhatsApp como destino del CTA. Cuando un comprador
            toca el anuncio, llega a un chat con tu concesionario — el vehículo que estaba
            viendo aparece pre-cargado en el mensaje.
          </li>
        </ol>
        <p className="text-gray-700 leading-relaxed">
          El resultado: cada toque en un anuncio de Meta es una conversación en vivo de
          WhatsApp, no el envío de un formulario. Tu BDC ve el número del comprador, el
          vehículo exacto que quiere y puede responder en segundos.
        </p>
      </section>

      {/* CTA inline */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="text-sm text-gray-700 flex-1">
          <strong>¿Listo para configurar anuncios Click-to-WhatsApp?</strong> CIAfeeds
          construye tu feed de Meta Catalog e integración con WhatsApp en menos de 24
          horas.
        </p>
        <Link
          href="/lp/marketing-whatsapp-concesionarios"
          className="sf-btn shrink-0 bg-blue-600 text-white font-semibold text-sm rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          Obtén la guía →
        </Link>
      </div>

      {/* 3. Playbook táctico */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Playbook táctico</h2>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Configura tu WhatsApp Business Account correctamente
        </h3>
        <p className="text-gray-700 leading-relaxed mb-3">
          Usa un número dedicado para WhatsApp — no tu línea principal del showroom.
          Esto mantiene tu bandeja de entrada limpia y evita mezclar leads de ventas con
          llamadas de servicio. Verifica tu negocio en Meta Business Manager antes de
          gastar un solo dólar en anuncios; las cuentas no verificadas son limitadas
          por Meta.
        </p>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Escribe plantillas de mensajes que conviertan
        </h3>
        <p className="text-gray-700 leading-relaxed mb-3">
          Tu primera respuesta automática debe reconocer al comprador, confirmar el
          vehículo y hacer una sola pregunta de calificación — no cinco. Ejemplo:{" "}
          <em>
            "¡Hola! Vi que te interesa el Toyota Camry LE 2024 a $26,990. ¿Estás
            buscando comprar en los próximos 30 días o solo explorando?"
          </em>{" "}
          Esa sola pregunta segmenta los leads calientes de los curiosos en tiempo real.
        </p>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Usa el retargeting de catálogo para vehículos vendidos
        </h3>
        <p className="text-gray-700 leading-relaxed mb-3">
          Cuando un vehículo se vende, el catálogo lo elimina automáticamente en la
          siguiente actualización. Pero puedes hacer retargeting a los compradores que
          hicieron clic en ese listado con un mensaje de "vehículos similares
          disponibles." Según el{" "}
          <strong>Informe de Benchmarks de Anuncios Automotrices de Meta 2025</strong>,
          los anuncios Click-to-WhatsApp de retargeting para inventario similar generan
          un 45% más de conversiones comparado con campañas frías.
        </p>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Corre creatividades bilingües en mercados fronterizos y metropolitanos
        </h3>
        <p className="text-gray-700 leading-relaxed mb-3">
          En Los Ángeles, Miami, Houston, Dallas y Phoenix, tener la misma creatividad
          en inglés y español dentro de una sola campaña es el mínimo indispensable.
          Meta sirve la versión del idioma que coincide con la configuración de idioma
          de la app del usuario. No necesitas campañas separadas — solo duplica los
          conjuntos de anuncios dentro de la misma campaña y ajusta el targeting de
          idioma.
        </p>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Rastrea la fuente del lead a nivel de vehículo
        </h3>
        <p className="text-gray-700 leading-relaxed">
          Etiqueta cada conversación de WhatsApp con el conjunto de anuncios de Meta,
          el VIN del vehículo y la marca de tiempo. Esto te da reportes de ROI reales:
          "Este conjunto de anuncios generó 12 pruebas de manejo en marzo a $18 por
          lead." La mayoría de los concesionarios corren anuncios en Meta durante meses
          sin saber qué VINs realmente generan citas. No seas uno de ellos.
        </p>
      </section>

      {/* CTA inline 2 */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="text-sm text-gray-700 flex-1">
          <strong>¿Quieres que lo construyamos para tu concesionario?</strong> Empieza
          con un feed de catálogo gratis — sin compromiso.
        </p>
        <Link
          href="/lp/marketing-whatsapp-concesionarios"
          className="sf-btn shrink-0 bg-blue-600 text-white font-semibold text-sm rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          Empezar gratis →
        </Link>
      </div>

      {/* 4. Errores comunes */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Errores comunes</h2>
        <ul className="space-y-4 text-gray-700">
          <li className="flex gap-3">
            <span className="text-red-500 font-bold shrink-0 mt-0.5">✕</span>
            <span>
              <strong>Usar un número personal de WhatsApp.</strong> Los números
              personales no pueden usar plantillas automatizadas, no pueden conectarse a
              Meta Ads y no pueden compartirse entre tu equipo de BDC.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-red-500 font-bold shrink-0 mt-0.5">✕</span>
            <span>
              <strong>Dejar que el catálogo se desactualice.</strong> Un catálogo que
              no se ha actualizado en 48 horas está anunciando inventario vendido. Cada
              clic en un auto vendido es una mala experiencia y dinero desperdiciado.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-red-500 font-bold shrink-0 mt-0.5">✕</span>
            <span>
              <strong>Tratar WhatsApp como el correo electrónico.</strong> WhatsApp es
              un canal en tiempo real. Si tu BDC tarda 4 horas en responder un mensaje
              de WhatsApp, ya perdiste el lead con un competidor que respondió en 3
              minutos.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-red-500 font-bold shrink-0 mt-0.5">✕</span>
            <span>
              <strong>Correr anuncios solo en inglés en mercados hispanos.</strong> Según
              el{" "}
              <strong>Informe de Consumidores Hispanos 2025 de AS USA</strong>, el 62%
              de los adultos hispanos en EE. UU. prefieren recibir mensajes comerciales
              en español. Las campañas solo en inglés en LA, Miami o Houston dejan dinero
              sobre la mesa.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-red-500 font-bold shrink-0 mt-0.5">✕</span>
            <span>
              <strong>Sin atribución de leads.</strong> Si no puedes decir qué conjunto
              de anuncios generó qué vehículo vendido, tu gasto en anuncios es una caja
              negra. Configura seguimiento UTM en cada enlace de plantilla de WhatsApp.
            </span>
          </li>
        </ul>
      </section>

      {/* 5. Empezar */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Cómo empezar</h2>
        <p className="text-gray-700 leading-relaxed mb-4">
          El camino más rápido a tu primer lead Click-to-WhatsApp es un feed de Meta
          Catalog en tiempo real. CIAfeeds lee tu sitio web de concesionario existente
          — sin acceso a DMS, sin involucrar a TI — y genera una URL de feed que puedes
          agregar a Meta Catalog Manager en menos de 10 minutos.
        </p>
        <p className="text-gray-700 leading-relaxed mb-6">
          Desde ahí, vinculas el catálogo a tu WhatsApp Business Account, creas un
          conjunto de anuncios Click-to-WhatsApp y estás en vivo. La mayoría de los
          concesionarios reciben su primer lead de WhatsApp dentro de las 24 horas
          del lanzamiento de la campaña.
        </p>
        <Link
          href="/lp/marketing-whatsapp-concesionarios"
          className="sf-btn inline-block bg-blue-600 text-white font-semibold text-base rounded-lg px-6 py-3 hover:bg-blue-700 transition-colors"
        >
          Obtén la guía — es gratis →
        </Link>
      </section>

      {/* 6. FAQ */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Preguntas frecuentes
        </h2>
        <div className="space-y-6">
          {faqs.map((faq, i) => (
            <div key={i} className="border-b border-gray-100 pb-6 last:border-0">
              <p className="font-semibold text-gray-900 mb-2">{faq.q}</p>
              <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom nav */}
      <nav className="flex flex-wrap gap-4 text-sm text-blue-600">
        <Link href="/es/blog" className="hover:underline">
          ← Blog
        </Link>
        <Link href="/marketing-automotriz-hispanos" className="hover:underline">
          Marketing Automotriz Hispano →
        </Link>
        <Link href="/lp/marketing-whatsapp-concesionarios" className="hover:underline">
          Obtén la guía →
        </Link>
      </nav>
    </div>
  );
}
