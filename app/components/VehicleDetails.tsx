interface VehicleProps {
  make: string | null;
  model: string | null;
  year: string | null;
  price: number | null;
  mileageValue: number | null;
  stateOfVehicle: string | null;
  exteriorColor: string | null;
  trim: string | null;
  drivetrain: string | null;
  transmission: string | null;
  fuelType: string | null;
  msrp: number | null;
  vin: string | null;
  description: string | null;
  address: string | null;
}

interface DealerProps {
  name: string;
}

interface TranslationProps {
  priceLabel?: string;
  msrpLabel?: string;
  mileageLabel?: string;
  conditionLabel?: string;
  colorLabel?: string;
  trimLabel?: string;
  drivetrainLabel?: string;
  transmissionLabel?: string;
  fuelLabel?: string;
  descriptionTitle?: string;
  vinLabel?: string;
  locationLabel?: string;
}

interface Props {
  vehicle: VehicleProps;
  dealer: DealerProps;
  translations?: TranslationProps;
}

function formatPrice(value: number): string {
  return "$" + value.toLocaleString("en-US");
}

function formatMileage(value: number): string {
  return value.toLocaleString("en-US") + " mi";
}

export default function VehicleDetails({ vehicle, dealer, translations: t }: Props) {
  const title = [vehicle.year, vehicle.make, vehicle.model]
    .filter(Boolean)
    .join(" ");

  const chips: { label: string; value: string }[] = [];

  if (vehicle.stateOfVehicle)
    chips.push({ label: t?.conditionLabel || "Condition", value: vehicle.stateOfVehicle });
  if (vehicle.exteriorColor)
    chips.push({ label: t?.colorLabel || "Color", value: vehicle.exteriorColor });
  if (vehicle.trim) chips.push({ label: t?.trimLabel || "Trim", value: vehicle.trim });
  if (vehicle.drivetrain)
    chips.push({ label: t?.drivetrainLabel || "Drivetrain", value: vehicle.drivetrain });
  if (vehicle.transmission)
    chips.push({ label: t?.transmissionLabel || "Transmission", value: vehicle.transmission });
  if (vehicle.fuelType)
    chips.push({ label: t?.fuelLabel || "Fuel", value: vehicle.fuelType });

  return (
    <section className="max-w-4xl mx-auto p-6 md:p-8">
      <p className="text-sm text-gray-500 mb-1">{dealer.name}</p>
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
        {title || "Vehicle"}
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {vehicle.price != null && (
          <div className="bg-indigo-600 text-white rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider opacity-80">{t?.priceLabel || "Price"}</p>
            <p className="text-xl font-bold">{formatPrice(vehicle.price)}</p>
          </div>
        )}
        {vehicle.msrp != null && vehicle.msrp !== vehicle.price && (
          <div className="bg-gray-100 rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500">{t?.msrpLabel || "MSRP"}</p>
            <p className="text-xl font-bold text-gray-900">
              {formatPrice(vehicle.msrp)}
            </p>
          </div>
        )}
        {vehicle.mileageValue != null && (
          <div className="bg-gray-100 rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500">{t?.mileageLabel || "Mileage"}</p>
            <p className="text-xl font-bold text-gray-900">
              {formatMileage(vehicle.mileageValue)}
            </p>
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

      {vehicle.description && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            {t?.descriptionTitle || "Description"}
          </h2>
          <p className="text-gray-700 leading-relaxed whitespace-pre-line">
            {vehicle.description}
          </p>
        </div>
      )}

      {vehicle.vin && (
        <p className="text-sm text-gray-500 mb-1">{t?.vinLabel || "VIN"}: {vehicle.vin}</p>
      )}

      {vehicle.address && (
        <p className="text-sm text-gray-500">{t?.locationLabel || "Location"}: {vehicle.address}</p>
      )}

      {/* Spacer so sticky CTA bar doesn't cover content */}
      <div className="h-24" />
    </section>
  );
}
