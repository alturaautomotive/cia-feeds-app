interface Props {
  message: string;
}

export function ErrorBanner({ message }: Props) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 text-sm">
      <strong>Error:</strong> {message}
    </div>
  );
}
