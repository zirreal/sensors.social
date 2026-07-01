import { settings } from "@config";

/** Map center/zoom when config has no MAP.position (global overview, not a regional default). */
export function getDefaultMapView() {
  const lat = Number(settings?.MAP?.position?.lat);
  const lng = Number(settings?.MAP?.position?.lng);
  const zoom = Number(settings?.MAP?.zoom);
  return {
    lat: Number.isFinite(lat) ? lat : 0,
    lng: Number.isFinite(lng) ? lng : 0,
    zoom: Number.isFinite(zoom) ? zoom : 3,
  };
}

/** Street/address zoom when centering on a sensor (GEOCODER.zoom.address). */
export function getMapAddressZoom() {
  const zoom = Number(settings?.GEOCODER?.zoom?.address);
  return Number.isFinite(zoom) ? zoom : 18;
}
