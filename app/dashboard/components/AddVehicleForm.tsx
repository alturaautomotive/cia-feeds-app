interface Props {
  url: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
}

export function AddVehicleForm({ url, onChange, onSubmit, isLoading }: Props) {
  return (
    <form onSubmit={onSubmit} className="flex gap-2.5">
      <input
        data-element-id="vdp-url-input"
        type="url"
        value={url}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste VDP URL to add a vehicle…"
        disabled={isLoading}
        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
      />
      <button
        data-element-id="add-vehicle-btn"
        type="submit"
        disabled={isLoading || !url.trim()}
        className="bg-indigo-500 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
      >
        {isLoading ? "Scraping…" : "Add Vehicle"}
      </button>
    </form>
  );
}
