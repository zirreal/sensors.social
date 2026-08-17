import { agents } from "@config";
import converter from "../measurements";
import { createNode } from "../utils/libp2p";
import { decryptMeasurementBag, isEncryptedSensorValue } from "../utils/sensorValueCrypto";
import { useAccounts } from "@/composables/useAccounts";

const topic = "airalab.lighthouse.5.robonomics.eth";

class Provider {
  constructor(config) {
    this.node = null;
    this.isReady = false;
    this.whiteListAccounts = [];
    this.history = {};
    this.init(config).then(() => {
      this.isReady = true;
      window.pubsubPeers = () => {
        console.log(
          "peers",
          this.node.services.pubsub.getPeers().map((peer) => peer.toString())
        );
        console.log(
          "pubsub",
          this.node.services.pubsub.getSubscribers(topic).map((peer) => peer.toString())
        );
      };
      // this.node.addEventListener("peer:connect", (evt) => {
      //   const peerId = evt.detail;
      //   console.log("Connection established to:", peerId.toString());
      // });
      // this.node.addEventListener("peer:discovery", (evt) => {
      //   const peerInfo = evt.detail;
      //   console.log("Discovered:", peerInfo.id.toString());
      // });
    });
  }

  async init(config) {
    this.node = await createNode(config);
    this.whiteListAccounts = agents;
  }

  ready() {
    return new Promise((res) => {
      const t = setInterval(() => {
        if (this.isReady) {
          res();
          clearInterval(t);
        }
      }, 100);
    });
  }

  getHistoryBySensor(sensor) {
    return Promise.resolve(this.history[sensor] ? this.history[sensor] : []);
  }

  getHistoryPeriod(start, end) {
    // Для libp2p возвращаем все данные из истории
    const result = {};
    Object.keys(this.history).forEach((sensorId) => {
      if (this.history[sensorId]) {
        result[sensorId] = this.history[sensorId];
      }
    });
    return Promise.resolve(result);
  }

  async redecryptHistoryForSensor(sensorId, ownerAccount) {
    const sid = String(sensorId || "");
    if (!sid || !Array.isArray(this.history[sid]) || !ownerAccount) return false;

    let changed = false;
    const next = [];
    for (const item of this.history[sid]) {
      if (!item?.data || typeof item.data !== "object") {
        next.push(item);
        continue;
      }
      let decryptedMeasurement = item.data;
      try {
        decryptedMeasurement = await decryptMeasurementBag(sid, item.data, ownerAccount);
      } catch (error) {
        console.warn("Failed to decrypt history measurement:", sid, error);
      }
      const measurementLowerCase = {};
      for (const key in decryptedMeasurement) {
        const name = key.toLowerCase();
        const raw = decryptedMeasurement[key];
        if (isEncryptedSensorValue(raw)) {
          measurementLowerCase[name] = raw;
          continue;
        }
        measurementLowerCase[name] = converter[name]?.calculate
          ? converter[name].calculate(raw)
          : raw;
      }
      if (JSON.stringify(measurementLowerCase) !== JSON.stringify(item.data)) {
        changed = true;
        next.push({ ...item, data: measurementLowerCase });
      } else {
        next.push(item);
      }
    }
    if (changed) this.history[sid] = next;
    return changed;
  }

  watch(cb) {
    this.node.services.pubsub.subscribe(topic);
    const onMessage = async (evt) => {
      const sender = evt.detail.from.toString();
      if (!this.whiteListAccounts.includes(sender)) {
        // console.log(`skip from ${sender}`);
        return;
      }

      let json;
      try {
        json = JSON.parse(Buffer.from(evt.detail.data).toString("utf8"));
      } catch (e) {
        // console.log(sender, Buffer.from(r.data).toString("utf8"));
        console.error(e.message);
        return;
      }

      for (const sensor_id in json) {
        const data = json[sensor_id];
        if (
          Object.prototype.hasOwnProperty.call(data, "model") &&
          (!Object.prototype.hasOwnProperty.call(this.history, sensor_id) ||
            this.history[sensor_id].find((item) => {
              return item.timestamp === data.measurement.timestamp;
            }) === undefined)
        ) {
          const { timestamp, ...measurement } = data.measurement;
          const owner = data.owner || undefined;
          let decryptedMeasurement = measurement;
          const { accounts } = useAccounts();
          const sid = String(sensor_id).trim();
          const ownerAddr = owner ? String(owner).trim() : "";
          const hasSecret = (a) =>
            String(a?.phrase || "").trim() ||
            String(a?.seedHex || "").trim() ||
            (a?.seed instanceof Uint8Array && a.seed.length >= 32);
          const acc = accounts.value.find((a) => {
            if (!hasSecret(a)) return false;
            const addr = String(a?.address || "").trim();
            if (sid && addr === sid) return true;
            if (ownerAddr && addr === ownerAddr) return true;
            if (
              sid &&
              Array.isArray(a.devices) &&
              a.devices.some((deviceId) => String(deviceId).trim() === sid)
            ) {
              return true;
            }
            return false;
          });
          const ownerAccount = acc || (owner ? { address: owner } : null);
          if (ownerAccount) {
            try {
              decryptedMeasurement = await decryptMeasurementBag(
                sensor_id,
                measurement,
                ownerAccount
              );
            } catch (error) {
              console.warn("Failed to decrypt pubsub measurement:", sensor_id, error);
            }
          }
          const measurementLowerCase = {};
          for (var key in decryptedMeasurement) {
            const name = key.toLowerCase();
            const raw = decryptedMeasurement[key];
            if (isEncryptedSensorValue(raw)) {
              measurementLowerCase[name] = raw;
              continue;
            }
            measurementLowerCase[name] = converter[name]?.calculate
              ? converter[name].calculate(raw)
              : raw;
          }
          const [lat, lng] = data.geo.split(",");
          const donated_by = data.donated_by || undefined;
          const device_model = data.device_model || undefined;
          const point = {
            sensor_id,
            sender,
            model: data.model,
            geo: { lat, lng },
            data: measurementLowerCase,
            owner,
            donated_by,
            device_model,
            timestamp,
          };
          if (!Object.prototype.hasOwnProperty.call(this.history, sensor_id)) {
            this.history[sensor_id] = [];
          }
          this.history[sensor_id].push(point);

          cb(point);
        } else {
          // console.log(sensor_id, data);
        }
      }
    };
    this.node.services.pubsub.addEventListener("message", onMessage);
    return () => {
      this.node.services.pubsub.removeEventListener("message", onMessage);
    };
  }
}

export default Provider;
