<template>
  <MetaInfo
    :pageTitle="$t('Where to buy Altruist')"
    :pageDescription="$t('Official and partner purchase options for Altruist devices by region.')"
    pageImage="/og-default.webp"
  />
  <PageTextLayout>
    <div class="pagetext-header">
      <h1 class="pagetext-title">{{ $t("Where to buy") }}</h1>
      <p class="pagetext-subtitle">
        {{
          $t(
            "Buy ready-to-use air quality monitors for indoor and outdoor use. Measure dust, noise, and CO₂, and choose what to share with the sensors.social community."
          )
        }}
      </p>
    </div>

    <section class="shops">
      <a
        v-for="shop in shops"
        :key="shop.id"
        class="shop ui-surface"
        :class="{ 'shop--disabled': shop.comingSoon }"
        :data-tone="shop.tone"
        :href="shop.href || undefined"
        :target="shop.href ? '_blank' : undefined"
        :rel="shop.href ? 'noopener' : undefined"
        :aria-disabled="shop.comingSoon ? 'true' : 'false'"
        @click="shop.comingSoon ? $event.preventDefault() : null"
      >
        <div class="shop__header">
          <span class="shop__pill">{{ shop.regionLabel }}</span>
          <span v-if="shop.comingSoon" class="shop__pill shop__pill--soon">
            {{ $t("Coming soon") }}
          </span>
        </div>

        <div class="shop__logo">
          <img :src="shop.logo" :alt="shop.logoAlt" loading="lazy" />
        </div>

        <p class="shop__desc">{{ shop.description }}</p>
      </a>
    </section>
  </PageTextLayout>
</template>

<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import MetaInfo from "../components/MetaInfo.vue";
import PageTextLayout from "../components/layouts/PageText.vue";

import pinoutLogo from "@/assets/images/logos/pinout-logo.png";
import yandexLogo from "@/assets/images/logos/yandex-logo.svg";
import cyberpunksShopLogo from "@/assets/images/logos/cyberpunks-shop-logo.svg";
import amazonLogo from "@/assets/images/logos/amazon-logo.svg";

const { t } = useI18n();

const shops = computed(() => [
  {
    id: "worldwide",
    regionLabel: t("Worldwide"),
    comingSoon: false,
    tone: "primary",
    href: "https://cyberpunks.shop/",
    logo: cyberpunksShopLogo,
    logoAlt: t("Cyberpunks Shop"),
    title: t("Cyberpunks Shop"),
    description: t("Our online-shop with various options available"),
  },
  {
    id: "europe",
    regionLabel: t("DE"),
    comingSoon: false,
    tone: "primary",
    href: "https://www.amazon.de/-/en/Assistant-Integration-sensors-social-Community-Owned-Subscriptions/dp/B0GXF3Q127/ref=sr_1_1?crid=3VPHQPHQZ9RU4&dib=eyJ2IjoiMSJ9.SMCp3qkyJXH6cQoVFrFeGWx7vzIJfauoYLSEgwZRJmO_VQJorYjKGeYJJwPAqELySrntJuhU3BJN3qO_4A3JrGk-SWw0Po0aPuhLFP-yoi5l5THWvGHcant_PcVbPuijz4VTLEPATGKt-1Lu3dR69Qvv4x7r1V7Az9LgMqlHK_Cpo8-EFtz3VMEAwoTv09TQf92TNjo07B7yu5W1bmD0IK7osB4yZ90jKueqPmsnwyp0BPOvDcpQeTsz6G7EVXc2XbmJOHQLHhdu75ueFWrpGkA6XyGqE1xadoFcUaX8Qyk.wbDqcVCSrL4aOo3wFK1Q69X86FBDExjxkCkjvzDKg9U",
    logo: amazonLogo,
    logoAlt: "Amazon",
    title: "Amazon",
    description: t("Amazon DE: Altruist Urban, German delivery"),
  },
  {
    id: "cyprus",
    regionLabel: t("CY"),
    comingSoon: false,
    tone: "primary",
    href: "https://pinout.cloud/shop/altruist",
    logo: pinoutLogo,
    logoAlt: "Pinout",
    title: "Pinout",
    description: t("Altruist air quality sensors with installation and setup in Cyprus"),
  },
  {
    id: "ru_cis",
    regionLabel: t("CIS"),
    comingSoon: false,
    tone: "primary",
    href: "https://market.yandex.ru/search?generalContext=t%3Dmerchant%3Bi%3D1%3Bmrch%3D216593109%3B&rs=eJwzEvjEyMvBKLDwEKsEg0bTnOfsACoUBRA%2C&merchant-filter=216593109",
    logo: yandexLogo,
    logoAlt: t("Yandex Market"),
    title: t("Yandex Market"),
    description: t("Various Altruist options in CIS countries from a local supplier"),
  },
]);
</script>

<style scoped>
.shops {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: calc(var(--gap) * 1.2);
  margin-top: calc(var(--gap) * 1.2);
}

@supports (grid-template-rows: subgrid) {
  .shops {
    grid-template-rows: repeat(2, auto minmax(88px, auto) auto);
  }
}

.shop {
  --shop-accent: var(--color-link);
  --ui-surface-border: color-mix(in srgb, var(--shop-accent), transparent 55%);
  --ui-surface-bg: color-mix(in srgb, var(--app-bodybg), transparent 6%);
  --ui-surface-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);

  display: grid;
  grid-template-rows: auto minmax(88px, auto) auto;
  gap: calc(var(--gap) * 0.65);
  padding: calc(var(--gap) * 1.1);
  text-decoration: none;
  color: inherit;
  min-height: 0;
}

@supports (grid-template-rows: subgrid) {
  .shop {
    grid-template-rows: subgrid;
    grid-row: span 3;
  }
}

.shop.ui-surface:hover,
.shop.ui-surface:focus-visible {
  background: var(--ui-surface-bg);
  border-color: var(--ui-surface-border);
  box-shadow: var(--ui-surface-shadow);
  transform: none;
  text-decoration: none;
}

.shop[data-tone="neutral"] {
  --shop-accent: color-mix(in srgb, var(--app-textcolor), transparent 45%);
  --ui-surface-border: color-mix(in srgb, var(--app-textcolor), transparent 72%);
  --ui-surface-bg: color-mix(in srgb, var(--app-bodybg), transparent 2%);
  --ui-surface-shadow: 0 10px 26px rgba(0, 0, 0, 0.05);
}

.shop--disabled {
  cursor: default;
  opacity: 0.85;
}

.shop__header {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  justify-items: flex-end;
  gap: calc(var(--gap) * 0.5);
}

.shop__pill {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.7rem;
  border-radius: 999px;
  font-weight: 700;
  font-size: calc(var(--font-size) * 0.82);
  letter-spacing: 0.02em;
  background: color-mix(in srgb, var(--shop-accent), transparent 0%);
  color: var(--color-light);
}

.shop[data-tone="neutral"] .shop__pill {
  background-color: var(--color-dark);
}

.shop[data-tone="neutral"] .shop__pill--soon {
  background-color: var(--color-orange);
}

.shop__logo {
  display: grid;
  place-items: center;
  align-self: stretch;
  width: 100%;
}

.shop__logo img {
  max-width: min(340px, 100%);
  max-height: 80px;
  width: auto;
  height: auto;
  object-fit: contain;
  border: none;
  margin: 0;
}

.shop__desc {
  margin: 0;
  max-width: 46ch;
  justify-self: center;
  text-align: center;
  color: var(--color-blue);
  font-size: calc(var(--font-size) * 0.95);
  font-weight: 600;
  line-height: 1.4;
}

.shop[data-tone="neutral"] .shop__desc {
  color: var(--color-dark);
}

@media (max-width: 900px) {
  .shops {
    grid-template-columns: 1fr;
  }

  @supports (grid-template-rows: subgrid) {
    .shops {
      grid-template-rows: repeat(4, auto minmax(88px, auto) auto);
    }
  }

  .shop__logo img {
    max-width: min(300px, 100%);
  }
}
</style>
