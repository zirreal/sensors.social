<template>
  <div class="parachain">
    <div v-if="isConnected">
      <div v-if="address">
        {{ address }}
        <input v-model="message" placeholder="Message" />
        <button @click="send">send</button>
        {{ tx }}
      </div>
      <div v-else>
        <input v-model="mnemonic" placeholder="Mnemonic" />
        <button @click="account">auth</button>
      </div>
    </div>
    <div v-else>Connecting ...</div>
  </div>
</template>

<script setup>
import { usePolkadotApi } from "@/plugins/robonomics/usePolkadotApi";
import { useSend } from "@/plugins/robonomics/useSend";
import Keyring from "@polkadot/keyring";
import { datalog } from "robonomics-interface";
import { ref } from "vue";

const mnemonic = ref("");
const address = ref();
const message = ref("");

const { isConnected, instance } = usePolkadotApi();
const keyring = new Keyring({ ss58Format: 32 });
const { tx } = useSend();

const account = () => {
  try {
    const pair = keyring.addFromMnemonic(mnemonic.value);
    instance.account.setSender(pair);
    instance.account.useSubscription(instance.account.pair.address);
    address.value = instance.account.pair.address;
  } catch (error) {
    console.log(error);
  }
};
const send = async () => {
  if (message.value.length > 350) {
    console.log("Maximum message length: 350 characters.");
    return;
  }

  await tx.send(() =>
    datalog.action.write(
      instance.api,
      JSON.stringify({
        message: message.value,
        sensor: "__SENSOR_ID__",
        model: 5,
        timestamp: Date.now(),
      })
    )
  );
  if (tx.error.value) {
    if (tx.error.value !== "Cancelled") {
      console.error(tx.error.value);
    }
    return;
  }
};
</script>

<style scoped>
.parachain {
  background-color: #eee;
  z-index: 1;
  padding: 20px;
}
</style>
