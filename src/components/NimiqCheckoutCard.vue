<template>
<div class="payment-option" :id="paymentOptions.currency">
    <CurrencyInfo v-if="hasCurrencyInfo"
        :currency="paymentOptions.currency"
        :fiatCurrency="request.fiatCurrency"
        :fiatFeeAmount="paymentOptions.fiatFee(request.fiatAmount)"
    />
    <SmallPage>
        <transition name="transition-fade">
            <StatusScreen
                v-if="delayedShowStatusScreen"
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
        <template v-if="rpcState">
            <PaymentInfoLine
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
                :address="paymentOptions.protocolSpecific.recipient
                    ? paymentOptions.protocolSpecific.recipient.toUserFriendlyAddress()
                    : null"
                :origin="rpcState.origin"
                :shopLogoUrl="request.shopLogoUrl"
                :startTime="request.time"
                :endTime="paymentOptions.expires" />
        </template>
        <template v-if="wallets.length === 0">
            <h2 class="nq-h1">{{ $t('Imagine if paying with\ncrypto was easy') }}</h2>
            <PageBody class="video-container">
                <video autoplay loop muted playsinline disablePictureInPicture>
                    <source src="/checkout-demo.mp4#t=0.7" type="video/mp4">
                    <!-- have video start at .7s to have a meaningful preview image rendered for mobile browsers that
                    don't autoplay. Note this only applies to the first play, loops will start at 0. -->
                </video>
            </PageBody>
            <PageFooter>
                <button class="nq-button-pill light-blue" @click="goToOnboarding">{{ $t('Login') }}</button>
                <a :href="onboardingLink" target="_blank" class="safe-onboarding-link nq-link nq-light-blue">
                    {{ $t('Try it now') }}
                    <ArrowRightSmallIcon/>
                </a>
            </PageFooter>
        </template>
        <template v-else>
            <h2 class="nq-h1">{{ $t('Choose an Address to pay') }}</h2>
            <div v-if="!balancesUpdating && !hasEligibleAddress" class="non-sufficient-balance">
                <p class="nq-text nq-orange">{{ $t('None of your available addresses has sufficient balance.') }}</p>
                <a class="nq-button-pill light-blue" href="https://nimiq.com/#exchanges" target="_blank">
                    <TransferIcon/> {{ $t('Get NIM') }}&nbsp;
                </a>
            </div>
            <AccountSelector
                :wallets="processedWallets"
                :minBalance="balancesUpdating ? 0 : paymentOptions.total"
                :disabledAddresses="paymentOptions.protocolSpecific.recipient
                    ? [paymentOptions.protocolSpecific.recipient.toUserFriendlyAddress()]
                    : []"
                @account-selected="setAccountOrContract"
                @login="() => goToOnboarding(false)"/>
        </template>
    </SmallPage>
    <Network ref="network" :visible="false" @head-change="onHeadChange"/>
</div>
</template>

<script lang="ts">
import { Component, Watch } from 'vue-property-decorator';
import { State, Mutation, Getter } from 'vuex-class';
import KeyguardClient from '@nimiq/keyguard-client';
import {
    AccountSelector,
    ArrowRightSmallIcon,
    PageBody,
    PageFooter,
    PaymentInfoLine,
    SmallPage,
    StopwatchIcon,
    TransferIcon,
    UnderPaymentIcon,
} from '@nimiq/vue-components';
import { AccountInfo } from '../lib/AccountInfo';
import { TX_VALIDITY_WINDOW } from '../lib/Constants';
import { ContractInfo, VestingContractInfo } from '../lib/ContractInfo';
import { Account, Currency, PaymentState as PublicPaymentState, RequestType } from '../../client/PublicRequestTypes';
import staticStore from '../lib/StaticStore';
import { WalletInfo, WalletType } from '../lib/WalletInfo';
import { WalletStore } from '../lib/WalletStore';
import { ParsedNimiqDirectPaymentOptions } from '../lib/paymentOptions/NimiqPaymentOptions';
import Network from './Network.vue';
import StatusScreen from './StatusScreen.vue';
import CheckoutCard from './CheckoutCard.vue';
import CurrencyInfo from './CurrencyInfo.vue';

@Component({components: {
    AccountSelector,
    CurrencyInfo,
    Network,
    PageBody,
    PageFooter,
    SmallPage,
    StatusScreen,
    PaymentInfoLine,
    ArrowRightSmallIcon,
    StopwatchIcon,
    TransferIcon,
    UnderPaymentIcon,
}})
class NimiqCheckoutCard
    extends CheckoutCard<ParsedNimiqDirectPaymentOptions> {
    private static readonly BALANCE_CHECK_STORAGE_KEY = 'nimiq_checkout_last_balance_check';
    @State private wallets!: WalletInfo[];

    @Getter private processedWallets!: WalletInfo[];
    @Getter private findWalletByAddress!: (address: string, includeContracts: boolean) => WalletInfo | undefined;

    @Mutation('addWallet') private $addWallet!: (walletInfo: WalletInfo) => any;
    @Mutation('setActiveAccount') private $setActiveAccount!: (payload: {
        walletId: string,
        userFriendlyAddress: string,
    }) => any;

    private readonly onboardingLink: string
        = `https://wallet.nimiq${location.hostname.endsWith('testnet.com') ? '-testnet' : ''}.com`;

    private updateBalancePromise: Promise<void> | null = null;
    private balancesUpdating: boolean = true;
    private height: number = 0;
    private delayedShowStatusScreen: boolean = this.showStatusScreen;
    private _delayedHideStatusScreenTimeout: number = -1;

    protected async created() {
        if (this.paymentOptions.currency !== Currency.NIM) {
            throw new Error('NimiqCheckoutCard did not get a NimiqPaymentOption.');
        }
        return await super.created();
    }

    protected async mounted() {
        super.mounted();
        // Requires Network child component to be rendered
        this.addConsensusListeners();
        this.updateBalancePromise = this.getBalances().then((balances) => {
            this.balancesUpdating = false;
        });

        if (this.request.paymentOptions.length === 1) {
            if (this.paymentOptions.protocolSpecific.sender) {
                // Handle optional sender address included in the request
                // Check if the address exists
                const senderAddress = this.paymentOptions.protocolSpecific.sender.toUserFriendlyAddress();
                const wallet = this.findWalletByAddress(senderAddress, true);
                if (wallet) {
                    // Forward to Keyguard, skipping account selection
                    this.setAccountOrContract(
                        wallet.id,
                        senderAddress,
                        true);
                } else if (this.paymentOptions.protocolSpecific.forceSender) {
                    this.$rpc.reject(new Error('Address not found'));
                }
            }
        }
    }

    protected destroyed() {
        super.destroyed();
    }

    @Watch('showStatusScreen')
    private _delayShowStatusScreen(showStatusScreen: boolean) {
        if (showStatusScreen) {
            // show status screen immediately
            clearTimeout(this._delayedHideStatusScreenTimeout);
            this.delayedShowStatusScreen = true;
        } else {
            // Hide status screen after a delay to avoid flickering when showStatusScreen is false just for a short
            // moment before the status screen should be shown again. This is the case in setAccountOrContract when
            // switching from the fetchPaymentOption (in selectCurrency) status screen to the balance update status
            // screen and then to the redirect loading spinner
            this._delayedHideStatusScreenTimeout = window.setTimeout(() => this.delayedShowStatusScreen = false, 100);
        }
    }

    private async getBalances(): Promise<Map<string, number>> {
        const cache = this.getLastBalanceUpdateHeight();
        const isRefresh = !window.performance || performance.navigation.type === 1;

        const sideResultAddedWallet = !!staticStore.sideResult && !!(staticStore.sideResult as Account[]).length;
        if (!sideResultAddedWallet && cache && !isRefresh) {
            this.onHeadChange(cache);
            return cache.balances;
        }

        // Copy wallets to be able to manipulate them
        const wallets = this.wallets.slice(0);

        // Generate a new array with references to the respective wallets' accounts
        const accountsAndContracts = wallets.reduce((acc, wallet) => {
            acc.push(...wallet.accounts.values());
            acc.push(...wallet.contracts);
            return acc;
        }, [] as Array<AccountInfo | ContractInfo>);

        // Reduce userfriendly addresses from that
        const addresses = accountsAndContracts.map((accountOrContract) => accountOrContract.userFriendlyAddress);

        // Get balances through pico consensus, also triggers head-change event
        const network = (this.$refs.network as Network);
        const balances: Map<string, number> = await network.getBalances(addresses);

        // Update accounts/contracts with their balances
        // (The accounts are still references to themselves in the wallets' accounts maps)
        for (const accountOrContract of accountsAndContracts) {
            const balance = balances.get(accountOrContract.userFriendlyAddress);
            if (balance === undefined) continue;

            if ('type' in accountOrContract && accountOrContract.type === Nimiq.Account.Type.VESTING) {
                // Calculate available amount for vesting contract
                accountOrContract.balance = (accountOrContract as VestingContractInfo)
                    .calculateAvailableAmount(this.height, Nimiq.Policy.coinsToSatoshis(balance));
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

        // Cache height and balances
        const cacheInput = {
            timestamp: Date.now(),
            height: this.height,
            balances: Array.from(balances.entries()),
        };
        window.sessionStorage.setItem(NimiqCheckoutCard.BALANCE_CHECK_STORAGE_KEY, JSON.stringify(cacheInput));

        return balances;
    }

    private onHeadChange(head: Nimiq.BlockHeader | {height: number}) {
        this.height = head.height;
    }

    private addConsensusListeners() {
        const network = (this.$refs.network as Network);
        network.$on(Network.Events.API_READY,
            () => this.statusScreenStatus = this.$t('Contacting seed nodes...') as string);
        network.$on(Network.Events.CONSENSUS_SYNCING,
            () => this.statusScreenStatus = this.$t('Syncing consensus...') as string);
        network.$on(Network.Events.CONSENSUS_ESTABLISHED,
            () => this.statusScreenStatus = this.$t('Requesting balances...') as string);
    }

    private async setAccountOrContract(walletId: string, address: string, isFromRequest = false) {
        const startTime = Date.now();
        if (!await super.selectCurrency()) return;

        // sender and recipient cannot be the same, as keyguard would reject.
        // Should only happen when force sender flag is set to true, nimiq is the sole paymentOption
        // and the addresses are identical. In that case the request is rejected.
        if (address === this.paymentOptions.protocolSpecific.recipient!.toUserFriendlyAddress()) {
            if (this.request.paymentOptions.length === 1
                && this.paymentOptions.protocolSpecific.forceSender
                && this.paymentOptions.protocolSpecific.sender
                && this.paymentOptions.protocolSpecific.sender.toUserFriendlyAddress() === address) {
                this.$rpc.reject(new Error('Sender and Recipient cannot be identical.'));
            } else {
                // Otherwise it is unclear how this error came to be.
                // Gracefully fail by not selecting the address but returning to the address selection instead.
                console.log('request:', JSON.stringify(this.request));
                console.log('paymentOptions:', JSON.stringify(this.paymentOptions));
                if (this.$captureException) {
                    this.$captureException(new Error('UNEXPECTED Checkout: Sender and Recipient are identical.'));
                }
                return;
            }
        }

        if (this.balancesUpdating) {
            this.statusScreenState = StatusScreen.State.LOADING;
            this.statusScreenTitle = this.$t('Updating balances') as string;
            this.showStatusScreen = true;
            await this.updateBalancePromise;
        }
        const nimiqAddress = Nimiq.Address.fromString(address);
        const senderAccount = this.wallets.find((wallet: WalletInfo) => wallet.id === walletId)!;
        const senderContract = senderAccount.findContractByAddress(nimiqAddress);
        const signer = senderAccount.findSignerForAddress(nimiqAddress)!;

        if ((senderContract && senderContract.balance! < this.paymentOptions.total)
            || senderAccount && senderAccount.accounts.get(address)!.balance! < this.paymentOptions.total) {
            if (this.paymentOptions.protocolSpecific.forceSender) {
                this.$rpc.reject(new Error('Insufficient balance'));
                return;
            } else {
                this.showStatusScreen = false;
                return;
            }
        }

        // FIXME: Also handle active account we get from store
        this.$setActiveAccount({
            walletId: senderAccount.id,
            userFriendlyAddress: (senderContract || signer).userFriendlyAddress,
        });

        // If checkout carousel has multiple cards give it some time to run the card selection animation before
        // redirecting to Keyguard or Ledger flow.
        const waitTime = 400 - (Date.now() - startTime);
        if (waitTime > 0 && this.request.paymentOptions.length > 1) {
            // If a loading screen was shown for fetchPaymentoption (in selectCurrency) or the balance update,
            // keep it artificially open until the redirect
            this.showStatusScreen = this.showStatusScreen
                || this.statusScreenState === StatusScreen.State.LOADING && !!this.statusScreenTitle;
            await new Promise((resolve) => setTimeout(resolve, waitTime));
        }

        // proceed to transaction signing
        switch (senderAccount.type) {
            case WalletType.LEDGER:
                this.$router.push({name: `${RequestType.SIGN_TRANSACTION}-ledger`});
                return;
            case WalletType.LEGACY:
            case WalletType.BIP39:
                if (!this.height) return;

                // The next block is the earliest for which tx are accepted by standard miners
                const validityStartHeight = this.height + 1
                    - TX_VALIDITY_WINDOW
                    + (this.paymentOptions.protocolSpecific.validityDuration
                        ? this.paymentOptions.protocolSpecific.validityDuration
                        : TX_VALIDITY_WINDOW);

                const timeOffset = await this.timeOffsetPromise;

                const request: KeyguardClient.SignTransactionRequest = {
                    layout: 'checkout',
                    shopOrigin: this.rpcState.origin,
                    appName: this.request.appName,
                    shopLogoUrl: this.request.shopLogoUrl,

                    keyId: senderAccount.keyId,
                    keyPath: signer!.path,
                    keyLabel: senderAccount.labelForKeyguard,

                    sender: (senderContract || signer).address.serialize(),
                    senderType: senderContract ? senderContract.type : Nimiq.Account.Type.BASIC,
                    senderLabel: (senderContract || signer).label,
                    recipient: this.paymentOptions.protocolSpecific.recipient!.serialize(),
                    recipientType: this.paymentOptions.protocolSpecific.recipientType,
                    // recipientLabel: '', // Checkout is using the shopOrigin instead
                    value: this.paymentOptions.amount,
                    fee: this.paymentOptions.fee,
                    validityStartHeight,
                    data: this.paymentOptions.protocolSpecific.extraData,
                    flags: this.paymentOptions.protocolSpecific.flags,

                    fiatAmount: this.request.fiatAmount,
                    fiatCurrency: this.request.fiatCurrency,
                    vendorMarkup: this.paymentOptions.vendorMarkup,
                    time: this.request.time - timeOffset, // normalize time to our local system time
                    expires: this.paymentOptions.expires
                        ? this.paymentOptions.expires - timeOffset
                        : undefined,
                };

                staticStore.keyguardRequest = request;
                const client = this.$rpc.createKeyguardClient(isFromRequest);
                client.signTransaction(request);
                return;
        }
    }

    private goToOnboarding(useReplace?: boolean) {
        // Redirect to onboarding
        staticStore.originalRouteName = RequestType.CHECKOUT;
        if (useReplace) {
            this.$router.replace({name: RequestType.ONBOARD});
        } else {
            this.$router.push({name: RequestType.ONBOARD});
        }
    }

    private get hasEligibleAddress(): boolean {

        const recipientAddress = this.paymentOptions.protocolSpecific.recipient
            ? this.paymentOptions.protocolSpecific.recipient.toUserFriendlyAddress()
            : '';
        return this.wallets.some((wallet: WalletInfo) => [...wallet.accounts.values(), ...wallet.contracts]
            .some((info: AccountInfo | ContractInfo) =>
                // address has a balance and balance is sufficient
                !!info.balance && info.balance >= this.paymentOptions.total
                // has either not a set recipient yet or the current address is not the recipient
                // as it cannot be used to send from.
                && recipientAddress !== info.userFriendlyAddress));
    }

    private getLastBalanceUpdateHeight(): {timestamp: number, height: number, balances: Map<string, number>} | null {
        const rawCache = window.sessionStorage.getItem(NimiqCheckoutCard.BALANCE_CHECK_STORAGE_KEY);
        if (!rawCache) return null;

        try {
            const cache: {timestamp: number, height: number, balances: Array<[string, number]>} = JSON.parse(rawCache);

            // Check if expired or doesn't have a height
            if (cache.timestamp < Date.now() - 5 * 60 * 1000 || cache.height === 0) throw new Error();

            return Object.assign(cache, {
                balances: new Map(cache.balances),
            });
        } catch (e) {
            window.sessionStorage.removeItem(NimiqCheckoutCard.BALANCE_CHECK_STORAGE_KEY);
            return null;
        }
    }
}

namespace NimiqCheckoutCard {
    export const PaymentState = PublicPaymentState;
}

export default NimiqCheckoutCard;
</script>

<style scoped>
    .small-page {
        position: relative;
        width: 52.5rem;
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

    .nq-h1 {
        margin-top: 3.5rem;
        margin-bottom: 1rem;
        line-height: 1;
        text-align: center;
        white-space: pre-line
    }

    .video-container {
        position: relative;
        padding: 0;
        margin: 3rem 1rem 0 1rem;
        border-radius: .5rem;
        background: var(--nimiq-gray);
    }

    .video-container > video {
        position: absolute;
        height: 100%;
        left: 50%;
        transform: translateX(-50%);
    }

    .safe-onboarding-link {
        margin-bottom: .25rem;
        align-self: center;
        font-size: 2rem;
        font-weight: bold;
        text-decoration: none;
    }

    .safe-onboarding-link .nq-icon {
        margin-left: .25rem;
        font-size: 1.5rem;
        transition: transform .3s var(--nimiq-ease);
    }

    .safe-onboarding-link:hover .nq-icon {
        transform: translateX(.25rem);
    }

    .non-sufficient-balance {
        text-align: center;
        margin-top: 0.5rem;
        margin-bottom: 0.5rem;
        flex-shrink: 0;
    }

    .non-sufficient-balance .nq-text {
        opacity: 1;
        font-weight: 600;
    }

    .non-sufficient-balance .nq-button-pill {
        color: white;
        line-height: 3.375rem;
    }

    .non-sufficient-balance .nq-icon {
        font-size: 2.25rem;
        vertical-align: text-bottom;
    }

    .page-footer {
        flex-direction: row;
        justify-content: space-between;
        padding: 3rem;
    }
</style>
