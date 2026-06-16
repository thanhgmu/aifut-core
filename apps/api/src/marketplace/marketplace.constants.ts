/**
 * Marketplace roadmap — tracks what's built vs planned.
 * Updated as features are delivered.
 */

export const MARKETPLACE_ROADMAP = [
  // ✅ Foundation
  'listing-crud',            // ✅ Create, read, update, delete listings
  'browse-and-search',       // ✅ Paginated, filtered, sorted, full-text search
  'install-template',        // ✅ Install workflow templates from listing
  'install-connector',       // ✅ Install connectors from listing

  // ✅ Community depth (just delivered)
  'community-submit',        // ✅ Community submission flow
  'admin-approval',          // ✅ Approve/reject pending submissions
  'ratings-and-reviews',     // ✅ Rate 1-5, review text, per-listing avg
  'platform-stats',          // ✅ Total, official, community, pending, avg price

  // 🟡 In progress
  'publishing-workflow',     // 🔄 Submit → review → approve → publish
  'revenue-sharing',         // 📅 Developer revenue split on paid listings

  // 📅 Planned
  'version-management',      // 📅 Listing update history, changelog
  'certification-badge',     // 📅 AIS certification badge on listing cards
  'ai-powered-recommendations', // 📅 Personalized suggestions per tenant
] as const;

export const MARKETPLACE_SUPPORTED_TYPES = [
  'connector',
  'template',
  'workflow',
] as const;

export const MARKETPLACE_SORT_OPTIONS = [
  'newest',
  'popular',
  'rating',
  'price_asc',
  'price_desc',
] as const;

export const MARKETPLACE_ROADMAP_STATUS = {
  version: 2,
  capability: 'Community Marketplace',
  featuresDelivered: 8,
  featuresTotal: 13,
};
