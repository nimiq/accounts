<template>
    <div class="container">
        <SmallPage>

            <transition name="transition-fade">
                <StatusScreen v-if="loading" :title="$t('Updating your balances')" lightBlue key="loading"/>

                <div v-else-if="!accountOrContractInfo" class="create-cashlink-choose-sender" key="choose-sender">
                    <PageHeader>
                        {{ $t('Choose Sender') }}
                    </PageHeader>
                    <AccountSelector :wallets="processedWallets" :min-balance="1" @account-selected="setSender" @login="login"/>
                </div>

                <div v-else class="create-cashlink" key="create" :class="{ blurred: optionsOpened || openedDetails !== constructor.Details.NONE }">
                    <transition name="transition-fade">
                        <SmallPage v-if="optionsOpened" class="overlay fee" key="fee">
                            <PageBody>
                                <h1 class="nq-h1">{{ $t('Speed up your transaction') }}</h1>
                                <p class="nq-text">{{ $t('By adding a transation fee, you can influence how fast your transaction will be processed.') }}</p>
                                <SelectBar name="fee" ref="fee" :options="constructor.FEE_OPTIONS" :selectedValue="feeLunaPerByte" @changed="updateFeePreview"/>
                                <Amount :amount="feePreview" :minDecimals="0" :maxDecimals="5" />
                            </PageBody>
                            <PageFooter>
                                <button class="nq-button light-blue" @click="setFee">{{ $t('Set fee') }}</button>
                            </PageFooter>
                            <CloseButton class="top-right" @click="optionsOpened = false" />
                        </SmallPage>

                        <SmallPage v-if="openedDetails !== constructor.Details.NONE" class="overlay" key="details">
                            <AccountDetails
                                :address="accountOrContractInfo.address.toUserFriendlyAddress()"
                                :label="accountOrContractInfo.label"
                                :balance="availableBalance"
                                @close="openedDetails = constructor.Details.NONE"/>
                        </SmallPage>
                    </transition>

                    <PageHeader :backArrow="!request.senderAddress" @back="reset">
                        <span>{{ $t('Create a Cashlink') }}</span>
                        <a href="javascript:void(0)" class="nq-blue options-button" @click="optionsOpened = true">
                            <SettingsIcon/>
                        </a>
                    </PageHeader>

                    <PageBody ref="createCashlinkTooltipTarget">
                        <div class="sender-and-recipient">
                            <Account layout="column"
                                class="sender"
                                :address="accountOrContractInfo.address.toUserFriendlyAddress()"
                                :label="accountOrContractInfo.label"
                                @click.native="openedDetails = constructor.Details.SENDER"/>
                            <ArrowRightIcon class="nq-light-blue arrow"/>
                            <Account layout="column"
                                :label="$t('New Cashlink')"
                                :displayAsCashlink="true"/>
                        </div>
                        <hr/>
                        <AmountWithFee ref="amountWithFee" :available-balance="availableBalance" v-model="liveAmountAndFee"/>
                        <div class="message-with-tooltip">
                            <LabelInput class="message" :placeholder="$t('Add a message...')" :vanishing="true" :maxBytes="255" v-model="message" />
                            <Tooltip ref="tooltip" :container="$refs.createCashlinkTooltipTarget" autoWidth>
                                {{ $t('This message will be stored in the Cashlink.') }}
                                {{ $t('It won’t be part of the public Blockchain and might get lost after the Cashlink was claimed.') }}
                            </Tooltip>
                        </div>
                    </PageBody>

                    <PageFooter>
                        <button class="nq-button light-blue"
                            :disabled="liveAmountAndFee.amount === 0 || !liveAmountAndFee.isValid"
                            @click="sendTransaction">
                            {{ $t('Create Cashlink') }}
                        </button>
                    </PageFooter>
                </div>
            </transition>

        </SmallPage>

        <button class="global-close nq-button-s" @click="close">
            <ArrowLeftSmallIcon/>
            {{ $t('Back to {appName}', { appName: request.appName }) }}
        </button>
    </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Getter, Mutation, State } from 'vuex-class';
import Cashlink from '../lib/Cashlink';
import staticStore, { Static } from '../lib/StaticStore';
import StatusScreen from '../components/StatusScreen.vue';
import { ERROR_CANCELED } from '../lib/Constants';
import { State as RpcState } from '@nimiq/rpc';
import { loadNimiq } from '../lib/Helpers';
import { AccountInfo } from '../lib/AccountInfo';
import { ParsedCreateCashlinkRequest } from '../lib/RequestTypes';
import { RequestType } from '../../client/PublicRequestTypes';
import { NetworkClient } from '@nimiq/network-client';
import { WalletStore } from '../lib/WalletStore';
import { WalletInfo, WalletType } from '../lib/WalletInfo';
import { ContractInfo, VestingContractInfo } from '../lib/ContractInfo';
import { i18n } from '../i18n/i18n-setup';
import KeyguardClient from '@nimiq/keyguard-client';
import Config from 'config';
import {
    Account,
    AccountDetails,
    AccountSelector,
    Amount,
    AmountWithFee,
    ArrowLeftSmallIcon,
    ArrowRightIcon,
    CloseButton,
    LabelInput,
    PageBody,
    PageFooter,
    PageHeader,
    SelectBar,
    SettingsIcon,
    SmallPage,
    Tooltip,
} from '@nimiq/vue-components';

@Component({components: {
    Account,
    AccountDetails,
    AccountSelector,
    Amount,
    AmountWithFee,
    ArrowLeftSmallIcon,
    ArrowRightIcon,
    CloseButton,
    LabelInput,
    PageBody,
    PageFooter,
    PageHeader,
    SelectBar,
    SettingsIcon,
    SmallPage,
    StatusScreen,
    Tooltip,
}})
class CashlinkCreate extends Vue {
    private static readonly FEE_OPTIONS: Array<{
        color: string,
        value: number,
        text: string,
        index: number,
    }> = [{
            color: 'nq-light-blue-bg',
            value: 0,
            get text() { return i18n.t('free') as string; },
            index: 0,
        }, {
            color: 'nq-green-bg',
            value: 1,
            get text() { return i18n.t('standard') as string; },
            index: 1,
        }, {
            color: 'nq-gold-bg',
            value: 2,
            get text() { return i18n.t('express') as string; },
            index: 2,
        },
    ];

    private static readonly TRANSACTION_SIZE = 171; // 166 + 5 bytes extraData for funding a cashlink

    public $refs!: {
        createCashlinkTooltipTarget: PageBody,
        amountWithFee: AmountWithFee,
        fee: SelectBar,
    };

    @Static private request!: ParsedCreateCashlinkRequest;
    @Static private rpcState!: RpcState;

    @State private wallets!: WalletInfo[];

    @Getter private processedWallets!: WalletInfo[];
    @Getter private findWalletByAddress!: (address: string, includeContracts: boolean) => WalletInfo | undefined;
    @Getter private findWallet!: (id: string) => WalletInfo | undefined;

    @Mutation('addWallet') private $addWallet!: (walletInfo: WalletInfo) => any;
    @Mutation('setActiveAccount') private $setActiveAccount!: (payload: {
        walletId: string,
        userFriendlyAddress: string,
    }) => any;

    private nimiqLoadedPromise?: Promise<void>;
    private balanceUpdatedPromise?: Promise<void>;
    private loading: boolean = false;

    private liveAmountAndFee: {amount: number, fee: number, isValid: boolean} = {
        amount: 0,
        fee: 0,
        isValid: false,
    };
    private feeLunaPerByte: number = 0;
    private feeLunaPerBytePreview: number = 0;
    private message = '';

    private accountOrContractInfo: AccountInfo | ContractInfo | null = null;

    private optionsOpened = false;
    private openedDetails = CashlinkCreate.Details.NONE;

    private get availableBalance() {
        if (this.accountOrContractInfo && this.accountOrContractInfo.balance) {
            return this.accountOrContractInfo.balance;
        }
        return 0;
    }

    public async created() {
        // if there are no existing accounts, redirect to Onboarding
        if (this.wallets.length === 0) {
            this.login(true);
            return;
        }

        // If there is no wallet to the address provided in the request,
        // remove it to let the user potentially choose another.
        if (this.request.senderAddress
            && !this.findWalletByAddress(this.request.senderAddress.toUserFriendlyAddress(), true)) {
            this.request.senderAddress = undefined;
        }

        if (this.request.value) {
            this.liveAmountAndFee.amount = this.request.value;
        }

        if (this.request.message) {
            this.message = this.request.message;
        }

        if (!NetworkClient.hasInstance()) {
            NetworkClient.createInstance(Config.networkEndpoint);
        }

        this.loading = !staticStore.cashlink && (!this.request.senderAddress || !this.request.senderBalance);

        this.nimiqLoadedPromise = loadNimiq();
        this.balanceUpdatedPromise = this.updateBalances();
        if (this.loading) {
            this.balanceUpdatedPromise.then(() => this.loading = false);
        }

        if (staticStore.cashlink) {
            // If the Cashlink is restored in the static store after navigating back from the Keyguard or Ledger signing
            // also restore the previously used values in the UI.
            this.liveAmountAndFee.amount = staticStore.cashlink.value;
            this.feeLunaPerByte = this.feeLunaPerBytePreview =
                Math.round(staticStore.cashlink.fee / CashlinkCreate.TRANSACTION_SIZE);
            this.liveAmountAndFee.fee = this.fee;
            this.message = staticStore.cashlink.message;
            // Restore the sender from activeAccount. We don't await the balance update as we assume it to not have
            // changed.
            this.setSender(this.$store.state.activeWalletId, this.$store.state.activeUserFriendlyAddress);
        } else if (this.request.senderAddress) {
            if (!this.request.senderBalance) {
                await this.balanceUpdatedPromise;
            }

            this.setSender(null, this.request.senderAddress.toUserFriendlyAddress());
            // If a balance was given in the request use it until the balance update finishes.
            // The given balance in the request takes precedence over the currently stored (before the update)
            // balance in the store.
            if (this.accountOrContractInfo && this.request.senderBalance) {
                this.accountOrContractInfo.balance = this.request.senderBalance;
            }
        }
    }

    private setSender(walletId: string | null, address: string) {
        const wallet = walletId
            ? this.findWallet(walletId)
            : this.findWalletByAddress(address, true);
        if (!wallet) {
            const errorMsg = walletId ? 'UNEXPECTED: WalletId not found!' : 'Address not found';
            this.$rpc.reject(new Error(errorMsg));
            return;
        }

        this.accountOrContractInfo = wallet.accounts.get(address)
            || wallet.findContractByAddress(Nimiq.Address.fromString(address))!;

        // FIXME: Also handle active account we get from store
        this.$setActiveAccount({
            walletId: wallet.id,
            userFriendlyAddress: address,
        });
    }

    private async updateBalances() {
        if (this.balanceUpdatedPromise) {
            return this.balanceUpdatedPromise;
        }

        await NetworkClient.Instance.init();

        const wallets = this.wallets.slice(0);
        let addresses: string[] = [];
        let accountsAndContracts: Array<AccountInfo | ContractInfo> = [];

        if (!this.request.senderAddress) { // No senderAddress in the request
            accountsAndContracts = wallets.reduce((acc, wallet) => {
                acc.push(...wallet.accounts.values());
                acc.push(...wallet.contracts);
                return acc;
            }, [] as Array<AccountInfo | ContractInfo>);

            // Reduce userfriendly addresses from that
            addresses = accountsAndContracts.map((accountOrContract) => accountOrContract.userFriendlyAddress);
        } else {
            const wallet = this.findWalletByAddress(this.request.senderAddress.toUserFriendlyAddress(), true);
            if (!wallet) {
                this.$rpc.reject(new Error('Address not found!'));
                return;
            }

            const accountOrContractInfo = wallet.accounts.get(this.request.senderAddress.toUserFriendlyAddress())
                || wallet.findContractByAddress(this.request.senderAddress)!;

            accountsAndContracts.push(accountOrContractInfo);
            addresses.push(accountOrContractInfo.userFriendlyAddress);
        }

        const balances = await NetworkClient.Instance.getBalance(addresses);

        for (const accountOrContract of accountsAndContracts) {
            const balance = balances.get(accountOrContract.userFriendlyAddress);
            if (balance === undefined) continue;

            if ('type' in accountOrContract && accountOrContract.type === Nimiq.Account.Type.VESTING) {
                // Calculate available amount for vesting contract
                accountOrContract.balance =
                    (accountOrContract as VestingContractInfo).calculateAvailableAmount(
                        NetworkClient.Instance.headInfo.height,
                        Nimiq.Policy.coinsToSatoshis(balance),
                    );
            } else {
                accountOrContract.balance = Nimiq.Policy.coinsToSatoshis(balance);
            }
        }
        // Store updated wallets
        for (const wallet of wallets) {
            // Update IndexedDB
            await WalletStore.Instance.put(wallet);

            // Update Vuex
            this.$addWallet(wallet);
        }
    }

    private updateFeePreview(fee: number) {
        this.feeLunaPerBytePreview = fee;
    }

    private setFee() {
        this.optionsOpened = false;
        this.feeLunaPerByte = this.$refs.fee!.value;
        this.liveAmountAndFee.fee = this.fee;
    }

    private get fee(): number {
        return CashlinkCreate.TRANSACTION_SIZE * this.feeLunaPerByte;
    }

    private get feePreview(): number {
        return CashlinkCreate.TRANSACTION_SIZE * this.feeLunaPerBytePreview;
    }

    private async sendTransaction() {
        const loadingTimeout = window.setTimeout(() => this.loading = true, 10);

        await Promise.all([this.balanceUpdatedPromise, this.nimiqLoadedPromise]);

        window.clearTimeout(loadingTimeout);

        if (!this.liveAmountAndFee.isValid && this.liveAmountAndFee.amount > 0) {
            this.loading = false;
            return;
        }

        const cashlink = await Cashlink.create();
        staticStore.cashlink = cashlink;
        cashlink.networkClient = NetworkClient.Instance;
        cashlink.value = this.liveAmountAndFee.amount;
        cashlink.fee = this.fee;
        cashlink.message = this.message;
        if (this.request.theme) {
            cashlink.theme = this.request.theme;
        }
        const senderAccount = this.findWalletByAddress(this.accountOrContractInfo!.userFriendlyAddress, true)!;

        // proceed to transaction signing
        switch (senderAccount.type) {
            case WalletType.LEDGER:
                this.$router.push({name: `${RequestType.SIGN_TRANSACTION}-ledger`});
                return;
            case WalletType.LEGACY:
            case WalletType.BIP39:
                const fundingDetails = cashlink.getFundingDetails();
                const validityStartHeight = NetworkClient.Instance.headInfo.height + 1;

                const request: KeyguardClient.SignTransactionRequest = Object.assign({}, fundingDetails, {
                    shopOrigin: this.rpcState.origin,
                    appName: this.request.appName,
                    keyId: senderAccount.keyId,
                    keyPath: senderAccount.findSignerForAddress(this.accountOrContractInfo!.address)!.path,
                    keyLabel: senderAccount.labelForKeyguard,
                    sender: this.accountOrContractInfo!.address.serialize(),
                    senderType: (this.accountOrContractInfo as ContractInfo).type
                        ? (this.accountOrContractInfo as ContractInfo).type
                        : Nimiq.Account.Type.BASIC,
                    senderLabel: this.accountOrContractInfo!.label,
                    recipient: fundingDetails.recipient.serialize(),
                    recipientType: Nimiq.Account.Type.BASIC,
                    fee: this.fee,
                    validityStartHeight,
                });
                staticStore.keyguardRequest = request;
                const client = this.$rpc.createKeyguardClient();
                client.signTransaction(request);
                return;
        }
    }

    private login(useReplace = false) {
        staticStore.originalRouteName = RequestType.CREATE_CASHLINK;
        if (useReplace) {
            this.$router.replace({name: RequestType.ONBOARD});
        } else {
            this.$router.push({name: RequestType.ONBOARD});
        }
    }

    private close() {
        this.$rpc.reject(new Error(ERROR_CANCELED));
    }

    private reset() {
        this.liveAmountAndFee.isValid = false;
        this.accountOrContractInfo = null;
    }

    @Watch('accountOrContractInfo')
    @Watch('openedDetails')
    @Watch('optionsOpened')
    private focus(newValue: boolean | CashlinkCreate.Details | AccountInfo | ContractInfo) {
        if ((typeof newValue === 'boolean' && newValue === false)
            || (typeof newValue === 'number' && newValue === CashlinkCreate.Details.NONE)
            || (typeof newValue === 'object' && newValue !== null)) {
            Vue.nextTick(() => this.$refs.amountWithFee!.focus());
        }
    }
}

namespace CashlinkCreate {
    export enum Details {
        NONE,
        SENDER,
        RECIPIENT, // used to send the contact for the final recipient once available
    }
}

export default CashlinkCreate;
</script>

<style scoped>

    .container > .small-page {
        position: relative;
        overflow: hidden;
    }

    .status-screen {
        position: absolute;
        transition: opacity .3s var(--nimiq-ease);
    }

    .create-cashlink,
    .create-cashlink-choose-sender {
        position: absolute;
        width: 100%;
        height: 100%;
        transition: opacity .3s;
        display: flex;
        flex-direction: column;
    }

    .page-footer .nq-button {
        margin-top: 0;
    }

    .create-cashlink .page-body {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-around;
        padding-bottom: 2rem;
        padding-top: 0;
    }

    .create-cashlink .page-body > .nq-label {
        margin-top: 6rem;
        margin-bottom: 3rem;
    }

    .sender-and-recipient {
        display: flex;
        align-items: center;
        width: 100%;
    }

    .sender-and-recipient .arrow {
        font-size: 3rem;
        margin-top: -6.5rem;
        transition: opacity .3s var(--nimiq-ease);
    }

    .options-button {
        position: absolute;
        top: 4rem;
        right: 4rem;
        opacity: .25;
        font-size: 3.625rem;
        transition: opacity .3s var(--nimiq-ease);
    }

    .options-button:hover {
        opacity: 1;
    }

    .sender-and-recipient .account {
        width: calc(50% - 1.1235rem);
    }

    .sender-and-recipient .account.sender {
        cursor: pointer;
    }

    .sender-and-recipient .account >>> .identicon {
        width: 9rem;
        height: 9rem;
    }

    .sender-and-recipient .account >>> .label {
        height: 3em;
    }

    .create-cashlink .value {
        display: flex;
        align-items: baseline;
        height: 14.5rem; /* 12.5rem height + 2rem padding */
        border-top: .125rem solid var(--nimiq-highlight-bg);
        margin-top: 1rem;
        padding-top: 2rem;
    }

    .create-cashlink .message-with-tooltip {
        display: flex;
        align-items: center;
        max-width: 100%;
    }

    .page-body >>> .tooltip-box {
        font-size: 1.75rem;
        font-weight: 600;
        line-height: 1.49;
    }

    .create-cashlink .tooltip {
        font-size: 3rem;
        margin: 1rem 1rem 0;
    }

    .create-cashlink .tooltip >>> a.top::after {
        bottom: calc(1em + 0.75rem);
    }

    .create-cashlink .tooltip:not(.active) >>> a svg {
        color: rgba(31, 35, 72, 0.25) !important;
    }

    .create-cashlink .message {
        margin-top: 1rem;
        flex-grow: 1;
    }

    .overlay {
        position: absolute;
        z-index: 2;
        left: 0;
        top: 0;
        margin: 0;
        box-shadow: 0 0;
        background: rgba(255, 255, 255, .5);
        transition: opacity .3s var(--nimiq-ease);
    }

    .overlay .account-details {
        background: none;
    }

    .overlay.fee .page-body {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }

    .overlay.fee .amount {
        margin-top: 3rem;
    }

    .overlay.fee p {
        text-align: center;
        margin-bottom: 4rem;
        margin-top: .5rem;
    }

    .label-input {
        flex-grow: 1;
    }

    .create-cashlink > .page-body hr {
        width: 100%;
        margin: 0;
        height: 0.125rem;
        border: none;
        background-color: var(--nimiq-highlight-bg);
        transition: opacity .3s var(--nimiq-ease);
    }

    .amount-with-fee {
        flex-grow: 1;
        margin-top: 2rem;
        justify-content: center;
    }

    .create-cashlink .page-header >>> h1 > span,
    .create-cashlink .page-body >>> .amount-with-fee input,
    .create-cashlink .page-body >>> .amount-with-fee .nim,
    .create-cashlink .page-body >>> .amount-with-fee .fee-section,
    .create-cashlink .page-body >>> .label,
    .create-cashlink .page-body >>> .identicon,
    .create-cashlink .page-body >>> .message-with-tooltip input,
    .create-cashlink .page-body >>> .tooltip,
    .create-cashlink .page-footer >>> button {
        transition: filter .3s var(--nimiq-ease), opacity .3s var(--nimiq-ease);
        filter: blur(0px);
        opacity: 1;
    }

    .create-cashlink .page-footer >>> button {
        transition: filter .3s var(--nimiq-ease), opacity .3s var(--nimiq-ease), transform .45s var(--nimiq-ease);
    }

    /* these elements are too small to make a notable difference in the blurred background */
    .create-cashlink.blurred > .page-body >>> .arrow, /* arrow between the identicons */
    .create-cashlink.blurred > .page-body hr, /* line seperating identicons and amount */
    .create-cashlink.blurred > .page-header >>> a , /* back button */
    .create-cashlink.blurred > .page-header >>> h1 > a { /* back button */
        opacity: 0;
    }

    .create-cashlink.blurred > .page-body,
    .create-cashlink.blurred > .page-body >>> .account,
    .create-cashlink.blurred > .page-body >>> .label-input {
        overflow: visible; /** needed for ugly hard lines to disappear */
    }

    .create-cashlink.blurred > .page-header >>> h1 > span,
    .create-cashlink.blurred > .page-body >>> .amount-with-fee input,
    .create-cashlink.blurred > .page-body >>> .amount-with-fee .nim,
    .create-cashlink.blurred > .page-body >>> .amount-with-fee .fee-section,
    .create-cashlink.blurred > .page-body >>> .label,
    .create-cashlink.blurred > .page-body >>> .identicon,
    .create-cashlink.blurred > .page-body >>> .message-with-tooltip input,
    .create-cashlink.blurred > .page-body >>> .tooltip,
    .create-cashlink.blurred > .page-footer >>> button {
        opacity: .5;
        filter: blur(20px);
    }

    .sender-and-recipient {
        display: flex;
        align-items: center;
        width: 100%;
    }

    .create-cashlink .cashlink >>> .label {
        opacity: .5;
        line-height: 1.5;
    }
</style>
