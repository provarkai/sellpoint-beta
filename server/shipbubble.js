// Thin ShipBubble client (real courier aggregator behind "SellersPoint
// Logistics"). Platform-level, not per-tenant - one shared SellersPoint
// ShipBubble account books shipments on behalf of every business, same
// architecture as server/whatsapp.js's shared WhatsApp number.
// SHIPBUBBLE_API_KEY must be set as a server env var. Falls back gracefully
// when unset: callers check isConfigured() before offering shipment booking.
const SHIPBUBBLE_API_KEY = process.env.SHIPBUBBLE_API_KEY || "";
const BASE_URL = "https://api.shipbubble.com/v1";

function isConfigured() {
  return !!SHIPBUBBLE_API_KEY;
}

async function request(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${SHIPBUBBLE_API_KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === "error") throw new Error(json.message || "ShipBubble request failed");
  return json.data;
}

// Used for both the seller's pickup address (set once in Settings) and a
// customer's delivery address (validated fresh at shipment-booking time) -
// ShipBubble treats both the same way, returning an address_code used by
// the rates/shipment endpoints.
async function validateAddress({ name, email, phone, address }) {
  return request("POST", "/shipping/address/validate", { name, email, phone, address });
}

// Dynamic per-account category IDs (not small fixed numbers) - shown to the
// seller as a dropdown in the booking form rather than guessed/hardcoded,
// since an inaccurate category can cause carrier surcharges per ShipBubble's
// own docs.
async function listCategories() {
  return request("GET", "/shipping/labels/categories");
}

async function fetchRates({ senderAddressCode, receiverAddressCode, pickupDate, categoryId, packageItems, packageDimension }) {
  return request("POST", "/shipping/fetch_rates", {
    sender_address_code: senderAddressCode,
    // ShipBubble's own API misspells this field ("reciever", not
    // "receiver") - confirmed against their live docs and a real sandbox
    // call; the correctly-spelled name silently fails with "Receipient
    // address code is required" since their server just never sees it.
    reciever_address_code: receiverAddressCode,
    pickup_date: pickupDate,
    category_id: categoryId,
    package_items: packageItems,
    package_dimension: packageDimension,
  });
}

async function createShipment({ requestToken, serviceCode, courierId }) {
  return request("POST", "/shipping/labels", { request_token: requestToken, service_code: serviceCode, courier_id: courierId });
}

// The courier's own tracking_code is null at booking time - it's only
// assigned once the courier actually processes the shipment - so this is a
// manual "refresh" pull rather than something available immediately.
async function getShipment(orderId) {
  const results = await request("GET", `/shipping/labels/list/${encodeURIComponent(orderId)}`);
  return Array.isArray(results) ? results[0] : results;
}

module.exports = { isConfigured, validateAddress, listCategories, fetchRates, createShipment, getShipment };
