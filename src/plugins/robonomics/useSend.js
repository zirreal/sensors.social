import { ref } from "vue";
import { usePolkadotApi } from "./usePolkadotApi.js";

/**
 * Vue сomposable for sending transactions
 * @description Provides functionality for creating and sending transactions in the Polkadot network
 * @param options - Composable options
 * @param [options.autoCreate] - Automatically create transaction object
 * @returns Object with methods for working with transactions
 * @example
 * const { tx, create, send } = useSend({ autoCreate: true })
 *
 * // Sending simple transaction
 * await tx.send(() => api.tx.system.remark('Hello'))
 *
 * // Creating custom transaction object
 * const customTx = create()
 * await customTx.send(() => api.tx.balances.transfer(address, amount))
 */
export const useSend = ({ autoCreate = true } = {}) => {
  const { isConnected, instance } = usePolkadotApi();

  /**
   * Sends transaction to the network
   * @description Performs signing and sending of transaction with automatic nonce management and subscription
   * @param tx - Transaction object
   * @param call - Callable function or transaction instance
   * @param options - Options for sending
   * @param options.subscription - Subscription ID (optional)
   * @returns Result of transaction sending
   * @async
   * @example
   * await send(tx, () => api.tx.system.remark('Hello'), {
   *   pair: keypair,
   *   signer: 'sr25519'
   * })
   */

  const send = async (tx, call, { subscription } = {}) => {
    if (!call) {
      return;
    }

    tx.start();

    let currentSubscription = false;

    if (!instance || !instance.api || !instance.account) {
      tx.setError(new Error("Not instance init"));
    } else if (!instance.account.pair) {
      tx.setError(new Error("Not sender"));
    } else if (!isConnected.value) {
      tx.setError(new Error("Not connected"));
    } else {
      if (call instanceof Function) {
        try {
          if (call.constructor.name === "AsyncFunction") {
            call = await call();
          } else {
            call = call();
          }
        } catch (error) {
          tx.setError(error);
          tx.setPropcess(false);
          return;
        }
      }

      try {
        if (subscription && subscription !== instance.account.subscription) {
          currentSubscription = instance.account.subscription;
          instance.account.useSubscription(subscription);
        }
        if (!instance.account.pair) {
          tx.setError(new Error("Not sender"));
        } else {
          const nonce = await instance.api.rpc.system.accountNextIndex(
            instance.account.pair.address
          );
          tx.result.value = await instance.account.signAndSend(call, {
            nonce,
          });
        }
        // console.log("tx", tx.result.value.block, tx.result.value.tx);
      } catch (e) {
        tx.setError(e);
      }

      if (subscription && currentSubscription !== false) {
        instance.account.useSubscription(currentSubscription);
      }
    }

    tx.setPropcess(false);

    return tx.result;
  };

  /**
   * Creates transaction object
   * @description Creates new transaction object with methods for state management
   * @returns Transaction object with management methods
   * @example
   * const tx = create()
   * tx.start()
   * await tx.send(() => api.tx.system.remark('Hello'))
   */
  const create = () => {
    const tx = {
      /** @description Transaction error */
      error: ref(null),
      /** @description Transaction processing status */
      process: ref(null),
      /** @description Transaction result */
      result: ref(null),
      /**
       * Sends transaction
       * @param call - Callable function or transaction instance
       * @param options - Options for sending
       * @returns Result of sending
       */
      send: (call, options = {}) => {
        return send(tx, call, options);
      },
      /**
       * Starts transaction
       * @description Resets transaction state and sets processing flag
       */
      start: () => {
        tx.result.value = null;
        tx.error.value = null;
        tx.process.value = true;
      },
      /**
       * Sets transaction processing status
       * @param process - New processing status
       */
      setPropcess: (process) => {
        tx.process.value = process;
      },
      /**
       * Sets transaction error
       * @param e - Error object
       */
      setError: (e) => {
        tx.error.value = e.message;
        tx.process.value = false;
      },
    };
    return tx;
  };

  if (autoCreate) {
    return { tx: create(), create, send };
  }
  return { create, send };
};
