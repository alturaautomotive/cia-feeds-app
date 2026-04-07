"use client";

interface ListingRow {
  id: string;
  title: string;
  price: number | null;
  imageUrls: string[];
  url: string | null;
  isComplete: boolean;
  missingFields: string[];
  data: Record<string, unknown>;
  createdAt: string;
}

interface Props {
  listings: ListingRow[];
}

export function ListingsTable({ listings }: Props) {
  if (listings.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Price</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {listings.map((listing) => (
            <tr key={listing.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {listing.imageUrls[0] && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={listing.imageUrls[0]}
                      alt=""
                      className="w-8 h-8 rounded object-cover"
                    />
                  )}
                  <div>
                    <div className="font-medium text-gray-900 truncate max-w-xs">
                      {listing.title}
                    </div>
                    {listing.url && (
                      <div className="text-xs text-gray-400 truncate max-w-xs">
                        {listing.url}
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-gray-700">
                {listing.price != null ? `$${listing.price.toLocaleString()}` : "\u2014"}
              </td>
              <td className="px-4 py-3">
                {listing.isComplete ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Complete
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    Incomplete
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs">
                {new Date(listing.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
