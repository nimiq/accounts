<template>
    <div class="container">
        <SmallPage>
            <LedgerUi v-if="state === constructor.State.LOADING
                || state === constructor.State.LEDGER_INTERACTION
                || state === constructor.State.FETCHING_ADDRESSES"
                @information-shown="_showLedger"></LedgerUi>
            <transition name="transition-fade">
                <StatusScreen v-if="state === constructor.State.LOADING
                    || state === constructor.State.FETCHING_ADDRESSES
                    || state === constructor.State.FETCHING_INCOMPLETE
                    || state === constructor.State.FETCHING_FAILED
                    || state === constructor.State.FINISHED"
                    :state="statusScreenState" :title="statusScreenTitle" :status="statusScreenStatus"
                    :message="statusScreenMessage" :mainAction="statusScreenAction" @main-action="_continue"
                    :class="{ 'grow-from-bottom-button': state === constructor.State.FINISHED && !hadAccounts }">
                </StatusScreen>
            </transition>
            <transition name="transition-fade">
                <IdenticonSelector v-if="state === constructor.State.IDENTICON_SELECTION"
                    :accounts="accountsToSelectFrom"
                    :confirmAccountSelection="false"
                    @identicon-selected="_onAccountSelected"/>
            </transition>
            <transition name="transition-fade">
                <div v-if="state === constructor.State.WALLET_SUMMARY
                    || state === constructor.State.FINISHED && !hadAccounts" class="wallet-summary">
                    <h1 class="nq-h1">{{ $t('Account Created') }}</h1>
                    <AccountRing :addresses="Array.from(walletInfo.accounts.keys())" animate></AccountRing>
                    <div class="message nq-text">{{ $t('This is your account with your first address in it.') }}</div>
                    <button class="nq-button" @click="done">{{ $t('Finish') }}</button>
                </div>
            </transition>
        </SmallPage>

        <GlobalClose />
    </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { AccountRing, PageBody, PageHeader, SmallPage } from '@nimiq/vue-components';
import { Account } from '../lib/PublicRequestTypes';
import LedgerApi, {
    RequestTypeNimiq as LedgerApiRequestType,
    StateType as LedgerApiStateType,
    EventType as LedgerApiEventType,
} from '@nimiq/ledger-api';
import StatusScreen from '../components/StatusScreen.vue';
import GlobalClose from '../components/GlobalClose.vue';
import LedgerUi from '../components/LedgerUi.vue';
import IdenticonSelector from '../components/IdenticonSelector.vue';
import WalletInfoCollector from '../lib/WalletInfoCollector';
import { WalletInfo } from '../lib/WalletInfo';
import { AccountInfo } from '../lib/AccountInfo';
import { WalletStore } from '../lib/WalletStore';
import { labelAddress } from '@/lib/LabelingMachine';
import { Action } from 'vuex-class';

@Component({components: {
    PageBody, SmallPage, PageHeader,
    StatusScreen, GlobalClose, LedgerUi,
    IdenticonSelector, AccountRing,
}})
export default class SignupLedger extends Vue {
    private static readonly State = {
        LOADING: 'loading',
        LEDGER_INTERACTION: 'ledger-interaction', // can be instructions to connect or also display of an error
        FETCHING_ADDRESSES: 'fetching-addresses',
        FETCHING_INCOMPLETE: 'fetching-incomplete',
        FETCHING_FAILED: 'fetching-failed',
        IDENTICON_SELECTION: 'identicon-selection',
        WALLET_SUMMARY: 'wallet-summary',
        FINISHED: 'finished',
    };

    @Action('addWalletAndSetActive') private $addWalletAndSetActive!: (walletInfo: WalletInfo) => any;

    private state: string = SignupLedger.State.LOADING;
    private walletInfo: WalletInfo | null = null;
    private accountsToSelectFrom: AccountInfo[] = [];
    private hadAccounts: boolean = false;
    private cancelled: boolean = false;
    private retryingToFetchAddresses: boolean = false;
    private fetchingAddressesIncomplete: boolean = false;
    private fetchError: string = '';

    private get statusScreenState() {
        switch (this.state) {
            case SignupLedger.State.FETCHING_INCOMPLETE:
                return StatusScreen.State.WARNING;
            case SignupLedger.State.FETCHING_FAILED:
                return StatusScreen.State.ERROR;
            case SignupLedger.State.FINISHED:
                return StatusScreen.State.SUCCESS;
            default:
                return StatusScreen.State.LOADING;
        }
    }

    private get statusScreenTitle() {
        switch (this.state) {
            case SignupLedger.State.FETCHING_ADDRESSES:
                return this.$t('Fetching your Addresses') as string;
            case SignupLedger.State.FETCHING_INCOMPLETE:
                return this.$t('Your Addresses may be\nincomplete.') as string;
            case SignupLedger.State.FETCHING_FAILED:
                return this.$t('Fetching Addresses Failed') as string;
            case SignupLedger.State.FINISHED:
                return this.hadAccounts
                    ? this.$t('You\'re logged in!') as string
                    : this.$t('Welcome to the Nimiq Blockchain.') as string;
            default:
                return '';
        }
    }

    private get statusScreenStatus() {
        if (this.state !== SignupLedger.State.FETCHING_ADDRESSES) return '';
        else if (this.retryingToFetchAddresses) return this.$t('Failed to fetch addresses. Retrying...') as string;
        else {
            const count = !this.walletInfo ? 0 : this.walletInfo.accounts.size;
            return count > 0
                ? this.$tc('Imported {count} address so far... | Imported {count} addresses so far...', count)
                : '';
        }
    }

    private get statusScreenMessage() {
        switch (this.state) {
            case SignupLedger.State.FETCHING_INCOMPLETE:
                return this.$t('Used addresses without balance might have been missed.') as string;
            case SignupLedger.State.FETCHING_FAILED:
                return this.$t('Syncing with the network failed: {error}', { error: this.fetchError }) as string;
            default:
                return '';
        }
    }

    private get statusScreenAction() {
        switch (this.state) {
            case SignupLedger.State.FETCHING_INCOMPLETE:
                return this.$t('Continue') as string;
            case SignupLedger.State.FETCHING_FAILED:
                return this.$t('Retry') as string;
            default:
                return '';
        }
    }

    private async created() {
        // called every time the router shows this page
        let tryCount = 0; // trying multiple times in case of errors due to weak network connection
        while (!this.cancelled) {
            try {
                tryCount += 1;
                // triggers loading and connecting states in LedgerUi if applicable
                const collectionResult = await WalletInfoCollector.collectLedgerWalletInfo(
                    /* initialAccounts */ [],
                    (walletInfo, currentlyCheckedAccounts) =>
                        this._onWalletInfoUpdate(walletInfo, currentlyCheckedAccounts),
                    /* skipActivityCheck */ true,
                );
                this.retryingToFetchAddresses = false;
                this.fetchingAddressesIncomplete = !!collectionResult.receiptsError;
                break;
            } catch (e) {
                if (tryCount >= 5) {
                    this.fetchError = e.message || e;
                    if (LedgerApi.currentState.type !== LedgerApiStateType.ERROR) {
                        // For errors not coming from the LedgerApi, switch to the error screen. For Ledger errors, we
                        // display the error in the LedgerUi.
                        this.state = SignupLedger.State.FETCHING_FAILED;
                    }
                    return;
                }
                this.retryingToFetchAddresses = true;
                console.warn('Error while collecting Ledger WalletInfo, retrying', e);
                if (!LedgerApi.isBusy) continue;
                // await Ledger request from current iteration to be cancelled to able to start the next one
                await new Promise((resolve) => LedgerApi.once(LedgerApiEventType.REQUEST_CANCELLED, resolve));
            }
        }

        this._continue();
    }

    private destroyed() {
        LedgerApi.disconnect(
            /* cancelRequest */ true,
            /* requestTypesToDisconnect */ [LedgerApiRequestType.GET_WALLET_ID, LedgerApiRequestType.DERIVE_ADDRESSES],
        );
        this.cancelled = true;
    }

    private async _onAccountSelected(selectedAccount: AccountInfo) {
        this.walletInfo!.accounts.set(selectedAccount.address.toUserFriendlyAddress(), selectedAccount);
        await this._onWalletInfoUpdate(this.walletInfo!);
        this.state = SignupLedger.State.WALLET_SUMMARY;
    }

    private async _onWalletInfoUpdate(
        walletInfo: WalletInfo,
        currentlyCheckedAccounts?: Array<{ address: string, path: string }>,
    ) {
        this.walletInfo = walletInfo;
        if (this.cancelled) return;
        this.walletInfo.fileExported = true;
        this.walletInfo.wordsExported = true;
        if (walletInfo.accounts.size > 0) {
            await WalletStore.Instance.put(walletInfo);
        }
        if (currentlyCheckedAccounts && this.accountsToSelectFrom.length === 0) {
            // set the first set of checked accounts as the one the user can select one from, in case he doesn't have
            // an account already
            this.accountsToSelectFrom = currentlyCheckedAccounts.map((account) => new AccountInfo(
                account.path,
                labelAddress(account.address),
                Nimiq.Address.fromString(account.address),
                0, // balance 0 because if user has to select an account, it's gonna be an unused one
            ));
        }
        this.$forceUpdate(); // because vue does not recognize changes in walletInfo.accounts map // TODO verify
    }

    private _continue() {
        if (this.cancelled) return;
        if (this.state === SignupLedger.State.FETCHING_FAILED) {
            window.location.reload();
        } else if (this.fetchingAddressesIncomplete && this.state !== SignupLedger.State.FETCHING_INCOMPLETE) {
            // warn user that his addresses might be incomplete
            this.state = SignupLedger.State.FETCHING_INCOMPLETE;
        } else if (this.walletInfo!.accounts.size > 0) {
            this.hadAccounts = true;
            this.done();
        } else {
            // Let user select an account
            this.state = SignupLedger.State.IDENTICON_SELECTION;
        }
    }

    private async done() {
        // Add wallet to vuex
        this.$addWalletAndSetActive(this.walletInfo!);

        const result: Account[] = [await this.walletInfo!.toAccountType()];

        this.state = SignupLedger.State.FINISHED;
        setTimeout(() => {
            this.$rpc.resolve(result);
        }, StatusScreen.SUCCESS_REDIRECT_DELAY);
    }

    private _showLedger() {
        if (this.state === SignupLedger.State.FINISHED) return;
        const currentRequest = LedgerApi.currentRequest;
        if (!currentRequest) {
            // This should never happen. But in case it does, just show the Ledger as there might be an error shown.
            this.state = SignupLedger.State.LEDGER_INTERACTION;
            return;
        }
        if (currentRequest.cancelled || (currentRequest.type !== LedgerApiRequestType.GET_WALLET_ID
            && currentRequest.type !== LedgerApiRequestType.DERIVE_ADDRESSES)) return;
        if (LedgerApi.currentState.type === LedgerApiStateType.REQUEST_PROCESSING
            || LedgerApi.currentState.type === LedgerApiStateType.REQUEST_CANCELLING) {
            // When we actually fetch the accounts from the device, we want to show our own StatusScreen instead of
            // the LedgerUi processing screen to avoid switching back and forth between LedgerUi and StatusScreen during
            // account finding.
            this.state = SignupLedger.State.FETCHING_ADDRESSES;
        } else {
            this.state = SignupLedger.State.LEDGER_INTERACTION;
        }
    }
}
</script>

<style scoped>
    .small-page {
        position: relative;
        overflow: hidden;
    }

    .small-page > * {
        position: absolute;
        left: 0;
        bottom: 0;
        transition: opacity .4s;
    }

    .small-page > :not(.status-screen) {
        width: 100%;
        height: 100%;
        background: white;
    }

    .status-screen >>> .title {
        min-height: 1em; /* to avoid jumping of the UI when setting a title */
    }

    .ledger-ui {
        z-index: 0;
    }

    .wallet-summary {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        padding: 4rem;
    }

    .wallet-summary h1 {
        margin-top: 0;
    }

    .wallet-summary .account-ring {
        margin: 4.25rem;
        width: 20rem;
    }

    .wallet-summary .message {
        font-size: 2.5rem;
        text-align: center;
        max-width: 35rem;
    }

    .wallet-summary .nq-button {
        width: calc(100% - 6rem);
        margin-bottom: 0;
    }
</style>
