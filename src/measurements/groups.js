/** Chart legend groups — shared with meta descriptions. */
export const MEASUREMENT_GROUPS = {
  dust: { members: ["pm10", "pm25"], labelKey: "Dust & Particles" },
  noise: { members: ["noisemax", "noiseavg", "noise"], labelKey: "Noise" },
  climate: { members: ["temperature", "humidity"], labelKey: "Climate" },
};

export const MEASUREMENT_GROUP_LOOKUP = Object.fromEntries(
  Object.entries(MEASUREMENT_GROUPS).flatMap(([groupName, { members }]) =>
    members.map((paramId) => [paramId, groupName])
  )
);
