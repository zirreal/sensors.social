const base = "https://roseman.robonomics.network/";
const TZ = 7;
const sensors = [
  "4DQbqxSGRZjmx3r2yugvY9Uv2FyRD4vRafncoSvN28yob3fs",
  "4GP1KKQYSjDVUYo36e6a3Gk4HunqDvgWyfd7P2qJyFwtjGYB",
];

function dayBounds(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return {
    start: Math.floor(Date.UTC(y, m - 1, d, -TZ, 0, 0) / 1000),
    end: Math.floor(Date.UTC(y, m - 1, d, 23 - TZ, 59, 59) / 1000),
  };
}

const sampleDays = ["2026-06-01", "2026-06-07", "2026-06-08", "2026-06-09", "2026-06-18"];

for (const id of sensors) {
  console.log("\nSENSOR", id.slice(0, 16));
  for (const iso of sampleDays) {
    const b = dayBounds(iso);
    const markers = await (await fetch(`${base}api/v2/sensor/markers/${b.start}/${b.end}`)).json();
    const m = (markers.result || []).find((s) => String(s.sensor_id) === id);
    const v2 = await (await fetch(`${base}api/v2/sensor/${id}/${b.start}/${b.end}`)).json();
    const v1 = await (await fetch(`${base}api/sensor/${id}/${b.start}/${b.end}`)).json();
    console.log(iso, {
      marker_owner: m?.owner ?? null,
      marker_donated_by: m?.donated_by ?? null,
      normalize: String(m?.owner || m?.donated_by || "").trim() || null,
      v2_owner: v2?.sensor?.owner ?? null,
      v1_owner: v1?.sensor?.owner ?? null,
      v1_has_sensor: Boolean(v1?.sensor),
    });
  }
}
