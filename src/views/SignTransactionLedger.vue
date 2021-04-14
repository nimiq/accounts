<template>
    <div v-if="request.kind === 'create-cashlink' ? !!cashlink : true" class="container">
        <SmallPage :class="{ 'account-details-shown': !!shownAccountDetails }">
            <PaymentInfoLine
                v-if="request.kind === 'checkout'"
                ref="info"
                class="blur-target"
                :cryptoAmount="{
                    amount: checkoutPaymentOptions.amount,
                    currency: checkoutPaymentOptions.currency,
                    decimals: checkoutPaymentOptions.decimals,
                }"
                :fiatAmount="request.fiatAmount && request.fiatCurrency ? {
                    amount: request.fiatAmount,
                    currency: request.fiatCurrency,
                } : null"
                :vendorMarkup="checkoutPaymentOptions.vendorMarkup"
                :networkFee="checkoutPaymentOptions.fee"
                :address="checkoutPaymentOptions.protocolSpecific.recipient
                    ? checkoutPaymentOptions.protocolSpecific.recipient.toUserFriendlyAddress()
                    : null"
                :origin="rpcState.origin"
                :shopLogoUrl="request.shopLogoUrl"
                :startTime="request.time"
                :endTime="checkoutPaymentOptions.expires"
            />
            <PageHeader :back-arrow="request.kind === 'checkout' || request.kind === 'create-cashlink'"
                @back="_back" class="blur-target">
                {{
                    request.kind === 'checkout'
                        ? $t('Verify Payment')
                        : request.kind === 'create-cashlink'
                            ? $t('Confirm Cashlink')
                            : $t('Confirm Transaction')
                }}
            </PageHeader>

            <div class="accounts">
                <Account layout="column"
                    :address="senderDetails.address"
                    :label="senderDetails.label"
                    @click.native="shownAccountDetails = senderDetails"
                    class="blur-target">
                </Account>
                <ArrowRightIcon class="arrow-right blur-target"/>
                <Account layout="column"
                    :address="recipientDetails.address"
                    :label="recipientDetails.label"
                    :image="recipientDetails.image"
                    :displayAsCashlink="recipientDetails.isCashlink"
                    @click.native="shownAccountDetails = recipientDetails.isCashlink ? null : recipientDetails"
                    class="blur-target">
                </Account>
            </div>

            <hr class="blur-target">

            <Amount class="value nq-light-blue blur-target"
                :amount="checkoutPaymentOptions ? checkoutPaymentOptions.amount : (cashlink || request).value"
                :minDecimals="2"
                :maxDecimals="5"
            />

            <div v-if="checkoutPaymentOptions ? checkoutPaymentOptions.fee : (cashlink || request).fee"
                class="fee nq-text-s blur-target">
                + <Amount
                    :amount="checkoutPaymentOptions
                        ? checkoutPaymentOptions.fee
                        : (cashlink || request).fee"
                    :minDecimals="2" :maxDecimals="5"
                /> {{ $t('fee') }}
            </div>

            <div v-if="transactionData" class="data nq-text blur-target">
                {{ transactionData }}
            </div>

            <div class="bottom-container blur-target" :class="{ 'full-height': state !== constructor.State.OVERVIEW }">
                <LedgerUi ref="ledger-ui" small></LedgerUi>
                <transition name="transition-fade">
                    <StatusScreen v-if="state !== constructor.State.OVERVIEW"
                        :state="statusScreenState"
                        :title="statusScreenTitle"
                        :mainAction="state === constructor.State.EXPIRED ? 'Go back to shop' : null"
                        @main-action="_close"
                    >
                        <template v-if="state === constructor.State.EXPIRED" v-slot:warning>
                            <StopwatchIcon class="stopwatch-icon"/>
                            <h1 class="title nq-h1">{{ statusScreenTitle }}</h1>
                            <p class="message nq-text">{{ $t('Please go back to the shop and restart the process.') }}</p>
                        </template>
                    </StatusScreen>
                </transition>
            </div>

            <transition name="transition-fade">
                <AccountDetails v-if="shownAccountDetails"
                    :address="shownAccountDetails.address"
                    :image="shownAccountDetails.image"
                    :label="shownAccountDetails.label"
                    :walletLabel="shownAccountDetails.walletLabel"
                    :balance="shownAccountDetails.balance"
                    @close="shownAccountDetails = null">
                </AccountDetails>
            </transition>
        </SmallPage>

        <GlobalClose :buttonLabel="request.kind === 'checkout' ? $t('Cancel payment') : '' /* use default */"
            :onClose="_close" :hidden="state !== constructor.State.OVERVIEW" />
        <Network ref="network" :visible="false"/>
    </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import {
    Account,
    AccountDetails,
    Amount,
    ArrowRightIcon,
    PageBody,
    PageHeader,
    PaymentInfoLine,
    SmallPage,
    StopwatchIcon,
} from '@nimiq/vue-components';
import Network from '../components/Network.vue';
import LedgerApi, { RequestTypeNimiq as LedgerApiRequestType } from '@nimiq/ledger-api';
import StatusScreen from '../components/StatusScreen.vue';
import GlobalClose from '../components/GlobalClose.vue';
import LedgerUi from '../components/LedgerUi.vue';
import { Static } from '../lib/StaticStore';
import { Getter } from 'vuex-class';
import { State as RpcState } from '@nimiq/rpc';
import { ParsedCreateCashlinkRequest, ParsedCheckoutRequest, ParsedSignTransactionRequest } from '../lib/RequestTypes';
import { Currency, RequestType } from '../lib/PublicRequestTypes';
import { WalletInfo } from '../lib/WalletInfo';
import { CASHLINK_FUNDING_DATA, ERROR_CANCELED, ERROR_REQUEST_TIMED_OUT, TX_VALIDITY_WINDOW } from '../lib/Constants';
import { ParsedNimiqDirectPaymentOptions } from '../lib/paymentOptions/NimiqPaymentOptions';
import { Utf8Tools } from '@nimiq/utils';
import Config from 'config';
import Cashlink from '../lib/Cashlink';
import { CashlinkStore } from '../lib/CashlinkStore';
import CheckoutServerApi from '../lib/CheckoutServerApi';

interface AccountDetailsData {
    address: string;
    label: string;
    image?: string;
    walletLabel?: string;
    balance?: number;
    isCashlink?: boolean;
}

@Component({components: {
    Account,
    PageBody,
    PageHeader,
    PaymentInfoLine,
    SmallPage,
    LedgerUi,
    StatusScreen,
    GlobalClose,
    AccountDetails,
    Network,
    Amount,
    ArrowRightIcon,
    StopwatchIcon,
}})
export default class SignTransactionLedger extends Vue {
    private static readonly State = {
        OVERVIEW: 'overview',
        SENDING_TRANSACTION: 'sending-transaction',
        FINISHED: 'finished',
        EXPIRED: 'expired',
    };

    @Static private rpcState!: RpcState;
    @Static private request!: ParsedSignTransactionRequest | ParsedCheckoutRequest | ParsedCreateCashlinkRequest;
    @Static private cashlink?: Cashlink;
    @Getter private findWalletByAddress!: (address: string, includeContracts: boolean) => WalletInfo | undefined;

    private state: string = SignTransactionLedger.State.OVERVIEW;
    private senderDetails: AccountDetailsData = { address: '', label: '' };
    private recipientDetails: AccountDetailsData = { address: '', label: ''};
    private shownAccountDetails: AccountDetailsData | null = null;
    private isDestroyed: boolean = false;
    private _checkoutExpiryTimeout: number = -1;

    private async mounted() {
        const network = this.$refs.network as Network;

        // collect payment information
        let sender: ParsedSignTransactionRequest['sender'];
        let recipient: Nimiq.Address;
        let value: number;
        let fee: number;
        let validityStartHeightPromise: Promise<number>;
        let data: Uint8Array | undefined;
        let flags: number;
        if (this.request.kind === RequestType.SIGN_TRANSACTION) {
            // direct sign transaction request invocation
            const signTransactionRequest = this.request as ParsedSignTransactionRequest;
            ({ sender, recipient, value, fee, data, flags } = signTransactionRequest);
            validityStartHeightPromise = Promise.resolve(signTransactionRequest.validityStartHeight);

            const recipientUserFriendlyAddress = signTransactionRequest.recipient.toUserFriendlyAddress();
            this.recipientDetails = {
                address: recipientUserFriendlyAddress,
                label: recipientUserFriendlyAddress,
            };
        } else if (this.request.kind === RequestType.CHECKOUT) {
            // coming from checkout
            const checkoutRequest = this.request as ParsedCheckoutRequest;
            const $subtitle = document.querySelector('.logo .logo-subtitle')!;
            $subtitle.textContent = 'Checkout'; // reapply the checkout subtitle in case the page was reloaded
            document.title = 'Nimiq Checkout';

            // Update checkout payment options. This is typically instant even after reload as CheckoutServerApi caches
            // the data previously fetched in checkout.
            const checkoutPaymentOptions = this.checkoutPaymentOptions!;
            if (checkoutRequest.callbackUrl && checkoutRequest.csrf) {
                try {
                    const fetchedPaymentOptions = await CheckoutServerApi.fetchPaymentOption(
                        checkoutRequest.callbackUrl,
                        checkoutPaymentOptions.currency,
                        checkoutPaymentOptions.type,
                        checkoutRequest.csrf,
                    );
                    checkoutPaymentOptions.update(fetchedPaymentOptions);
                } catch (e) {
                    this.$rpc.reject(e);
                    return;
                }
            }
            if (!checkoutPaymentOptions.protocolSpecific.recipient) {
                this.$rpc.reject(new Error('Failed to fetch checkout recipient.'));
                return;
            }

            sender = Nimiq.Address.fromString(this.$store.state.activeUserFriendlyAddress);
            ({ amount: value, fee } = checkoutPaymentOptions);
            ({ recipient, flags, extraData: data } = checkoutPaymentOptions.protocolSpecific);

            this.recipientDetails = {
                address: recipient.toUserFriendlyAddress(),
                label: this.rpcState.origin.split('://')[1],
                image: checkoutRequest.shopLogoUrl,
            };

            // Usually instant as synced in checkout. Only on reload we have to resync.
            validityStartHeightPromise = network.getBlockchainHeight().then((blockchainHeight) =>
                blockchainHeight + 1 // The next block is the earliest for which tx are accepted by standard miners
                - TX_VALIDITY_WINDOW
                + checkoutPaymentOptions.protocolSpecific.validityDuration,
            );

            // synchronize time in background
            if (checkoutPaymentOptions.expires) {
                this._initializeCheckoutExpiryTimer().catch((e) => this.$rpc.reject(e));
            }
        } else if (this.request.kind === RequestType.CREATE_CASHLINK) {
            // coming from cashlink create
            if (!this.cashlink) {
                this.$rpc.reject( new Error('Ledger Cashlink Signing expects the Cashlink to sign to be in the '
                    + 'static store.'));
                return;
            }
            sender = Nimiq.Address.fromString(this.$store.state.activeUserFriendlyAddress);
            ({ recipient, value, fee } = this.cashlink!.getFundingDetails());
            validityStartHeightPromise = network.getBlockchainHeight().then((blockchainHeight) => blockchainHeight + 1);
            data = CASHLINK_FUNDING_DATA;
            flags = Nimiq.Transaction.Flag.NONE;

            this.recipientDetails = {
                address: this.cashlink.address.toUserFriendlyAddress(),
                label: this.$t('New Cashlink') as string,
                isCashlink: true,
            };
        } else if (history.length >= 3) {
            // First history entry is root, the second an original request handler invoking the transaction signing
            // and the third is this one. If there was an original request handler calling us but the intermediate
            // transaction signing request was lost on reload and instead the original request recovered from the
            // RPC state, navigate back to the original request handler.
            // TODO implementing a proper request call stack instead of the originalRouteName hack would avoid this
            history.back();
            return;
        } else {
            this.$rpc.reject(new Error('Legder Transaction Signing must be invoked via sign-transaction, '
                + 'checkout or cashlink requests.'));
            return;
        }

        let senderAddress: Nimiq.Address;
        let senderType: Nimiq.Account.Type | undefined;
        let signerKeyId: string;
        let signerKeyPath: string;

        if (sender instanceof Nimiq.Address) {
            // we know that these exist as their existence was already checked in RpcApi.ts
            const senderUserFriendlyAddress = sender.toUserFriendlyAddress();
            const senderAccount = this.findWalletByAddress(senderUserFriendlyAddress, true)!;
            const senderContract = senderAccount.findContractByAddress(sender);
            const signer = senderAccount.findSignerForAddress(sender)!;

            senderAddress = sender;
            senderType = senderContract ? senderContract.type : Nimiq.Account.Type.BASIC;
            signerKeyId = senderAccount.keyId;
            signerKeyPath = signer.path;

            this.senderDetails = {
                address: senderUserFriendlyAddress,
                label: (senderContract || signer).label || senderUserFriendlyAddress,
                walletLabel: senderAccount.label,
                balance: (senderContract || signer).balance,
            };
        } else {
            ({
                address: senderAddress,
                type: senderType,
                signerKeyId,
                signerKeyPath,
            } = sender);
            const senderUserFriendlyAddress = senderAddress.toUserFriendlyAddress();

            this.senderDetails = {
                address: senderUserFriendlyAddress,
                label: sender.label || senderUserFriendlyAddress,
            };
        }

        // If user left this view in the mean time, don't continue signing / sending the transaction
        if (this.isDestroyed) return;

        const transactionInfo = {
            sender: senderAddress,
            senderType,
            recipient,
            value,
            fee: fee || 0,
            network: Config.network,
            extraData: data,
            flags,
        };

        // Check whether transaction was already signed but not successfully sent before user reloaded the page.
        let signedTransaction = network.getUnrelayedTransactions(transactionInfo)[0];
        if (!signedTransaction) {
            let validityStartHeight;
            try {
                validityStartHeight = await validityStartHeightPromise;
            } catch (e) {
                this.$rpc.reject(e);
                return;
            }

            try {
                signedTransaction = await LedgerApi.Nimiq.signTransaction({
                    ...transactionInfo,
                    validityStartHeight,
                }, signerKeyPath, signerKeyId);
            } catch (e) {
                if (this.isDestroyed) return; // user is not on this view anymore
                // If cancelled and not expired, handle the exception. Otherwise just keep the ledger ui / expiry error
                // message displayed.
                if (this.state !== SignTransactionLedger.State.EXPIRED
                    && e.message.toLowerCase().indexOf('cancelled') !== -1) {
                    const isCheckoutRequestWithManuallySelectedAddress = this.request.kind === RequestType.CHECKOUT
                        && (
                            !this.checkoutPaymentOptions!.protocolSpecific.sender
                            || !senderAddress.equals(this.checkoutPaymentOptions!.protocolSpecific.sender)
                        );

                    if (isCheckoutRequestWithManuallySelectedAddress
                        || this.request.kind === RequestType.CREATE_CASHLINK) {
                        // If user got here after selecting an account in the checkout flow (which was not automatically
                        // selected via the checkout request) he might want to switch to another one
                        this._back();
                    } else {
                        this._close();
                    }
                }
                return;
            }
        }

        this.shownAccountDetails = null;

        // If user left this view in the mean time, don't continue
        if (this.isDestroyed) return;

        // send transaction to network and finish
        let result;
        if (this.request.kind === RequestType.CHECKOUT || this.request.kind === RequestType.CREATE_CASHLINK) {
            this.state = SignTransactionLedger.State.SENDING_TRANSACTION;
            if (this.cashlink) {
                // Store cashlink in database first to be safe when browser crashes during sending
                await CashlinkStore.Instance.put(this.cashlink);
            }
            result = await network.sendToNetwork(signedTransaction);
        } else {
            // request.kind === SIGN_TRANSACTION
            result = await network.makeSignTransactionResult(signedTransaction);
        }

        if (this.request.kind !== RequestType.CREATE_CASHLINK) {
            this.state = SignTransactionLedger.State.FINISHED;
            await new Promise((resolve) => setTimeout(resolve, StatusScreen.SUCCESS_REDIRECT_DELAY));
            this.$rpc.resolve(result);
        } else {
            this.$router.replace({name: RequestType.MANAGE_CASHLINK});
        }
    }

    private destroyed() {
        this.isDestroyed = true;
        clearTimeout(this._checkoutExpiryTimeout);
        this._cancelLedgerRequest();
    }

    private get checkoutPaymentOptions() {
        if (this.request.kind !== RequestType.CHECKOUT) return null;
        const checkoutRequest = this.request as ParsedCheckoutRequest;
        return checkoutRequest.paymentOptions.find(
            (option) => option.currency === Currency.NIM,
        ) as ParsedNimiqDirectPaymentOptions;
    }

    private get transactionData() {
        if (this.request.kind === RequestType.CREATE_CASHLINK) {
            return this.cashlink ? this.cashlink.message : null;
        }

        let data;
        let flags;
        if (this.request.kind === RequestType.SIGN_TRANSACTION) {
            ({data, flags} = this.request as ParsedSignTransactionRequest);
        } else {
            ({extraData: data, flags} = this.checkoutPaymentOptions!.protocolSpecific);
        }

        if (!data || data.length === 0) {
            return null;
        }

        // tslint:disable-next-line no-bitwise
        if ((flags & Nimiq.Transaction.Flag.CONTRACT_CREATION) > 0) {
            // TODO: Decode contract creation transactions
            // return ...
        }

        return Utf8Tools.isValidUtf8(data, true)
            ? Utf8Tools.utf8ByteArrayToString(data)
            : Nimiq.BufferUtils.toHex(data);
    }

    private get statusScreenState() {
        switch (this.state) {
            case SignTransactionLedger.State.FINISHED:
                return StatusScreen.State.SUCCESS;
            case SignTransactionLedger.State.EXPIRED:
                return StatusScreen.State.WARNING;
            default:
                return StatusScreen.State.LOADING;
        }
    }

    private get statusScreenTitle() {
        switch (this.state) {
            case SignTransactionLedger.State.SENDING_TRANSACTION:
                return this.request.kind === RequestType.CREATE_CASHLINK
                    ? this.$t('Creating your Cashlink') as string
                    : this.$t('Sending Transaction') as string;
            case SignTransactionLedger.State.FINISHED:
                return this.request.kind === RequestType.SIGN_TRANSACTION
                    ? this.$t('Transaction Signed') as string
                    : this.$t('Transaction Sent') as string;
            case SignTransactionLedger.State.EXPIRED:
                return this.$t('The offer expired.') as string;
            default:
                return '';
        }
    }

    private async _initializeCheckoutExpiryTimer() {
        if (!this.checkoutPaymentOptions || !this.checkoutPaymentOptions.expires) return;
        const checkoutRequest = this.request as ParsedCheckoutRequest;
        if (!checkoutRequest.callbackUrl || !checkoutRequest.csrf) {
            throw new Error('callbackUrl and csrf token are required to fetch time.');
        }
        const referenceTime = await CheckoutServerApi.fetchTime(checkoutRequest.callbackUrl, checkoutRequest.csrf);
        (this.$refs.info as PaymentInfoLine).setTime(referenceTime);
        clearTimeout(this._checkoutExpiryTimeout);
        this._checkoutExpiryTimeout = window.setTimeout(
            () => {
                this.shownAccountDetails = null;
                this.state = SignTransactionLedger.State.EXPIRED;
                this._cancelLedgerRequest();
            },
            this.checkoutPaymentOptions.expires - referenceTime,
        );
    }

    private _back() {
        window.history.back();
    }

    private _close() {
        if (this.state !== SignTransactionLedger.State.OVERVIEW
            && this.state !== SignTransactionLedger.State.EXPIRED) return;
        const error = this.state === SignTransactionLedger.State.EXPIRED ? ERROR_REQUEST_TIMED_OUT : ERROR_CANCELED;
        this.$rpc.reject(new Error(error));
    }

    private _cancelLedgerRequest() {
        LedgerApi.disconnect(
            /* cancelRequest */ true,
            /* requestTypeToDisconnect */ LedgerApiRequestType.SIGN_TRANSACTION,
        );
    }

    @Watch('shownAccountDetails')
    @Watch('state')
    private _updateLedgerUiAnimationPlayState() {
        const ledgerUi = this.$refs['ledger-ui'] as LedgerUi;
        // Before blur pause immediately, otherwise update after unblur / transition to success screen
        const waitTime = !!this.shownAccountDetails ? 0 : 400;
        setTimeout(() => ledgerUi.$el.classList.toggle('animations-paused',
            !!this.shownAccountDetails || this.state !== SignTransactionLedger.State.OVERVIEW), waitTime);
    }
}
</script>

<style scoped>
    .small-page {
        /* TODO we should stick to the 70rem default height here, but auto is how the keyguard sign tx screen behaves */
        height: auto;
        min-height: 70.5rem;
        position: relative;
        align-items: center;
        padding: 3.75rem 4rem 26rem; /* bottom padding for bottom container + additional padding */
        overflow: hidden; /* avoid overflow of blurred elements */
    }

    .info-line {
        align-self: stretch;
        margin: -2rem -1.5rem 3rem;
    }

    .page-header {
        align-self: stretch;
        padding: 0;
        margin-bottom: 4rem; /* use margin instead of padding to reduce area on which to apply expensive blur */
    }

    .page-header >>> .page-header-back-button {
        top: 0;
        left: .5rem;
    }

    .accounts {
        display: flex;
        align-self: stretch;
        margin-top: .75rem;
        margin-bottom: 3.25rem;
    }

    .accounts .account {
        width: calc(50% - 1.5rem); /* minus half arrow width */
        padding: 0;
    }

    .accounts .account:not(.cashlink) {
        cursor: pointer;
    }

    .accounts .account:not(.cashlink) >>> .identicon {
        transition: transform 0.45s ease;
    }

    .accounts .account:not(.cashlink):hover >>> .identicon {
        transform: scale(1.1);
    }

    .accounts .account.cashlink >>> .label {
        opacity: .5;
        line-height: 1.5;
    }

    .accounts .arrow-right {
        font-size: 3rem;
        margin-top: 3.5rem;
        color: var(--nimiq-light-blue);
    }

    hr {
        width: 100%;
        height: 1px;
        margin: 0;
        border: none;
        background: #1F2348;
        opacity: .1;
    }

    .value {
        font-size: 5rem;
        margin-top: 2rem;
    }

    .value >>> .nim {
        margin-left: -.25rem;
        font-size: 2.25rem;
        font-weight: 700;
    }

    .fee {
        opacity: .5;
    }

    .data {
        margin: .25rem 3rem 0;
        opacity: 1;
        color: var(--nimiq-blue);
    }

    .bottom-container {
        position: absolute;
        width: 100%;
        height: 23rem;
        bottom: 0;
        z-index: 0;
        transition: filter .4s, height .4s !important;
    }

    .bottom-container.full-height {
        height: 100%;
    }

    .bottom-container > * {
        position: absolute;
        top: 0;
    }

    .ledger-ui.animations-paused >>> * {
        animation-play-state: paused !important;
        transition: none !important;
    }

    .status-screen {
        transition: opacity .4s;
    }

    .status-screen .stopwatch-icon {
        font-size: 15.5rem;
    }

    .account-details {
        position: absolute;
        top: 0;
        transition: opacity .4s;
        background: rgba(255, 255, 255, .875); /* equivalent to keyguard: .5 on blurred and .75 on account details */
    }

    .blur-target {
        transition: filter .4s;
    }

    .account-details-shown .blur-target {
        filter: blur(20px);
    }
    .account-details-shown .bottom-container {
        filter: blur(35px);
    }
</style>
