import React from 'react';
import { Helmet } from 'react-helmet-async';

interface MetaTagsProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'event';
  siteName?: string;
}

export const MetaTags: React.FC<MetaTagsProps> = ({
  title = 'TeeRex - Onchain Events Platform',
  description = 'Create and discover onchain events. Buy tickets with crypto, attend events, and build communities around shared experiences.',
  image,
  url,
  type = 'website',
  siteName = 'TeeRex'
}) => {
  // Construct full URL if relative
  const fullUrl = url ? (url.startsWith('http') ? url : `${window.location.origin}${url}`) : window.location.href;

  // Construct full image URL if relative
  const fullImage = image ? (image.startsWith('http') ? image : `${window.location.origin}${image}`) : `${window.location.origin}/logo.svg`;

  // Truncate description for better social media display
  const truncatedDescription = description.length > 160 ? `${description.substring(0, 157)}...` : description;

  return (
    <Helmet>
      {/* Basic meta tags */}
      <title>{title}</title>
      <meta name="description" content={truncatedDescription} />

      {/* Open Graph meta tags */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={truncatedDescription} />
      <meta property="og:image" content={fullImage} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={siteName} />

      {/* Twitter Card meta tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={truncatedDescription} />
      <meta name="twitter:image" content={fullImage} />

      {/* Additional meta tags for better social sharing */}
      <meta name="author" content="TeeRex" />
      <link rel="canonical" href={fullUrl} />
    </Helmet>
  );
};

export default MetaTags;
