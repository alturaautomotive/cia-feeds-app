const REQUIRED_FIELDS: Array<{ prop: keyof typeof FIELD_LABELS; label: string }> = [
  { prop: "make", label: "make" },
  { prop: "model", label: "model" },
  { prop: "year", label: "year" },
  { prop: "price", label: "price" },
  { prop: "stateOfVehicle", label: "state_of_vehicle" },
  { prop: "url", label: "url" },
];

const FIELD_LABELS = {
  make: "make",
  model: "model",
  year: "year",
  price: "price",
  stateOfVehicle: "state_of_vehicle",
  url: "url",
} as const;

export function computeCompleteness(vehicle: {
  make?: string | null;
  model?: string | null;
  year?: string | number | null;
  price?: number | null;
  stateOfVehicle?: string | null;
  url?: string | null;
}): { isComplete: boolean; missingFields: string[] } {
  const missingFields: string[] = [];
  for (const { prop, label } of REQUIRED_FIELDS) {
    const val = vehicle[prop as keyof typeof vehicle];
    if (val === null || val === undefined || val === "") {
      missingFields.push(label);
    }
  }
  return { isComplete: missingFields.length === 0, missingFields };
}
