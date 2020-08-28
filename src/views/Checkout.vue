<template>
    <div class="container">
        <div class="spacer"></div>
        <Carousel
            ref="carousel"
            :class="{
                ios: isIOS,
                'has-currency-info': initialCurrencies.length > 1,
            }"
            :entries="initialCurrencies"
            :animationDuration="500"
            :selected="selectedCurrency"
            :disabled="choosenCurrency !== null || availableCurrencies.length === 0"
            @select="selectedCurrency = $event">
            <template v-for="paymentOptions of request.paymentOptions" v-slot:[paymentOptions.currency]>
                <NimiqCheckoutCard
                    v-if="paymentOptions.currency === constructor.Currency.NIM"
                    :paymentOptions="paymentOptions"
                    :key="paymentOptions.currency"
                    :class="{
                        confirmed: choosenCurrency === paymentOptions.currency,
                        left: leftCard === constructor.Currency.NIM,
                        right: rightCard === constructor.Currency.NIM
                    }"
                    @chosen="chooseCurrency"
                    @expired="expired"/>
                <EthereumCheckoutCard
                    v-else-if="paymentOptions.currency === constructor.Currency.ETH"
                    :paymentOptions="paymentOptions"
                    :key="paymentOptions.currency"
                    :class="{
                        confirmed: choosenCurrency === paymentOptions.currency,
                        left: leftCard === constructor.Currency.ETH,
                        right: rightCard === constructor.Currency.ETH
                    }"
                    @chosen="chooseCurrency"
                    @expired="expired"/>
                <BitcoinCheckoutCard
                    v-else-if="paymentOptions.currency === constructor.Currency.BTC"
                    :paymentOptions="paymentOptions"
                    :key="paymentOptions.currency"
                    :class="{
                        confirmed: choosenCurrency === paymentOptions.currency,
                        left: leftCard === constructor.Currency.BTC,
                        right: rightCard === constructor.Currency.BTC
                    }"
                    @chosen="chooseCurrency"
                    @expired="expired"/>
            </template>
        </Carousel>

        <button class="global-close nq-button-s" @click="close">
            <ArrowLeftSmallIcon/>

            <i18n path="Cancel {payment}" :tag="false">
                <template #payment>
                    <span>{{ $t('Payment') }}</span>
                </template>
            </i18n>
        </button>
        <div class="spacer"></div>

        <transition name="transition-disclaimer">
            <component :is="screenFitsDisclaimer ? 'div' : 'BottomOverlay'"
                v-if="(screenFitsDisclaimer || !disclaimerRecentlyClosed) && !request.disableDisclaimer"
                ref="disclaimer"
                class="disclaimer"
                :class="{ 'long-disclaimer': hasLongDisclaimer }"
                @close="_closeDisclaimerOverlay"
            >
                <strong>{{ $t('Disclaimer') }}</strong>
                {{ $t('This Nimiq interface is non-custodial and solely used to bridge the payment sender with the payment recipient directly (P2P). Payment and deliverable fulfillment for payment are sole responsibility of those two respective parties.') }}
            </component>
        </transition>
    </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { BottomOverlay, Carousel, ArrowLeftSmallIcon } from '@nimiq/vue-components';
import { BrowserDetection } from '@nimiq/utils';
import { ParsedCheckoutRequest } from '../lib/RequestTypes';
import BitcoinCheckoutCard from '../components/BitcoinCheckoutCard.vue';
import EthereumCheckoutCard from '../components/EthereumCheckoutCard.vue';
import NimiqCheckoutCard from '../components/NimiqCheckoutCard.vue';
import { Currency as PublicCurrency } from '../../client/PublicRequestTypes';
import { State as RpcState } from '@nimiq/rpc';
import { Static } from '../lib/StaticStore';
import { ERROR_CANCELED, HISTORY_KEY_SELECTED_CURRENCY } from '../lib/Constants';

@Component({components: {
    ArrowLeftSmallIcon,
    BottomOverlay,
    Carousel,
    BitcoinCheckoutCard,
    EthereumCheckoutCard,
    NimiqCheckoutCard,
}})
class Checkout extends Vue {
    private static DISCLAIMER_CLOSED_STORAGE_KEY = 'checkout-disclaimer-last-closed';
    private static DISCLAIMER_CLOSED_EXPIRY = 24 * 60 * 60 * 1000; // One day

    @Static private rpcState!: RpcState;
    @Static private request!: ParsedCheckoutRequest;
    private choosenCurrency: PublicCurrency | null = null;
    private selectedCurrency: PublicCurrency | null = null;
    private leftCard: PublicCurrency | null = null;
    private rightCard: PublicCurrency | null = null;
    private initialCurrencies: PublicCurrency[] = [];
    private availableCurrencies: PublicCurrency[] = [];
    private readonly isIOS: boolean = BrowserDetection.isIOS();
    private disclaimerRecentlyClosed: boolean = false;
    private hasLongDisclaimer: boolean = false;
    private screenFitsDisclaimer: boolean = true;
    private dimensionsUpdateTimeout: number = -1;

    @Watch('selectedCurrency')
    private updateUnselected() {
        const entries = this.request.paymentOptions.map((paymentOptions) => paymentOptions.currency);
        if (entries.length === 1) return;

        const indexSelected = entries.indexOf(this.selectedCurrency!);
        if (entries.length === 2) {
            // We have two cards. Determine whether the non selected is to the left or to the right.
            this.leftCard = indexSelected === 1 ? entries[0] : null;
            this.rightCard = indexSelected === 1 ? null : entries[1];
        } else {
            this.leftCard = entries[(indexSelected - 1 + entries.length) % entries.length];
            this.rightCard = entries[(indexSelected + 1) % entries.length];
        }
    }

    private async created() {
        const $subtitle = document.querySelector('.logo .logo-subtitle')!;
        $subtitle.textContent = 'Checkout';
        this.initialCurrencies = this.request.paymentOptions.map((option) => option.currency).filter((currency) =>
            !history.state
            || !history.state[HISTORY_KEY_SELECTED_CURRENCY]
            || history.state[HISTORY_KEY_SELECTED_CURRENCY] === currency,
        );
        this.availableCurrencies = [ ...this.initialCurrencies ];
        if (this.availableCurrencies.includes(PublicCurrency.NIM)) {
            this.selectedCurrency = PublicCurrency.NIM;
        } else {
            this.selectedCurrency = this.availableCurrencies[0];
        }
        document.title = 'Nimiq Checkout';
        const lastDisclaimerClose = parseInt(window.localStorage[Checkout.DISCLAIMER_CLOSED_STORAGE_KEY], 10);
        this.disclaimerRecentlyClosed = !Number.isNaN(lastDisclaimerClose)
            && Date.now() - lastDisclaimerClose < Checkout.DISCLAIMER_CLOSED_EXPIRY;

        this._onResize = this._onResize.bind(this);
        window.addEventListener('resize', this._onResize);
        this._onResize();
    }

    private mounted() {
        const disclaimer = (this.$refs.disclaimer as BottomOverlay).$el || this.$refs.disclaimer;
        this.hasLongDisclaimer = !!disclaimer && disclaimer.textContent!.length > 250;
    }

    private destroyed() {
        window.removeEventListener('resize', this._onResize);
    }

    private close() {
        this.$rpc.reject(new Error(ERROR_CANCELED));
    }

    private chooseCurrency(currency: PublicCurrency) {
        this.selectedCurrency = currency;
        this.choosenCurrency = currency;
        (this.$refs.carousel as Carousel).updateDimensions();
    }

    private expired(currency: PublicCurrency) {
        this.availableCurrencies.splice(this.availableCurrencies.indexOf(currency), 1);
    }

    private _closeDisclaimerOverlay() {
        this.disclaimerRecentlyClosed = true;
        // store when the disclaimer was closed
        window.localStorage[Checkout.DISCLAIMER_CLOSED_STORAGE_KEY] = Date.now();
    }

    private _onResize() {
        const minWidth = 740; // Width below which English disclaimer would break into three lines.
        const minHeight = 890; // Height at which disclaimer fits at bottom, also with logos over carousel shown.
        this.screenFitsDisclaimer = window.innerWidth >= minWidth && window.innerHeight >= minHeight;
        // Throttle calls to carousel.updateDimensions as its an expensive call
        clearTimeout(this.dimensionsUpdateTimeout);
        this.dimensionsUpdateTimeout = window.setTimeout(
            () => (this.$refs.carousel as Carousel).updateDimensions(),
            150,
        );
    }
}

namespace Checkout {
    export const Currency = PublicCurrency;
}

export default Checkout;
</script>

<style scoped>
    .container {
        margin-top: -2rem; /* to get a bit more space for the long checkout page */
    }

    .container .spacer {
        flex-grow: 1; /* spacer for content distribution instead of margin which is used for disabled carousel offset */
    }

    .container >>> .nq-h1 {
        margin-top: 3.5rem;
        margin-bottom: 1rem;
        line-height: 1;
        text-align: center;
    }

    .carousel {
        --currency-info-height: 0rem;

        width: 100vw;
        box-sizing: border-box;
        padding: 0;
        overflow: hidden;
        transition: margin-top 1s var(--nimiq-ease);
    }

    .carousel.disabled.has-currency-info {
        --currency-info-height: 16rem;
        margin-top: calc(-1 * var(--currency-info-height));
    }

    .carousel >>> .payment-option:not(.confirmed) .nq-card {
        transition: transform .5s cubic-bezier(.67, 0, .16, 1);
    }
    .carousel >>> > :not(.selected) .left .nq-card {
        transform: translateX(8rem);
    }

    .carousel >>> > :not(.selected) .right .nq-card {
        transform: translateX(-8rem);
    }

    .carousel >>> .payment-option {
        padding-bottom: 5rem;
    }

    .carousel >>> .currency-info {
        display: flex;
        flex-direction: column;
        align-items: center;

        --currency-info-translate-y: -8.875rem;
        transition:
            transform .5s cubic-bezier(.67,0,.16,1),
            opacity .25s var(--nimiq-ease);
        transform: scale(1) translateY(0);
    }

    .carousel >>> > :not(.selected) .currency-info {
        transform: scale(1) translateY(var(--currency-info-translate-y));
    }

    .carousel.disabled >>> .currency-info {
        opacity: 0;
    }

    .carousel.disabled >>> .currency-info * {
        pointer-events: none !important;
    }

    /* Mobile Layout */
    @media (max-width: 500px) {
        .carousel.has-currency-info {
            --currency-info-height: 10rem;
        }

        .carousel >>> * {
            -webkit-tap-highlight-color: transparent;
        }

        .carousel >>> .payment-option {
            padding-bottom: 3rem;
        }

        .carousel >>> .currency-info {
            --currency-info-mobile-scale: .8;
            transform:
                scale(var(--currency-info-mobile-scale))
                translateY(calc(var(--currency-info-translate-y) / -5));
        }

        .carousel >>> > :not(.selected) .currency-info {
            transform:
                scale(var(--currency-info-mobile-scale))
                translateY(var(--currency-info-translate-y));
        }

        .carousel >>> > :not(.selected) .left .currency-info {
            transform:
                scale(var(--currency-info-mobile-scale))
                translateY(var(--currency-info-translate-y))
                translateX(8rem);
        }

        .carousel >>> > :not(.selected) .right .currency-info {
            transform:
                scale(var(--currency-info-mobile-scale))
                translateY(var(--currency-info-translate-y))
                translateX(-8rem);
        }

        .carousel >>> .currency-info .nq-h1 {
            margin-top: 0;
        }
    }

    @media (max-width: 450px) {
        .carousel {
            /* On mobile align currency infos via perspective as the positioning of the background cards doesn't really
            matter and alignment via translations would be too complicated as they depend on the card width and height
            which vary on mobile. */
            perspective-origin: 50% calc(var(--currency-info-height) + 2rem);
        }

        .carousel >>> .payment-option {
            padding-bottom: 0;
        }

        .carousel >>> .nq-card {
            width: 100vw;
            max-width: none;
            margin: 0;
        }

        .carousel >>> .currency-info {
            --currency-info-translate-y: -.9rem;
        }

        /* Make cards full height on mobile */
        .carousel >>> .nq-card {
            --ios-bottom-bar-height: 0px;
            /* 56px for mobile browser address bar */
            /* 7.5rem for Nimiq logo & cancel button */
            --available-mobile-height: calc(100vh - 7.5rem - 56px - var(--ios-bottom-bar-height));
            /* 1.5rem for additional padding to header */
            height: calc(var(--available-mobile-height) - var(--currency-info-height) - 1.5rem);
            min-height: 70.5rem;
        }

        /* IOS specific */
        .carousel.ios >>> .nq-card {
            --ios-bottom-bar-height: 74px;
        }

        .carousel >>> .confirmed .nq-card {
            height: var(--available-mobile-height);
        }

        /* make carousel bottom align on mobile */
        .carousel ~ .spacer {
            display: none;
        }
    }

    /* make empty padding in cards click through to cards behind */
    .carousel >>> > * {
        pointer-events: none;
    }

    .carousel >>> .currency-info > *,
    .carousel >>> .nq-card {
        pointer-events: all !important;
    }

    /* On desktop show placeholders when card is not selected */
    @media (min-width: 451px) {
        .carousel >>> .payment-option:not(.confirmed) .timer,
        .carousel >>> .payment-option:not(.confirmed) .nq-button,
        .carousel >>> .payment-option:not(.confirmed) .nq-button-s,
        .carousel >>> .payment-option:not(.confirmed) .nq-button-pill,
        .carousel >>> .payment-option:not(.confirmed) .nq-card > .nq-h1,
        .carousel >>> .payment-option:not(.confirmed) .info-line .account,
        .carousel >>> .payment-option:not(.confirmed) .info-line .amounts,
        .carousel >>> .payment-option:not(.confirmed) .nq-card-body .label,
        .carousel >>> .payment-option:not(.confirmed) .nq-card-body .amounts .crypto,
        .carousel >>> .payment-option:not(.confirmed) .nq-card-body .amounts .fee,
        .carousel >>> .payment-option:not(.confirmed) .account-list .amount,
        .carousel >>> .payment-option:not(.confirmed) .nq-card-footer .nq-link,
        .carousel >>> .payment-option:not(.confirmed) .account-selector .wallet-label,
        .carousel >>> .payment-option:not(.confirmed) .nq-card-body .identicon-and-label,
        .carousel >>> .payment-option:not(.confirmed) .account-list .identicon-and-label > *,
        .carousel >>> .payment-option:not(.confirmed) .nq-card .non-sufficient-balance .nq-text {
            position: relative;
        }

        .carousel >>> .payment-option:not(.confirmed) .nq-button::after,
        .carousel >>> .payment-option:not(.confirmed) .nq-button-s::after,
        .carousel >>> .payment-option:not(.confirmed) .nq-button-pill::after {
            transition: all .5s var(--nimiq-ease);
        }

        .carousel >>> .payment-option:not(.confirmed) .timer::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .nq-button::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .nq-button-s::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .nq-button-pill::after,
        .carousel >>> .payment-option:not(.confirmed) .nq-card > .nq-h1::after,
        .carousel >>> .payment-option:not(.confirmed) .info-line .account::after,
        .carousel >>> .payment-option:not(.confirmed) .info-line .amounts::after,
        .carousel >>> .payment-option:not(.confirmed) .nq-card-body .label::after,
        .carousel >>> .payment-option:not(.confirmed) .nq-card-body .amounts .crypto::after,
        .carousel >>> .payment-option:not(.confirmed) .nq-card-body .amounts .fee::after,
        .carousel >>> .payment-option:not(.confirmed) .account-list .amount::after,
        .carousel >>> .payment-option:not(.confirmed) .nq-card-footer .nq-link::after,
        .carousel >>> .payment-option:not(.confirmed) .account-selector .wallet-label::before,
        .carousel >>> .payment-option:not(.confirmed) .nq-card-body .identicon-and-label::after,
        .carousel >>> .payment-option:not(.confirmed) .account-list .identicon-and-label > *::after,
        .carousel >>> .payment-option:not(.confirmed) .nq-card .non-sufficient-balance .nq-text::after {
            --placeholder-size: 100%;
            --placeholder-width: var(--placeholder-size);
            --placeholder-height: var(--placeholder-size);
            content: '';
            position: absolute;
            top: calc((100% - var(--placeholder-height)) / 2);
            left: calc((100% - var(--placeholder-width)) / 2);
            width: var(--placeholder-width);
            height: var(--placeholder-height);
            background-color: #f2f2f4; /* --nimiq-blue 0.06 opacity */
            opacity: 0;
            border: none;
            border-radius: 500px;
            z-index: 2;
            transition: all .5s var(--nimiq-ease);
        }

        .carousel >>> .payment-option:not(.confirmed) .nq-card > .nq-h1::after {
            --placeholder-width: 85%;
        }

        .carousel >>> .payment-option:not(.confirmed) .info-line .amounts::after,
        .carousel >>> .payment-option:not(.confirmed) .info-line .account::after,
        .carousel >>> .payment-option:not(.confirmed) .account-selector .wallet-label::before {
            --placeholder-height: 3.25rem;
            box-shadow: 0 0 0 1rem var(--nimiq-card-bg);
        }

        .carousel >>> .payment-option:not(.confirmed) .info-line .account::after,
        .carousel >>> .payment-option:not(.confirmed) .account-selector .wallet-label::before {
            top: initial;
        }

        .carousel >>> .payment-option:not(.confirmed) .timer::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .nq-button::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .nq-button-s::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .nq-button-pill::after {
            --placeholder-size: 105%;
        }

        .carousel >>> .payment-option:not(.confirmed) .nq-card-body .identicon-and-label::after {
            --placeholder-size: 21rem;
            top: initial;
            left: initial;
            box-shadow: 0 0 0 4rem var(--nimiq-card-bg);
        }

        .carousel >>> .payment-option:not(.confirmed) .nq-card .non-sufficient-balance .nq-text::after {
            --placeholder-width: 90%;
        }

        .carousel >>> .payment-option:not(.confirmed) .nq-card > .nq-h1::after,
        .carousel >>> .payment-option:not(.confirmed) .nq-card-body .label::after,
        .carousel >>> .payment-option:not(.confirmed) .nq-card-body .amounts .crypto::after,
        .carousel >>> .payment-option:not(.confirmed) .nq-card-footer .nq-link::after,
        .carousel >>> .payment-option:not(.confirmed) .nq-card .non-sufficient-balance .nq-text::after {
            box-shadow: 0 0 0 .6rem var(--nimiq-card-bg);
        }

        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .timer::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .nq-button::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .nq-button-s::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .nq-button-pill::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .nq-card > .nq-h1::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .info-line .account::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .info-line .amounts::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .nq-card-body .label::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .account-list .amount::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .nq-card-body .amounts .crypto::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .nq-card-body .amounts .fee::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .nq-card-footer .nq-link::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .account-selector .wallet-label::before,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .nq-card-body .identicon-and-label::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .account-list .identicon-and-label > *::after,
        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .nq-card .non-sufficient-balance .nq-text::after {
            opacity: 1;
        }

        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .amounts {
            transition: border-top-color .5s var(--nimiq-ease);
            border-top-color: var(--nimiq-card-bg);
        }

        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .nq-button {
            transition: box-shadow .5s var(--nimiq-ease);
            box-shadow: none;
        }

        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .arrow-runway {
            transition: opacity .5s var(--nimiq-ease);
            opacity: 0;
        }

        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) .arrow-runway * {
            animation: unset; /* disable animation in background to avoid unnecessary rendering layers */
        }

        .carousel >>> .payment-option:not(.confirmed) video {
            transition: opacity .5s var(--nimiq-ease);
        }

        .carousel >>> > :not(.selected) .payment-option:not(.confirmed) video {
            opacity: 0;
        }
    }

    .global-close {
        margin-top: 0;
    }

    .disclaimer {
        transition: opacity .3s var(--nimiq-ease), max-height .3s var(--nimiq-ease);
    }

    .disclaimer:not(.bottom-overlay) {
        margin-bottom: 1rem;
        color: #1f234859; /* nimiq-blue with .35 opacity */
        font-size: 1.5rem;
        line-height: 1.3;
        font-weight: 600;
        text-align: center;
        overflow: hidden;
    }

    .disclaimer.transition-disclaimer-enter,
    .disclaimer.transition-disclaimer-leave-to {
        opacity: 0;
    }

    .disclaimer:not(.bottom-overlay).transition-disclaimer-enter,
    .disclaimer:not(.bottom-overlay).transition-disclaimer-leave-to {
        max-height: 0;
    }

    .disclaimer:not(.bottom-overlay).transition-disclaimer-enter-to,
    .disclaimer:not(.bottom-overlay).transition-disclaimer-leave {
        max-height: 4.625rem; /* Height of ~2.5 lines at which transition looks decent for 2 and 3 disclaimer lines */
    }

    .disclaimer > strong {
        font-weight: bold;
        line-height: 1;
        letter-spacing: .1rem;
        text-transform: uppercase;
    }

    .disclaimer.bottom-overlay > strong {
        font-size: 1.75rem;
        letter-spacing: .125rem;
        opacity: .5;
    }

    @media (max-width: 1800px) {
        .disclaimer.long-disclaimer:not(.bottom-overlay) {
            max-width: 115rem; /* break long disclaimer into 2 lines about equal in length (e.g. French) */
            margin-bottom: 1.5rem;
        }
    }

    @media (max-width: 1400px) {
        .disclaimer:not(.long-disclaimer):not(.bottom-overlay) {
            max-width: 92rem; /* break short disclaimer into 2 lines about equal in length (e.g. English) */
            margin-bottom: 1.5rem;
        }
    }

    @media (max-width: 1000px) {
        .disclaimer.long-disclaimer:not(.bottom-overlay) {
            /* make more space when long disclaimer breaks into 3 lines (e.g. French) */
            margin-top: -.5rem;
            margin-bottom: 1rem;
        }
    }
</style>
