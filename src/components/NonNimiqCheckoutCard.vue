<template>
    <div class="payment-option" :id="paymentOptions.currency">
        <CurrencyInfo v-if="hasCurrencyInfo"
            :currency="paymentOptions.currency"
            :fiatCurrency="request.fiatCurrency"
            :fiatFeeAmount="paymentOptions.fiatFee(request.fiatAmount)"
            :currencyIcon="icon"/>

        <div class="nq-card-wrapper">
            <transition name="transition-flip">
                <SmallPage v-if="!manualPaymentDetailsOpen" class="flip-primary">
                    <transition name="transition-fade">
                        <StatusScreen
                            v-if="showStatusScreen"
                            :state="statusScreenState"
                            :title="statusScreenTitle"
                            :status="statusScreenStatus"
                            :message="statusScreenMessage"
                            @main-action="statusScreenMainAction"
                            :mainAction="statusScreenMainActionText"
                        >
                            <template v-if="timeoutReached || paymentState === constructor.PaymentState.UNDERPAID" v-slot:warning>
                                <StopwatchIcon v-if="timeoutReached" class="stopwatch-icon"/>
                                <UnderPaymentIcon v-else class="under-payment-icon"/>
                                <h1 class="title nq-h1">{{ statusScreenTitle }}</h1>
                                <p v-if="statusScreenMessage" class="message nq-text">{{ statusScreenMessage }}</p>
                            </template>
                        </StatusScreen>
                    </transition>
                    <PaymentInfoLine v-if="rpcState"
                        ref="info"
                        :cryptoAmount="{
                            amount: paymentOptions.amount,
                            currency: paymentOptions.currency,
                            decimals: paymentOptions.decimals,
                        }"
                        :fiatAmount="request.fiatAmount && request.fiatCurrency ? {
                            amount: request.fiatAmount,
                            currency: request.fiatCurrency,
                        } : null"
                        :vendorMarkup="paymentOptions.vendorMarkup"
                        :networkFee="paymentOptions.fee"
                        :address="paymentOptions.protocolSpecific.recipient"
                        :origin="rpcState.origin"
                        :shopLogoUrl="request.shopLogoUrl"
                        :startTime="request.time"
                        :endTime="paymentOptions.expires" />
                    <h1 class="nq-h1" v-if="this.selected">
                        {{ $t('Send your transaction') }}
                    </h1>
                    <PageBody v-if="!this.selected">
                        <Account layout="column"
                            :image="request.shopLogoUrl"
                            :label="rpcState.origin.split('://')[1]"/>
                        <div class="amounts">
                            <Amount class="crypto nq-light-blue"
                                :currency="paymentOptions.currency"
                                :currencyDecimals="paymentOptions.decimals"
                                :minDecimals="0"
                                :maxDecimals="paymentOptions.decimals < 8 ? paymentOptions.decimals : 8"
                                :amount="paymentOptions.amount"
                            />
                            <div v-if="paymentOptions.fee !== 0" class="fee">
                                {{ $t('+ network fee') }}
                            </div>
                        </div>
                    </PageBody>
                    <PageBody v-else>
                        <p class="nq-notice warning">
                            {{ $t('Don’t close this window until confirmation.') }} <br />
                            {{ paymentOptions.feeString }}
                        </p>
                        <QrCode
                            :data="paymentLink"
                            :fill="{
                                type: 'radial-gradient',
                                position: [1, 1, 0, 1, 1, Math.sqrt(2)],
                                colorStops: [ [0, '#260133'], [1, '#1F2348'] ] // nimiq-blue
                            }"
                            :size="200"
                        />
                    </PageBody>
                    <PageFooter v-if="selected">
                        <button class="nq-button light-blue use-app-button"
                            :disabled="appNotFound"
                            @click="checkBlur"
                            :href="paymentLink"
                        >
                            <template v-if="appNotFound">
                                <span>{{ $t('No App found') }}</span>
                                <span>{{ $t('Please send the transaction manually') }}</span>
                            </template>
                            <template v-else>
                                {{ $t('Open Wallet App') }}
                            </template>
                        </button>
                        <p class="nq-text-s" @click="manualPaymentDetailsOpen = true" >
                            {{ $t('Enter manually') }}<CaretRightSmallIcon/>
                        </p>
                    </PageFooter>
                    <PageFooter v-else>
                        <button class="nq-button light-blue" @click="selectCurrency">
                            {{ $t('Pay with {currencyFullName}', { currencyFullName }) }}
                        </button>
                    </PageFooter>
                </SmallPage>
                <CheckoutManualPaymentDetails
                    v-else
                    :paymentDetails="manualPaymentDetails"
                    :paymentOptions="paymentOptions"
                    @close="manualPaymentDetailsOpen = false"
                    class="flip-secondary"
                />
            </transition>
        </div>
    </div>
</template>

<script lang="ts">
import { Component } from 'vue-property-decorator';
import {
    Account,
    CaretRightSmallIcon,
    PageBody,
    PageFooter,
    PaymentInfoLine,
    QrCode,
    SmallPage,
    StopwatchIcon,
    UnderPaymentIcon,
    Amount,
    FiatAmount,
} from '@nimiq/vue-components';
import { PaymentState as PublicPaymentState } from '../../client/PublicRequestTypes';
import { AvailableParsedPaymentOptions } from '../lib/RequestTypes';
import CheckoutCard from './CheckoutCard.vue';
import CurrencyInfo from './CurrencyInfo.vue';
import StatusScreen from './StatusScreen.vue';
import CheckoutManualPaymentDetails from './CheckoutManualPaymentDetails.vue';

@Component({components: {
    Account,
    CaretRightSmallIcon,
    CheckoutManualPaymentDetails,
    CurrencyInfo,
    PageBody,
    PageFooter,
    PaymentInfoLine,
    QrCode,
    SmallPage,
    StatusScreen,
    StopwatchIcon,
    UnderPaymentIcon,
    Amount,
    FiatAmount,
}})
class NonNimiqCheckoutCard<
    Parsed extends AvailableParsedPaymentOptions
> extends CheckoutCard<Parsed> {
    protected currencyFullName: string = ''; // to be set by child class
    protected appNotFound: boolean = false;

    protected manualPaymentDetailsOpen: boolean = false;

    protected async created() {
        return await super.created();
    }

    protected async mounted() {
        super.mounted();
        if (!this.currencyFullName) {
            this.currencyFullName = this.paymentOptions.currency; // just as a fallback in case not set by child class
        }
    }

    protected destroyed() {
        if (this.checkNetworkInterval) clearInterval(this.checkNetworkInterval);
        super.destroyed();
    }

    protected get paymentLink(): string {
        throw new Error('NonNimiqCheckoutCard.paymentLink() Needs to be implemented by child classes.');
    }

    protected async selectCurrency() {
        if (document.activeElement) {
            // prevent the “Open wallet app” button to have focus by default when clicking on the “Pay with…” button
            // (happens only on mobile devices)
            (document.activeElement as HTMLElement).blur();
        }
        if (this.request.callbackUrl) {
            this.statusScreenState = StatusScreen.State.LOADING;
            this.showStatusScreen = true;
        }
        if (!await super.selectCurrency()) return false;

        this.checkNetworkInterval = window.setInterval(async () => {
            this.lastPaymentState = await this.getState();
        }, 10000);

        return true;
    }

    protected timedOut() {
        this.manualPaymentDetailsOpen = false;
        super.timedOut();
    }

    protected showSuccessScreen() {
        this.manualPaymentDetailsOpen = false;
        super.showSuccessScreen();
    }

    protected showUnderpaidWarningScreen() {
        this.manualPaymentDetailsOpen = false;
        super.showUnderpaidWarningScreen();
    }

    protected checkBlur() {
        const blurTimeout = window.setTimeout(() => {
            this.appNotFound = true;
            window.onblur = null;
        }, 500);
        window.onblur = () => {
            window.clearTimeout(blurTimeout);
            window.onblur = null;
        };
    }
}

namespace NonNimiqCheckoutCard {
    export const PaymentState = PublicPaymentState;
}

export default NonNimiqCheckoutCard;
</script>

<style scoped>
    .currency-info h1 {
        display: flex;
        align-items: center;
        margin-bottom: 0;
    }

    .currency-info img,
    .currency-info .nq-icon {
        width: 4.5rem;
        height: 4.5rem;
        margin-right: 2rem;
    }

    .payment-option .small-page {
        position: relative;
        width: 52.5rem;
    }

    .payment-option .nq-card-wrapper {
        position: relative;
    }

    .payment-option .nq-card-wrapper {
        perspective: 250rem;
    }

    .nq-card-wrapper > .transition-flip-enter-active >>> .info-line .arrow-runway *,
    .nq-card-wrapper > .transition-flip-leave-active >>> .info-line .arrow-runway * {
        animation: unset; /* avoid unnecessary rendering layers caused by arrow animation which mess with the flip */
    }

    .status-screen {
        position: absolute;
        left: 0;
        top: 0;
        transition: opacity .3s var(--nimiq-ease);
    }

    .status-screen .stopwatch-icon {
        font-size: 15.5rem;
    }

    .status-screen .under-payment-icon {
        font-size: 18.75rem;
    }

    .payment-option .page-body {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-around;
        padding-top: 0;
        padding-bottom: 0;
        text-align: center;
        overflow: hidden;
    }

    .payment-option.confirmed .page-body {
        padding-bottom: 1rem;
    }

    /* Hide payment info line contents until currency selected. Only show timer. */
    .payment-option .info-line >>> > :not(.timer):not(.amounts) {
        transition: opacity .5s var(--nimiq-ease);
    }

    .payment-option:not(.confirmed) .info-line >>> > :not(.timer):not(.amounts) {
        opacity: 0;
        pointer-events: none;
    }

    .payment-option:not(.confirmed) .info-line >>> > .arrow-runway * {
        animation: unset; /* disable animation while hidden to avoid unnecessary rendering layers */
    }

    .payment-option .small-page {
        width: 52.5rem;
    }

    .payment-option .account,
    .payment-option .account >>> .identicon-and-label {
        width: 100%;
        flex-grow: 1;
    }

    .payment-option .account >>> .identicon-and-label .identicon {
        width: 21rem;
        height: 21rem;
    }

    .payment-option .account >>> .identicon-and-label .label {
        max-width: 100%;
        font-weight: 600;
        font-size: 3.5rem;
        line-height: 4rem;
        margin-top: 2.75rem;
        text-overflow: fade;
    }

    .payment-option .amounts {
        display: flex;
        flex-direction: column;
        flex-grow: 1;
        width: 100%;
        align-items: center;
        border-top: 0.125rem solid rgba(31, 35, 72, 0.1); /* based on nq-dark-blue */
    }

    .payment-option .amounts .crypto {
        margin-top: 3.5rem;
        font-weight: 600;
        font-size: 5rem;
        line-height: 5rem;
    }

    .payment-option .amounts .fee {
        margin-top: 1.75rem;
        font-size: 2rem;
        line-height: 2.75rem;
    }

    .page-footer {
        align-items: center;
    }

    .page-footer button.nq-button {
        line-height: 7.5rem;
        margin: 2rem 4.75rem 2rem;
        box-sizing: content-box;
        display: flex;
        flex-direction: column;
        justify-content: space-evenly;
        align-items: center;
        --padding: .625rem;
        padding-top: var(--padding);
        padding-bottom: var(--padding);
    }

    .page-footer button.nq-button + p.nq-text-s {
        align-self: center;
        color:  rgba(31, 35, 72, 0.5);
        align-items: center;
        margin: 0 0 1rem;
        display: flex;
        cursor: pointer;
    }

    .page-footer button.nq-button + p.nq-text-s > .nq-icon {
        --icon-size: 1.2rem;
        height: var(--icon-size);
        width: var(--icon-size);
    }

    .use-app-button > span {
        display: flex;
        line-height: 1;
    }

    .use-app-button > span + span {
        font-size: 1.625rem;
        text-transform: none;
        letter-spacing: normal;
    }
</style>
