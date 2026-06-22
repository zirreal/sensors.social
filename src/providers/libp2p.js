import { agents } from "@config";
import converter from "../measurements";
import { createNode } from "../utils/libp2p";

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

  watch(cb) {
    this.node.services.pubsub.subscribe(topic);
    this.node.services.pubsub.addEventListener("message", (evt) => {
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
          const measurementLowerCase = {};
          for (var key in measurement) {
            const name = key.toLowerCase();
            measurementLowerCase[name] = converter[name]?.calculate
              ? converter[name].calculate(measurement[key])
              : measurement[key];
          }
          const [lat, lng] = data.geo.split(",");
          const owner = data.owner || undefined;
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
    });
  }
}

export default Provider;
