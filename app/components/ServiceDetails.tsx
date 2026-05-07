interface ListingProps {
  title: string;
  price: number | null;
  data: Record<string, unknown>;
}

interface DealerProps {
  name: string;
}

interface TranslationProps {
  nameLabel?: string;
  priceLabel?: string;
  categoryLabel?: string;
  descriptionLabel?: string;
  locationLabel?: string;
  conditionLabel?: string;
  brandLabel?: string;
  bookingLabel?: string;
}

interface Props {
  listing: ListingProps;
  dealer: DealerProps;
  translations?: TranslationProps;
}

function formatPrice(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return String(value);
  return "$" + num.toLocaleString("en-US");
}

export default function ServiceDetails({ listing, dealer, translations: t }: Props) {
  const data = listing.data;
  const name = String(data.name ?? listing.title ?? "");
  const description = String(data.description ?? "");
  const price = data.price ?? listing.price;
  const category = String(data.category ?? "");
  const address = String(data.address ?? "");
  const url = String(data.url ?? "");
  const brand = String(data.brand ?? "");
  const condition = String(data.condition ?? "");

  const chips: { label: string; value: string }[] = [];
  if (category) chips.push({ label: t?.categoryLabel || "Category", value: category });
  if (brand) chips.push({ label: t?.brandLabel || "Brand", value: brand });
  if (condition) chips.push({ label: t?.conditionLabel || "Condition", value: condition });

  return (
    <section className="max-w-4xl mx-auto p-6 md:p-8">
      <p className="text-sm text-gray-500 mb-1">{dealer.name}</p>
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
        {name || "Service"}
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {price != null && price !== "" && (
          <div className="bg-indigo-600 text-white rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider opacity-80">{t?.priceLabel || "Price"}</p>
            <p className="text-xl font-bold">{formatPrice(price as string | number)}</p>
          </div>
        )}
        {address && (
          <div className="bg-gray-100 rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500">{t?.locationLabel || "Service Area"}</p>
            <p className="text-xl font-bold text-gray-900">{address}</p>
          </div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {chips.map((c) => (
            <span
              key={c.label}
              className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm"
            >
              {c.label}: {c.value}
            </span>
          ))}
        </div>
      )}

      {description && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            {t?.descriptionLabel || "Description"}
          </h2>
          <p className="text-gray-700 leading-relaxed whitespace-pre-line">
            {description}
          </p>
        </div>
      )}

      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-indigo-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-indigo-700 transition"
        >
          {t?.bookingLabel || "Book Now"}
        </a>
      )}

      {/* Spacer so sticky CTA bar doesn't cover content */}
      <div className="h-24" />
    </section>
  );
}
