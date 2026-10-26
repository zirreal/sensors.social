import { settings } from "@config";
import { fetchJson } from "@/utils/utils";
import {
  fetchRosemanV3LatestPoints,
  fetchRosemanV3MaxPoints,
  fetchRosemanV3SensorPoints,
  markerRecordsFromLatestPoints,
  protoPointsToHistory,
  protoPointsToMaxValues,
} from "@/utils/map/sensors/rosemanV3";

class Provider {
  constructor(url) {
    this.url = url.replace(/\/$/, "");
    this.start = null;
    this.end = null;
  }

  async status() {
    try {
      const res = await fetch(`${settings.REMOTE_PROVIDER}api/v3/cities`, {
        method: "HEAD",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (error) {
      return false;
    }
  }

  ready() {
    return Promise.resolve(); // Remote provider is always ready
  }

  setStartDate(start) {
    this.start = start;
  }

  setEndDate(end) {
    this.end = end;
  }

  async lastValuesForPeriod(start, end, type) {
    try {
      const result = await fetchJson(
        `${settings.REMOTE_PROVIDER}api/sensor/last/${start}/${end}/${type}`,
        { cache: "no-store" }
      );
      return result?.result || {};
    } catch {
      return {};
    }
  }

  async maxValuesForPeriod(start, end, type) {
    try {
      const points = (await fetchRosemanV3MaxPoints(type, start, end)) || [];
      return protoPointsToMaxValues(points, type);
    } catch {
      return {};
    }
  }

  async messagesForPeriod(start, end) {
    try {
      const result = await fetchJson(
        `${settings.REMOTE_PROVIDER}api/v2/sensor/messages/${start}/${end}`,
        { cache: "no-store" }
      );
      return result?.result || [];
    } catch {
      return [];
    }
  }

  async getHistoryBySensor(sensor) {
    try {
      const end = this.end || Math.floor(Date.now() / 1000);
      const start = this.start || end - 24 * 60 * 60;
      const points = (await fetchRosemanV3SensorPoints(sensor, start, end)) || [];
      return protoPointsToHistory(points);
    } catch {
      return [];
    }
  }

  async getHistoryPeriodBySensor(sensor, start, end) {
    try {
      const points = (await fetchRosemanV3SensorPoints(sensor, start, end)) || [];
      return protoPointsToHistory(points);
    } catch {
      return [];
    }
  }

  async getSensorsForPeriod(start, end) {
    try {
      const points = (await fetchRosemanV3LatestPoints(start, end)) || [];
      return markerRecordsFromLatestPoints(points);
    } catch {
      return [];
    }
  }

  watch(cb) {
    // Remote provider doesn't use real-time updates via socket
    // Data is fetched via HTTP requests instead
    if (cb) {
      console.warn("watch() method not supported for remote provider");
    }
  }
}

export default Provider;
