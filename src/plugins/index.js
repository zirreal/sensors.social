import VueClipboard from "vue3-clipboard";
import router from "../router";
import { useFilters } from "./filters";
import { useIcons } from "./fontawesome";
import { useI18n } from "./i18n";
import { useNotification } from "./notification";
import robonomics from "./robonomics";

export function usePlugins(app) {
  app.use(router);
  app.use(VueClipboard, {
    autoSetContainer: true,
    appendToBody: true,
  });
  app.use(robonomics, {
    start: true,
    endpoint: "wss://polkadot.rpc.robonomics.network/",
  });
  useI18n(app);
  useIcons(app);
  useFilters(app);
  useNotification(app);
}
