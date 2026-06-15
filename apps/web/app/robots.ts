import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/session/", "/dashboard/", "/admin/"],
      },
    ],
    sitemap: "https://aifut.app/sitemap.xml",
  };
}
