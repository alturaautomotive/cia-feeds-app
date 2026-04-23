"use client";

interface Vehicle {
  id: string;
  year: number | null;  // prisma Int
  make: string | null;
  model: string | null;
  price: number | null;
  imageUrl: string | null;
}

interface Props {
  dealerName: string;
  dealerSlug: string;
  vehicles: Vehicle[];
}

export default function RelatedVehicles({ dealerName, dealerSlug, vehicles }: Props) {
  return (
    <section className="py-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">
        Browse {dealerName}'s Full Catalog
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {vehicles.map((v) => (
          <a
            key={v.id}
            href={`/w/${dealerSlug}/${v.id}`}
            className="block bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md hover:border-indigo-300 transition"
          >
            {v.imageUrl ? (
              <img
                src={v.imageUrl}
                alt={`${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim()}
                className="w-full h-32 object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-32 bg-gray-100 flex items-center justify-center text-gray-400 text-sm">No image</div>
            )}
            <div className="p-3">
              <p className="font-semibold text-sm text-gray-900 truncate">
                {v.year ?? ''} {v.make ?? ''} {v.model ?? ''}
              </p>
              {v.price != null && (
                <p className="text-indigo-600 font-bold text-sm mt-1">
                  ${v.price.toLocaleString('en-US')}
                </p>
              )}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
