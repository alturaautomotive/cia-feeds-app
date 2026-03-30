interface Props {
  autoFilledFields: string[];
  missingFields: string[];
}

export function SuccessBanner({ autoFilledFields, missingFields }: Props) {
  return (
    <div className="bg-green-50 border border-green-200 text-green-800 rounded-md p-3 text-sm">
      <p className="font-semibold">
        ✓ Vehicle added successfully.
        {autoFilledFields.length > 0 && (
          <> Auto-filled: {autoFilledFields.join(", ")}.</>
        )}
      </p>
      {missingFields.length > 0 && (
        <p className="mt-1 text-amber-700">
          Missing required fields: <strong>{missingFields.join(", ")}</strong>. Click the row to fill them in.
        </p>
      )}
    </div>
  );
}
