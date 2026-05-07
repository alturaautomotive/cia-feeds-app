"use client";

interface ServiceListing {
  id: string;
  title: string;
  price: number | null;
  imageUrls: string[];
}

interface Props {
  dealerName: string;
  dealerSlug: string;
  listings: ServiceListing[];
}

export default function RelatedServices({ dealerName, dealerSlug, listings }: Props) {
  return (
    <section className="py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">
        Other Services from {dealerName}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {listings.map((l) => (
          <a
            key={l.id}
            href={`/services/${dealerSlug}/${l.id}`}
            className="block bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md hover:border-indigo-300 transition"
          >
            {l.imageUrls.find((u) => u && !u.includes("placeholder")) ? (
              <img
                src={l.imageUrls.find((u) => u && !u.includes("placeholder"))!}
                alt={l.title}
                className="w-full h-32 object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-32 bg-gray-100 flex items-center justify-center text-gray-400 text-sm">No image</div>
            )}
            <div className="p-3">
              <p className="font-semibold text-sm text-gray-900 truncate">
                {l.title}
              </p>
              {l.price != null && (
                <p className="text-indigo-600 font-bold text-sm mt-1">
                  ${l.price.toLocaleString('en-US')}
                </p>
              )}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
