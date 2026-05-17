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
    title: "Marketing Automotriz para Compradores Hispanos en EE. UU.: Guía 2025-2026 | CIAfeeds",
    description:
      "Llega a los compradores hispanos de autos en EE. UU. con anuncios bilingües de Meta Catalog y WhatsApp. Estrategias basadas en datos para concesionarios.",
    alternates: {
      canonical: `${origin}/marketing-automotriz-hispanos`,
      languages: {
        "es-US": `${origin}/marketing-automotriz-hispanos`,
        "en-US": `${origin}/hispanic-auto-marketing`,
      },
    },
    openGraph: {
      title: "Marketing Automotriz para Compradores Hispanos en EE. UU.: Guía 2025-2026",
      description:
        "Llega a los compradores hispanos de autos en EE. UU. con anuncios bilingües de Meta Catalog y WhatsApp.",
      type: "website",
    },
  };
}

const faqs = [
  {
    q: "¿Qué porcentaje de compradores de autos en EE. UU. son hispanos?",
    a: "Según los datos de mercado de Experian Automotive 2025, los consumidores hispanos representan aproximadamente el 20% de las compras de vehículos nuevos en EE. UU. — y su participación crece entre 1 y 2 puntos porcentuales cada año. En estados como California, Texas y Florida ya supera el 30%.",
  },
  {
    q: "¿Debo correr anuncios en español o en inglés para los compradores hispanos?",
    a: "En ambos idiomas. Según el Informe de Audiencia Total 2025 de Nielsen, los adultos hispanos en EE. UU. son más propensos a interactuar con anuncios en español cuando compran artículos de alto valor, pero muchos son bilingües y también responden en inglés. El mejor enfoque es correr conjuntos de anuncios bilingües en la misma campaña y dejar que Meta optimice según la preferencia de idioma del usuario.",
  },
  {
    q: "¿Es WhatsApp realmente tan popular entre los compradores hispanos de autos en EE. UU.?",
    a: "Sí. Más del 70% de los hispanos con smartphone en EE. UU. usan WhatsApp semanalmente, según datos del informe de uso de teléfonos inteligentes del Centro de Investigación Pew 2024. Esto es significativamente mayor que el promedio general de la población estadounidense de aproximadamente el 30%.",
  },
  {
    q: "¿Necesito personal bilingüe para ejecutar campañas de WhatsApp?",
    a: "No necesariamente al inicio. CIAfeeds ofrece plantillas de mensajes en español para los escenarios más comunes (consulta de vehículo, programar prueba de manejo, valoración de vehículo a entregar). Puedes usar plantillas de primera respuesta automática en español y luego pasar la conversación en vivo a un miembro del equipo bilingüe.",
  },
  {
    q: "¿Qué mercados tienen mayor concentración de compradores hispanos de autos?",
    a: "Los Ángeles, Miami, Houston, Dallas, Phoenix, el área metropolitana de Nueva York, San Antonio y Chicago. Si tu concesionario está en cualquiera de estos DMA, los compradores hispanos ya están viendo tu inventario — la pregunta es si tus anuncios los están alcanzando de forma efectiva.",
  },
  {
    q: "¿Cómo funcionan los Dynamic Inventory Ads para el targeting hispano?",
    a: "Los Dynamic Inventory Ads toman datos de tu feed de Meta Catalog en tiempo real y muestran a cada usuario los vehículos más probables según su intención. Agregas creatividades bilingües (titular y texto en ambos idiomas) y configuras el targeting de idioma español e intereses culturales hispanos en Meta Ads Manager. El algoritmo de Meta luego sirve la versión más relevante a cada usuario.",
  },
];

export default async function MarketingAutomotrizHispanosPage() {
  const h = await headers();
  const host = h.get("host") ?? "www.ciafeed.com";
  const proto = host.includes("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Marketing Automotriz para Compradores Hispanos en EE. UU.",
    description:
      "Anuncios bilingües de Meta Catalog y campañas Click-to-WhatsApp dirigidas a compradores hispanos de autos en EE. UU.",
    provider: {
      "@type": "Organization",
      name: "CIAfeeds",
      url: "https://www.ciafeed.com",
    },
    areaServed: { "@type": "Country", name: "United States" },
    availableLanguage: ["en", "es"],
    url: `${origin}/marketing-automotriz-hispanos`,
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
          href="/hispanic-auto-marketing"
          className="text-sm text-blue-600 hover:underline"
        >
          English
        </Link>
      </div>

      {/* Header */}
      <header className="mb-10">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
          Guía de Marketing Automotriz Hispano
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight mb-4">
          Marketing Automotriz para Compradores Hispanos en EE. UU.: La Guía 2025–2026
        </h1>
        <p className="text-lg text-gray-600 leading-relaxed">
          Los hogares hispanos compran uno de cada cinco autos nuevos en este país. La
          mayoría de los concesionarios los está alcanzando con anuncios genéricos en
          inglés y un formulario web. Esta guía cubre el playbook bilingüe de Meta +
          WhatsApp que cierra esa brecha.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/lp/marketing-automotriz-hispanos"
            className="sf-btn bg-blue-600 text-white font-semibold text-sm rounded-lg px-5 py-2.5 hover:bg-blue-700 transition-colors"
          >
            Obtén la guía bilingüe →
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
          Los hogares hispanos son el segmento de compradores de autos que más crece en
          EE. UU. Según los{" "}
          <strong>datos de mercado de Experian Automotive 2025</strong>, los
          consumidores hispanos representan aproximadamente el 20% de las compras de
          vehículos nuevos a nivel nacional — y ese número crece entre 1 y 2 puntos por
          año. En California, Texas y Florida ya supera el 30%.
        </p>
        <p className="text-gray-700 leading-relaxed mb-4">
          Al mismo tiempo, el canal que prefieren — WhatsApp — sigue siendo ignorado
          por la mayoría de los equipos de marketing de concesionarios. Según la{" "}
          <strong>encuesta de uso de smartphones del Centro de Investigación Pew
          2024</strong>, más del 70% de los hispanos con smartphone en EE. UU. usan
          WhatsApp semanalmente, en comparación con aproximadamente el 30% de la
          población estadounidense en general.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Los concesionarios que cierren esta brecha en 2025 serán dueños del segmento
          hasta 2030. Los que esperen pagarán costos por lead más altos para competir
          contra los que construyeron la infraestructura bilingüe primero.
        </p>
      </section>

      {/* 2. Cómo funciona */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Cómo funciona el sistema bilingüe Meta + WhatsApp
        </h2>
        <p className="text-gray-700 leading-relaxed mb-4">
          La arquitectura es igual que una campaña estándar de Meta Catalog con dos
          adiciones: creatividades bilingües y WhatsApp como CTA.
        </p>
        <ol className="list-decimal pl-6 space-y-4 text-gray-700 mb-4">
          <li>
            <strong>Feed de inventario en tiempo real en Meta Catalog.</strong> CIAfeeds
            genera una URL de feed desde tu sitio web de concesionario existente. Meta la
            lee cada 6 horas para que tu catálogo siempre refleje el inventario real —
            sin cargas manuales.
          </li>
          <li>
            <strong>Creatividades bilingües en los anuncios.</strong> Cada conjunto de
            anuncios tiene dos versiones: titulares, descripciones y texto de llamada a
            la acción en inglés y en español. Meta sirve el idioma que coincide con la
            configuración del dispositivo de cada usuario.
          </li>
          <li>
            <strong>CTA Click-to-WhatsApp.</strong> En lugar de redirigir el toque a un
            formulario web, el anuncio abre un chat de WhatsApp con el vehículo que el
            comprador estaba viendo pre-cargado. Tu equipo responde en español cuando el
            cliente lo inicia en español.
          </li>
          <li>
            <strong>Capas de audiencia hispanohablante.</strong> Más allá del idioma del
            dispositivo, agregas el targeting de idioma "Spanish (All)" de Meta y
            categorías de intereses culturales relevantes (medios en español, eventos
            culturales hispanos) para aumentar el alcance a audiencias hispanas en
            EE. UU. que pueden tener un dispositivo en inglés pero compran en español.
          </li>
        </ol>
      </section>

      {/* CTA inline */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="text-sm text-gray-700 flex-1">
          <strong>¿Quieres que lo construyamos para tu concesionario?</strong> CIAfeeds
          se encarga del feed, la integración con WhatsApp y las plantillas bilingües.
        </p>
        <Link
          href="/lp/marketing-automotriz-hispanos"
          className="sf-btn shrink-0 bg-blue-600 text-white font-semibold text-sm rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          Obtén la guía →
        </Link>
      </div>

      {/* 3. Playbook táctico */}
      <section className="mb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Playbook táctico</h2>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Usa el español hispano de EE. UU., no el castellano
        </h3>
        <p className="text-gray-700 leading-relaxed mb-3">
          Hay una diferencia importante entre el español hablado en México, América
          Central y el Caribe — que cubre a la mayoría de los compradores hispanos en
          EE. UU. — y el español castellano formal que producen las herramientas de
          traducción genéricas. Expresiones como "vosotros" o el "usted" formal en copy
          casual suenan extraño y corporativo. Usa "tú", lenguaje coloquial y
          expresiones naturales del contexto regional. Tus compradores lo van a notar.
        </p>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Responde en el idioma que eligió el cliente
        </h3>
        <p className="text-gray-700 leading-relaxed mb-3">
          Si un comprador abre un chat de WhatsApp y escribe "Hola, me interesa este
          Camry," tu primera respuesta debe estar en español. No cambies al inglés a
          mitad de la conversación. Entrena a tu BDC para seguir el idioma del
          comprador. Según el{" "}
          <strong>Informe de Audiencia Total 2025 de Nielsen</strong>, el 62% de los
          adultos hispanos en EE. UU. tienen una percepción más positiva de las marcas
          que se comunican con ellos en español.
        </p>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Segmenta los leads de preferencia española en tu CRM
        </h3>
        <p className="text-gray-700 leading-relaxed mb-3">
          Etiqueta en tu CRM los leads de WhatsApp que iniciaron en español para que
          los correos de seguimiento, los recordatorios de servicio y las ofertas de
          intercambio también se envíen en español. Los concesionarios que hacen esto
          ven tasas de reenganche del 30-40% mejores en correos de ciclo de vida, según
          datos internos de clientes de CIAfeeds del primer trimestre de 2025.
        </p>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Anuncia en entornos de contenido en español
        </h3>
        <p className="text-gray-700 leading-relaxed mb-3">
          Más allá del targeting de idioma en Meta, amplía tu alcance a las propiedades
          digitales de{" "}
          <strong>Telemundo, Univision</strong> y redes de podcasts en español. Estas
          audiencias tienen alta intención de compra y menor competencia de otros
          concesionarios locales en comparación con el inventario en inglés.
        </p>

        <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-6">
          Corre mensajes enfocados en el financiamiento
        </h3>
        <p className="text-gray-700 leading-relaxed">
          Investigaciones del{" "}
          <strong>Estudio del Recorrido del Comprador de Autos 2025 de Cox
          Automotive</strong> muestran que los compradores por primera vez — quienes
          tienden a ser más jóvenes y con mayor probabilidad de ser hispanos — ubican el
          "pago mensual que puedo pagar" como el factor #1 de compra, por encima de la
          marca del vehículo. Corre conjuntos de anuncios que lideren con estimados de
          pago mensual, no con el precio de lista. "¿Desde $299/mes — chatea ahora"
          supera consistentemente a los titulares de año/marca/modelo en esta audiencia.
        </p>
      </section>

      {/* CTA inline 2 */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="text-sm text-gray-700 flex-1">
          <strong>Configura tu campaña de inventario bilingüe hoy.</strong> El primer
          feed de catálogo es gratis.
        </p>
        <Link
          href="/lp/marketing-automotriz-hispanos"
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
              <strong>Tratar a los "hispanos" como un grupo homogéneo.</strong> Los
              compradores mexicano-americanos en Los Ángeles, los cubano-americanos en
              Miami y los puertorriqueños en Nueva York responden a diferentes referencias
              culturales, precios y estilos de mensajes. Empieza con la demografía real
              de tu mercado antes de generalizar.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-red-500 font-bold shrink-0 mt-0.5">✕</span>
            <span>
              <strong>Usar Google Translate para el copy de anuncios.</strong> El español
              traducido por máquina se lee como traducido por máquina. Invierte en un
              hablante nativo de español hispano de EE. UU. para tus creatividades, o
              usa las plantillas pre-validadas de CIAfeeds.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-red-500 font-bold shrink-0 mt-0.5">✕</span>
            <span>
              <strong>No tener una página de destino en español.</strong> Si un
              hispanohablante toca un anuncio en español y llega a una página solo en
              inglés, has roto la experiencia. Usa WhatsApp como CTA en lugar de una
              página web para evitar esto por completo.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-red-500 font-bold shrink-0 mt-0.5">✕</span>
            <span>
              <strong>Ignorar WhatsApp a favor de SMS.</strong> El SMS es más caro, menos
              personal y tiene tasas de apertura mucho más bajas para este segmento que
              WhatsApp. Si un comprador te contacta por WhatsApp, quédate en WhatsApp.
            </span>
          </li>
        </ul>
      </section>

      {/* 5. Empezar */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Cómo empezar</h2>
        <p className="text-gray-700 leading-relaxed mb-4">
          El camino más rápido a tu primer lead de WhatsApp en español es un feed de
          Meta Catalog activo con creatividades bilingües. CIAfeeds se encarga de la
          generación del feed, la integración con WhatsApp y las plantillas de mensajes
          en español — tú manejas las conversaciones.
        </p>
        <p className="text-gray-700 leading-relaxed mb-6">
          La mayoría de los concesionarios en DMA de alta concentración hispana ven un
          cambio significativo en la calidad de los leads dentro de las primeras dos
          semanas. Los leads de WhatsApp en español tienden a tener ciclos de venta más
          cortos porque el comprador ya se auto-calificó al elegir interactuar por
          WhatsApp con un vehículo específico.
        </p>
        <Link
          href="/lp/marketing-automotriz-hispanos"
          className="sf-btn inline-block bg-blue-600 text-white font-semibold text-base rounded-lg px-6 py-3 hover:bg-blue-700 transition-colors"
        >
          Obtén la guía bilingüe — gratis →
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
        <Link href="/marketing-whatsapp-concesionarios" className="hover:underline">
          Guía de WhatsApp Marketing →
        </Link>
        <Link href="/lp/marketing-automotriz-hispanos" className="hover:underline">
          Obtén la guía →
        </Link>
      </nav>
    </div>
  );
}
