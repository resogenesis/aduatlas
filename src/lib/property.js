// Property records lookup. Posts an address to the serverless function at
// /api/property-lookup (which proxies a property-data provider, keeping the
// key server-side). Returns the normalized record, or null when the lookup
// isn't configured / the address isn't found — callers fall back to example
// data so the snapshot page always renders.
//
// Frontend env:
//   VITE_PROPERTY_LOOKUP_ENDPOINT   (defaults to /api/property-lookup)

const endpoint = import.meta.env.VITE_PROPERTY_LOOKUP_ENDPOINT || "/api/property-lookup";

// Whether a real lookup should even be attempted. We gate on an explicit flag
// so local dev (no backend) skips the fetch and shows example data instantly.
export const propertyLookupEnabled = Boolean(import.meta.env.VITE_PROPERTY_LOOKUP_ENDPOINT);

export const lookupProperty = async (address) => {
  const q = (address || "").trim();
  if (!q || !propertyLookupEnabled) return null;
  try {
    const res = await fetch(`${endpoint}?address=${encodeURIComponent(q)}`);
    if (!res.ok) return null; // 501 not-configured / 404 no-record / 5xx → example
    return await res.json(); // { lotSize, buildingSize, yearBuilt, propertyType, source }
  } catch {
    return null;
  }
};
