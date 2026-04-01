import { computed, inject, ref, watch } from "vue";

/** Polkadot network connection status */
export const status = ref();
/** Polkadot network connection error */
export const error = ref();

/**
 * Vue composable for working with the Polkadot API
 * @description Provides access to the Polkadot instance, connection status, and utilities for connection checking
 * @returns Object with methods and properties for working with Polkadot
 * @example
 * const { instance, isConnected, composeWithCheckConnection } = usePolkadotApi()
 *
 * const safeFunction = composeWithCheckConnection(() => {
 *   // This code will run only when connected
 *   return instance.api.query.system.account()
 * })
 */
export function usePolkadotApi() {
  const Polkadot = inject("Polkadot");
  // const Polkadot = hasInjectionContext() && inject("Polkadot");
  if (!Polkadot) {
    console.error(
      `Instance not found in context. Read https://vuejs.org/guide/reusability/composables.html to learn more`
    );
  }

  /** Checks whether the client is disconnected */
  const isDisconnected = computed(
    () => status.value === 1 // Instance.STATUS.disconnected
  );
  /** Checks whether the client is connected */
  const isConnected = computed(
    () => status.value === 2 // Instance.STATUS.connected
  );
  /** Checks whether the client is connecting */
  const isConnecting = computed(
    () => status.value === 3 // Instance.STATUS.connecting
  );

  /**
   * Creates a wrapper for a function with connection checking
   * @description Wraps a function with a connection check before execution
   * @param fn - Function to wrap
   * @returns Wrapper function with connection check
   * @example
   * const safeQuery = composeWithCheckConnection(() => api.query.system.account())
   * const result = await safeQuery() // Will throw an error if not connected
   */
  const composeWithCheckConnection =
    (fn) =>
    (...args) => {
      if (!isConnected.value) {
        // if (process.env.NODE_ENV !== "production") {
        //   console.warn("Not connected", fn, args);
        // }
        throw new Error("Not connected");
      }
      if (!Polkadot || !Polkadot.api) {
        // if (process.env.NODE_ENV !== "production") {
        //   console.warn("Not found instance", fn, args, Polkadot);
        // }
        throw new Error("Not found instance");
      }
      return fn(Polkadot.api, ...args);
    };

  /**
   * Watch for the connection status of the API
   * @description Watches for changes in connection status and calls the provided function when the API is connected
   * @param fn - Function to call when the API is connected
   * @param [options.isCheck] - Options object with an optional `isCheck` ref to control if the function should be called
   * @returns A watch function
   */
  const watchConnect = (fn, { isCheck = ref(true) } = {}) => {
    return watch(
      isConnected,
      () => {
        if (isCheck.value && isConnected.value) {
          fn();
        }
      },
      { immediate: true }
    );
  };

  return {
    instance: Polkadot,
    status,
    error,
    isDisconnected,
    isConnected,
    isConnecting,
    watchConnect,
    composeWithCheckConnection,
  };
}
