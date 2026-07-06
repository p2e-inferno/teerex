import { ExternalLink } from 'lucide-react';

// Lightweight map: the free-text location is passed straight to Google Maps' embed
// and search endpoints — no API key or stored coordinates required.
export function EventLocationMap({ location }: { location: string }) {
  const query = encodeURIComponent(location);
  const embedUrl = `https://www.google.com/maps?q=${query}&output=embed`;
  const linkUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border">
        <iframe
          title="Event location map"
          src={embedUrl}
          className="h-56 w-full"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      <a
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
      >
        <ExternalLink className="h-3 w-3" />
        Open in Google Maps
      </a>
    </div>
  );
}
