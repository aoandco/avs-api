const axios = require("axios");

const MAX_DISTANCE_METERS = Number(process.env.GEO_MAX_DISTANCE_METERS) || 500;
const MAX_ACCURACY_METERS = Number(process.env.GEO_MAX_ACCURACY_METERS) || 100;

/** Rough Nigeria bounding box — blocks impossible overseas spoofs (e.g. China). */
const NIGERIA_BOUNDS = {
  minLat: 4.0,
  maxLat: 14.0,
  minLng: 2.5,
  maxLng: 15.0,
};

const toRad = (value) => (value * Math.PI) / 180;

/**
 * Haversine distance between two { lat, lng } points in meters.
 */
const getDistanceInMeters = (coord1, coord2) => {
  const R = 6371000;
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) *
      Math.cos(toRad(coord2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const isWithinNigeria = (lat, lng) =>
  lat >= NIGERIA_BOUNDS.minLat &&
  lat <= NIGERIA_BOUNDS.maxLat &&
  lng >= NIGERIA_BOUNDS.minLng &&
  lng <= NIGERIA_BOUNDS.maxLng;

const buildGeocodeAddress = (task) => {
  const parts = [
    task.verificationAddress,
    task.address?.area,
    task.address?.city || task.city,
    task.address?.state || task.state,
    task.address?.country || "Nigeria",
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);

  return [...new Set(parts)].join(", ");
};

const geocodeAddress = async (address) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "MISSING_API_KEY" };
  }

  const geoRes = await axios.get(
    "https://maps.googleapis.com/maps/api/geocode/json",
    {
      params: {
        address,
        key: apiKey,
        region: "ng",
      },
      timeout: 15000,
    }
  );

  if (!geoRes.data?.results?.length) {
    return {
      ok: false,
      reason: "NO_RESULTS",
      status: geoRes.data?.status,
    };
  }

  const location = geoRes.data.results[0].geometry.location;
  return {
    ok: true,
    coords: { lat: location.lat, lng: location.lng },
    formattedAddress: geoRes.data.results[0].formatted_address,
  };
};

/**
 * Validates agent GPS against mock/accuracy/service-area and distance to task address.
 * @returns {{ ok: true, meta } | { ok: false, statusCode, code, message, meta? }}
 */
const validateSubmitLocation = async ({
  lat,
  lng,
  accuracy,
  isMocked,
  task,
}) => {
  const meta = {
    submittedCoords: { lat, lng },
    accuracy: accuracy ?? null,
    isMocked: Boolean(isMocked),
    maxDistanceMeters: MAX_DISTANCE_METERS,
    maxAccuracyMeters: MAX_ACCURACY_METERS,
  };

  if (isMocked === true) {
    return {
      ok: false,
      statusCode: 400,
      code: "MOCK_LOCATION",
      message:
        "Mock/fake GPS location detected. Turn off mock location apps and capture a real GPS fix at the verification address.",
      meta,
    };
  }

  if (
    accuracy != null &&
    Number.isFinite(Number(accuracy)) &&
    Number(accuracy) > MAX_ACCURACY_METERS
  ) {
    return {
      ok: false,
      statusCode: 400,
      code: "POOR_ACCURACY",
      message: `GPS accuracy is too weak (${Math.round(
        Number(accuracy)
      )}m). Move outdoors or wait for a stronger signal (max ${MAX_ACCURACY_METERS}m), then capture location again.`,
      meta,
    };
  }

  if (!isWithinNigeria(lat, lng)) {
    return {
      ok: false,
      statusCode: 400,
      code: "OUTSIDE_SERVICE_AREA",
      message:
        "Captured location is outside Nigeria. Verification GPS must be taken at the customer address in Nigeria. Disable VPN/fake GPS if enabled, then recapture.",
      meta,
    };
  }

  const addressQuery = buildGeocodeAddress(task);
  meta.addressQuery = addressQuery;

  try {
    const geocoded = await geocodeAddress(addressQuery);

    if (!geocoded.ok) {
      if (geocoded.reason === "MISSING_API_KEY") {
        console.warn(
          "GEO validation: GOOGLE_MAPS_API_KEY missing — distance-to-address check skipped; Nigeria/accuracy/mock checks still applied."
        );
        meta.distanceCheckSkipped = true;
        meta.skipReason = "MISSING_API_KEY";
        return { ok: true, meta };
      }

      console.warn(
        "GEO validation: unable to geocode address",
        addressQuery,
        geocoded
      );
      // Fail closed when address cannot be resolved — otherwise spoofed overseas
      // points inside a wrong country box could slip through if bounds were widened.
      // Nigeria box already passed; allow submit but flag for admin review.
      meta.distanceCheckSkipped = true;
      meta.skipReason = geocoded.reason || "GEOCODE_FAILED";
      meta.needsManualReview = true;
      return { ok: true, meta };
    }

    const distanceInMeters = getDistanceInMeters(
      { lat, lng },
      geocoded.coords
    );
    meta.addressCoords = geocoded.coords;
    meta.formattedAddress = geocoded.formattedAddress;
    meta.distanceInMeters = Math.round(distanceInMeters);

    if (distanceInMeters > MAX_DISTANCE_METERS) {
      return {
        ok: false,
        statusCode: 400,
        code: "TOO_FAR_FROM_ADDRESS",
        message: `Captured location is about ${Math.round(
          distanceInMeters
        )}m from the verification address (limit ${MAX_DISTANCE_METERS}m). You must be at the customer address to submit.`,
        meta,
      };
    }

    return { ok: true, meta };
  } catch (err) {
    console.error("GEO validation geocode error:", err.message);
    meta.distanceCheckSkipped = true;
    meta.skipReason = "GEOCODE_ERROR";
    meta.needsManualReview = true;
    return { ok: true, meta };
  }
};

module.exports = {
  MAX_DISTANCE_METERS,
  MAX_ACCURACY_METERS,
  getDistanceInMeters,
  isWithinNigeria,
  buildGeocodeAddress,
  geocodeAddress,
  validateSubmitLocation,
};
