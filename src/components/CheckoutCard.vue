<script lang="ts">
import { Vue, Prop } from 'vue-property-decorator';
import { State as RpcState } from '@nimiq/rpc';
import { AvailableParsedPaymentOptions, ParsedCheckoutRequest } from '../lib/RequestTypes';
import { Static } from '../lib/StaticStore';
import StatusScreen from './StatusScreen.vue';
import CheckoutServerApi, { GetStateResponse } from '../lib/CheckoutServerApi';
import { PaymentInfoLine } from '@nimiq/vue-components';
import { ERROR_REQUEST_TIMED_OUT, HISTORY_KEY_SELECTED_CURRENCY } from '../lib/Constants';
import { PaymentState } from '../../client/PublicRequestTypes';

export default class CheckoutCard<
    Parsed extends AvailableParsedPaymentOptions,
> extends Vue {
    protected optionTimeout: number = -1;

    @Prop(Object) protected paymentOptions!: Parsed;
    @Static protected rpcState!: RpcState;
    @Static protected request!: ParsedCheckoutRequest;

    protected lastPaymentState?: GetStateResponse;
    protected timeOffsetPromise: Promise<number> = Promise.resolve(0);
    protected timeoutReached: boolean = false;
    protected checkNetworkInterval: number = -1;
    protected paymentState: PaymentState = PaymentState.NOT_FOUND;
    protected selected: boolean = false;
    protected hasCurrencyInfo!: boolean;
    protected showStatusScreen: boolean = false;
    protected statusScreenState = StatusScreen.State.LOADING;
    protected statusScreenTitle: string = '';
    protected statusScreenStatus: string = '';
    protected statusScreenMessage: string = '';
    protected statusScreenMainActionText: string = '';
    protected statusScreenMainAction: () => void = () => console.warn('statusScreenMainAction not set.');

    protected async created() {
        this.hasCurrencyInfo = this.request.paymentOptions.length > 1
            && (!history.state || !history.state[HISTORY_KEY_SELECTED_CURRENCY]);

        // First fetch current state to check whether user already paid and synchronize the time. We can only do this if
        // a callbackUrl was provided. Note that for NIM no merchant server callbackUrl is strictly required as for NIM
        // we can detect payments ourselves (see RequestParser).
        if (this.request.callbackUrl) {
            const statePromise = this.getState();
            this.timeOffsetPromise = statePromise.then((state) => state.time - Date.now());
            try {
                this.lastPaymentState = await statePromise;
            } catch (e) {
                this.$rpc.reject(e);
                return false;
            }
        }

        // If history.state does have an entry for this currencies previous selection, select it again
        if (window.history.state
            && window.history.state[HISTORY_KEY_SELECTED_CURRENCY] === this.paymentOptions.currency
            && !await this.selectCurrency()) {
            return false;
        }

        if (this.paymentOptions.expires) {
            this.setupTimeout();
        }
        return true;
    }

    protected async mounted() {
        if (this.request.callbackUrl && this.$refs.info) {
            (this.$refs.info as PaymentInfoLine).setTime((await this.timeOffsetPromise) + Date.now());
        }
    }

    protected destroyed() {
        if (this.optionTimeout) clearTimeout(this.optionTimeout);
    }

    protected get manualPaymentDetails(): Array<{ label: string, value: number | string | { [key: string]: any } }> {
        // can be extended by child classes with additional currency specific payment details
        if (!this.paymentOptions.protocolSpecific.recipient) return [];
        return [{
            label: 'Address',
            value: this.paymentOptions.protocolSpecific.recipient,
        }];
    }

    protected async getState() {
        if (!this.request.callbackUrl || !this.request.csrf) {
            throw new Error('Can\'t get state without callbackUrl and csrf token');
        }

        const fetchedState = await CheckoutServerApi.getState(this.request.callbackUrl, this.request.csrf);
        this.paymentState = fetchedState.payment_state;
        if (fetchedState.payment_accepted) {
            window.clearInterval(this.checkNetworkInterval);
            window.clearTimeout(this.optionTimeout);
            if (fetchedState.payment_state === PaymentState.PAID) {
                this.showSuccessScreen();
            } else if (fetchedState.payment_state === PaymentState.OVERPAID) {
                // TODO: indicate user he paid too much and needs to contact support
                // For now is an accepted payment the same way a correctly paid payment is.
                this.showSuccessScreen();
            } else {
                throw new Error('Incompatible combination for payment_state and payment_accepted.');
            }
            return fetchedState;
        } else if (fetchedState.payment_state === PaymentState.UNDERPAID) {
            this.showUnderpaidWarningScreen();
        }
        // else is PaymentState.NOT_FOUND which necessitates no action

        if (this.timeoutReached) {
            window.clearInterval(this.checkNetworkInterval);
            this.timedOut();
        }
        return fetchedState;
    }

    protected async fetchPaymentOption(): Promise<void> {
        let fetchedData: any;

        this.statusScreenState = StatusScreen.State.LOADING;
        this.statusScreenTitle = this.$t('Collecting payment details') as string;
        this.statusScreenStatus = '';
        this.showStatusScreen = true;

        if (!this.request.callbackUrl || !this.request.csrf) {
            throw new Error('Can\'t fetch payment details without callbackUrl and csrf token');
        }
        fetchedData = await CheckoutServerApi.fetchPaymentOption(
            this.request.callbackUrl,
            this.paymentOptions.currency,
            this.paymentOptions.type,
            this.request.csrf,
        );

        // @ts-ignore: Call signatures for generic union types are not currently supported, see
        // https://github.com/microsoft/TypeScript/issues/30613 and
        // https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-3.html#caveats
        this.paymentOptions.update(fetchedData);

        // update timeout in case that expiry changed
        if (fetchedData.expires) {
            this.setupTimeout();
        }
        this.showStatusScreen = this.timeoutReached;
        this.$forceUpdate();
    }

    protected async setupTimeout() {
        window.clearTimeout(this.optionTimeout);
        const referenceTime = Date.now() + (await this.timeOffsetPromise); // as a side effect ensures lastPaymentState
        if (!this.paymentOptions.expires || (this.lastPaymentState && this.lastPaymentState.payment_accepted)) return;
        const timeLeft = this.paymentOptions.expires - referenceTime;
        if (timeLeft > 0) {
            this.optionTimeout = window.setTimeout(
                // if the network check is active, only set a flag to be checked after the network check to avoid that
                // the offer gets displayed as expired when the network check would detect a successful payment.
                () => this.checkNetworkInterval !== -1 ? this.timeoutReached = true : this.timedOut(),
                timeLeft,
            );
        } else {
            this.checkNetworkInterval !== -1 ? this.timeoutReached = true : this.timedOut();
        }
    }

    protected timedOut() {
        this.timeoutReached = true;
        this.statusScreenTitle = this.$t('The offer expired.') as string;
        this.statusScreenMessage = this.$t('Please go back and restart the process.') as string;
        this.statusScreenMainAction = () => this.backToShop();
        this.statusScreenMainActionText = this.$t('Go back') as string;
        this.statusScreenState = StatusScreen.State.WARNING;
        this.showStatusScreen = true;
        this.$emit('expired', this.paymentOptions.currency);
    }

    protected backToShop() {
        this.$rpc.reject(new Error(ERROR_REQUEST_TIMED_OUT));
    }

    protected showSuccessScreen() {
        this.statusScreenTitle = this.$t('Payment successful') as string;
        this.statusScreenState = StatusScreen.State.SUCCESS;
        this.showStatusScreen = true;
        window.setTimeout(() => this.$rpc.resolve({success: true}),  StatusScreen.SUCCESS_REDIRECT_DELAY);
    }

    protected showUnderpaidWarningScreen() {
        this.paymentState = PaymentState.UNDERPAID;
        this.statusScreenTitle = this.$t('Incomplete payment') as string;
        this.statusScreenMessage = this.$t('You transferred an insufficient amount. '
            + 'Please contact the merchant for a refund. Restart to pay for your order.') as string;
        this.statusScreenMainAction = () => this.showStatusScreen = false;
        this.statusScreenMainActionText = this.$t('Restart Payment') as string;
        this.showStatusScreen = true;
        this.statusScreenState = StatusScreen.State.WARNING;
    }

    protected async selectCurrency() {
        window.clearTimeout(this.optionTimeout);
        this.selected = true;
        this.$emit('chosen', this.paymentOptions.currency);
        if (this.request.callbackUrl) {
            try {
                await this.fetchPaymentOption();
            } catch (e) {
                this.$rpc.reject(e);
                return false;
            }
        }
        if (!this.paymentOptions.protocolSpecific.recipient) {
            this.$rpc.reject(new Error('Failed to fetch recipient'));
            return false;
        }

        // set the selected currency in history state to enable re-selection
        window.history.replaceState(
            Object.assign({}, window.history.state, {[HISTORY_KEY_SELECTED_CURRENCY]: this.paymentOptions.currency}),
            '');
        return true;
    }
}
</script>
