// import "robonomics-api-augment";
import { account as AccountInterface, Instance as PolkadotInstance } from "robonomics-interface";
import { error, status } from "./usePolkadotApi.js";

export default {
  install: (app, config) => {
    const instance = new PolkadotInstance(config);
    status.value = instance.status;
    instance.listenStatus((newStatus) => {
      status.value = newStatus;
      if (newStatus === PolkadotInstance.STATUS.connected && instance.api) {
        instance.setAccount(new AccountInterface.Account(instance.api));
      } else if (newStatus === PolkadotInstance.STATUS.error) {
        error.value = instance.error;
      }
    });
    app.provide("Polkadot", instance);
    if (config.start) {
      instance.connect(config).catch((e) => {
        console.error(e);
      });
    }
  },
};
