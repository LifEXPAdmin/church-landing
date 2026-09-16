/** Immediately discard precise device coordinates after choosing a coarse cell. */
export type DeviceArea = { latitudeCell: number; longitudeCell: number };
export function coarseDeviceArea(
  position: Pick<GeolocationPosition, "coords" | "timestamp">,
  now = Date.now()
): DeviceArea | null {
  const { latitude, longitude, accuracy } = position.coords;
  if (
    ![latitude, longitude, accuracy, position.timestamp].every(
      Number.isFinite
    ) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    accuracy < 0 ||
    accuracy > 10000 ||
    position.timestamp < now - 60000 ||
    position.timestamp > now + 5000
  )
    return null;
  return {
    latitudeCell: Math.min(719, Math.floor((latitude + 90) * 4)),
    longitudeCell: longitude === 180 ? 0 : Math.floor((longitude + 180) * 4)
  };
}

export function isDeviceArea(
  value: Record<string, unknown>
): value is Record<string, unknown> & DeviceArea {
  return (
    Number.isSafeInteger(value.latitudeCell) &&
    Number.isSafeInteger(value.longitudeCell) &&
    Number(value.latitudeCell) >= 0 &&
    Number(value.latitudeCell) < 720 &&
    Number(value.longitudeCell) >= 0 &&
    Number(value.longitudeCell) < 1440
  );
}
