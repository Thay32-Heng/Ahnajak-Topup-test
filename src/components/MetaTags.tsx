import React from "react";
import { Helmet } from "react-helmet-async";
import { useSite } from "@/contexts/SiteContext";

// Site-wide default Open Graph / share tags.
// Individual pages override <title>/<description> via their own Helmet.
const MetaTags: React.FC = () => {
  const { settings } = useSite();
  const siteName = settings.siteName || "Ahnajak Topup";
  const title = settings.meta_title || settings.browserTitle || `${siteName} - Game Topup Cambodia`;
  const description = settings.meta_description
    || settings.siteDescription
    || "Top up your favorite games instantly. Mobile Legends, Free Fire, PUBG, and more. Fast, secure, and affordable game topup in Cambodia.";
  const image = settings.meta_image || settings.logoUrl || "";

  return (
    <Helmet>
      <meta property="og:site_name" content={siteName} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {image && (
        <>
          <meta property="og:image" content={image} />
          <meta name="twitter:image" content={image} />
        </>
      )}
    </Helmet>
  );
};

export default MetaTags;
