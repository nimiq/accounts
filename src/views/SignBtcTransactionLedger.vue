<template>
    <div v-if="request.kind === 'sign-btc-transaction'" class="container">
        <SmallPage>
            <PageHeader>{{ $t('Confirm Transaction') }}</PageHeader>

            <div class="recipient">
                <div class="label-line">
                    <LabelAvatar :label="request.output.label" />
                    <div :class="{ italic: !request.output.label }">{{ request.output.label || $t('Unlabeled') }}</div>
                </div>
                <div class="address">{{ request.output.address }}</div>
            </div>

            <Amount class="value nq-light-blue"
                currency="btc"
                :amount="request.output.value"
                :currencyDecimals="8"
                :minDecimals="2"
                :maxDecimals="8"
            />

            <div class="fee nq-text-s">
                + <Amount
                    currency="btc"
                    :amount="fee"
                    :currencyDecimals="8"
                    :minDecimals="2"
                    :maxDecimals="8"
                />
                {{ $t('fee') }}
            </div>

            <div class="bottom-container" :class="{
                'full-height': state === State.FINISHED || state === State.SYNCING_FAILED,
            }">
                <LedgerUi small></LedgerUi>
                <transition name="transition-fade">
                    <StatusScreen v-if="state !== State.READY"
                        :state="statusScreenState"
                        :title="statusScreenTitle"
                        :status="statusScreenStatus"
                        :message="statusScreenMessage"
                        :mainAction="statusScreenAction"
                        @main-action="_statusScreenActionHandler"
                        :small="state === State.SYNCING">
                    </StatusScreen>
                </transition>
            </div>
        </SmallPage>

        <GlobalClose :hidden="state === State.FINISHED" />
    </div>
</template>

<script lang="ts">
import { Component } from 'vue-property-decorator';
import { SmallPage, PageHeader, Amount } from '@nimiq/vue-components';
import SignBtcTransaction, { BitcoinTransactionInfo } from './SignBtcTransaction.vue';
import StatusScreen from '../components/StatusScreen.vue';
import GlobalClose from '../components/GlobalClose.vue';
import LedgerUi from '../components/LedgerUi.vue';
import LabelAvatar from '../components/LabelAvatar.vue';
import LedgerApi, {
    TransactionInfoBitcoin as LedgerBitcoinTransactionInfo,
    RequestTypeBitcoin as LedgerApiRequestType,
} from '@nimiq/ledger-api';
import { RequestType } from '../lib/PublicRequestTypes';
import { SignedBtcTransaction } from '../lib/PublicRequestTypes';
import { ERROR_CANCELED } from '../lib/Constants';
import { WalletInfo } from '../lib/WalletInfo';
import { loadBitcoinJS } from '../lib/bitcoin/BitcoinJSLoader';
import { prepareBitcoinTransactionForLedgerSigning } from '../lib/bitcoin/BitcoinLedgerUtils';

@Component({components: {StatusScreen, SmallPage, PageHeader, Amount, GlobalClose, LedgerUi, LabelAvatar}})
export default class SignBtcTransactionLedger extends SignBtcTransaction {
    protected get State() {
        return {
            ...super.State,
            READY: 'ready',
            FINISHED: 'finished',
        };
    }

    // different than in parent class we always have to sync for fetching trusted inputs
    protected state: string = this.State.SYNCING;
    private fee!: number;
    private _isDestroyed: boolean = false;

    protected async created() {
        if (this.request.kind !== RequestType.SIGN_BTC_TRANSACTION) return; // see parent class
        // preload BitcoinJS
        loadBitcoinJS();
        // Note that vue-class-component transforms the inheritance into a merge of vue mixins where each class retains
        // its lifecycle hooks, therefore we don't need to call super.created() here.
        const { inputs, output, changeOutput } = this.request;
        const inputAmount = inputs.reduce((sum, { value }) => sum + value, 0);
        const outputAmount = output.value + (changeOutput ? changeOutput.value : 0);
        this.fee = inputAmount - outputAmount;
    }

    protected destroyed() {
        this._isDestroyed = true;
        LedgerApi.disconnect(
            /* cancelRequest */ true,
            /* requestTypeToDisconnect */ LedgerApiRequestType.SIGN_TRANSACTION,
        );
    }

    protected get statusScreenState() {
        if (this.state === this.State.FINISHED) return StatusScreen.State.SUCCESS;
        return super.statusScreenState;
    }

    protected get statusScreenTitle() {
        switch (this.state) {
            case this.State.FINISHED: return this.$t('Transaction Signed') as string;
            case this.State.SYNCING_FAILED: return this.$t('Syncing Failed') as string;
            default: return ''; // also for SYNCING don't display a title in small ui, different to parent class
        }
    }

    protected async _signBtcTransaction(transactionInfo: BitcoinTransactionInfo, walletInfo: WalletInfo) {
        // If user left this view in the mean time, don't continue signing the transaction
        if (this._isDestroyed) return;

        let ledgerTransactionInfo: LedgerBitcoinTransactionInfo;
        try {
            this.state = this.State.SYNCING;
            ledgerTransactionInfo = await prepareBitcoinTransactionForLedgerSigning(transactionInfo);
        } catch (e) {
            this.state = this.State.SYNCING_FAILED;
            this.error = e.message || e;
            return;
        }

        // If user left this view in the mean time, don't continue signing the transaction
        if (this._isDestroyed) return;

        // Set the state change slightly delayed to give the Ledger api time to load dependencies and the Ledger time to
        // process the request
        setTimeout(() => this.state = this.State.READY, 300);

        let signedTransactionHex: string;
        try {
            signedTransactionHex = await LedgerApi.Bitcoin.signTransaction(ledgerTransactionInfo);
        } catch (e) {
            if (this._isDestroyed) return; // user is not on this view anymore
            // If cancelled, handle the exception. Otherwise just keep the ledger ui / error message displayed.
            if (e.message.toLowerCase().indexOf('cancelled') !== -1) {
                this.$rpc.reject(new Error(ERROR_CANCELED));
            }
            return;
        }

        // If user left this view in the mean time, don't resolve
        if (this._isDestroyed) return;

        await loadBitcoinJS();
        const signedTransaction = BitcoinJS.Transaction.fromHex(signedTransactionHex);

        const result: SignedBtcTransaction = {
            serializedTx: signedTransactionHex,
            hash: signedTransaction.getId(),
        };

        this.state = this.State.FINISHED;
        await new Promise((resolve) => setTimeout(resolve, StatusScreen.SUCCESS_REDIRECT_DELAY));
        this.$rpc.resolve(result);
    }
}
</script>

<style scoped>
    .small-page {
        position: relative;
        align-items: center;
        padding-bottom: 26rem; /* for bottom container + additional padding */
    }

    .recipient {
        padding: 1.5rem;
        margin-top: .5rem;
        box-shadow: inset 0 0 0 1.5px rgba(31, 35, 72, 0.1);
        border-radius: 0.625rem;
    }

    .label-line {
        display: flex;
        align-items: center;
        margin-bottom: 1.5rem;
        font-size: 2rem;
    }

    .label-avatar {
        width: 3rem;
        height: 3rem;
        margin-right: 1rem;
    }

    .italic {
        font-style: italic;
    }

    .address {
        font-family: 'Fira Mono', monospace;
        font-size: 1.75rem;
    }

    .value {
        font-size: 6rem;
        margin-top: 6.25rem;
    }

    .value >>> .btc {
        margin-left: -.75rem;
        font-size: 3rem;
        font-weight: 700;
        letter-spacing: .1rem;
    }

    .fee {
        opacity: .5;
        font-size: 2rem;
    }

    .bottom-container {
        position: absolute;
        width: 100%;
        height: 23rem;
        bottom: 0;
        transition: height .4s;
    }

    .bottom-container.full-height {
        height: 100%;
    }

    .bottom-container > * {
        position: absolute;
        top: 0;
    }

    .status-screen {
        transition: opacity .4s;
        overflow: hidden;
    }

    .ledger-ui >>> .loading-spinner {
        margin-top: -1.25rem; /* position at same position as StatusScreen's loading spinner */
    }
</style>
