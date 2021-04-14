<template>
    <div class="container">
        <SmallPage :class="{ 'wide-page': request.layout === 'slider' }">
            <PageHeader back-arrow @back="_close">
                <template #default>{{ $t('Confirm Swap') }}</template>
                <template #more>
                    <!-- Exchange rate info -->
                    <Tooltip preferredPosition="bottom right" class="exchange-rate-tooltip">
                        <template #trigger>
                            <!-- Note: the base currency is never a fiat currency, thus no need to use FiatAmount -->
                            1 {{ _baseAmountInfo.currency }} =
                            <Amount v-if="_otherAmountInfo.currency === SwapAsset.BTC
                                || _otherAmountInfo.currency === SwapAsset.NIM"
                                :amount="_exchangeRate * 10 ** (_otherAmountInfo.currencyDecimals + 1)"
                                :currency="_otherAmountInfo.currency"
                                :currencyDecimals="_otherAmountInfo.currencyDecimals + 1"
                                :maxDecimals="_otherAmountInfo.currencyDecimals + 1"
                                :minDecimals="0"
                            />
                            <FiatAmount v-else
                                :amount="_exchangeRate"
                                :currency="request.fiatCurrency"
                            />
                        </template>
                        <template #default>{{ $t('This rate includes the swap fee.') }}</template>
                    </Tooltip>
                    <!-- Fee info -->
                    <Tooltip preferredPosition="bottom left" class="fee-tooltip">
                        <template #trigger>
                            <i18n path="{totalFees} fees" :tag="false">
                                <template #totalFees>
                                    <FiatAmount
                                        :amount="_totalFiatFees"
                                        :currency="request.fiatCurrency"
                                    />
                                </template>
                            </i18n>
                        </template>
                        <template #default>
                            <!-- Bitcoin fee info first -->
                            <template v-if="_amountInfoForCurrency[SwapAsset.BTC]">
                                <label>{{ $t('BTC network fee') }}</label>
                                <FiatAmount
                                    :amount="_toFiat(_amountInfoForCurrency[SwapAsset.BTC].fees, SwapAsset.BTC)"
                                    :currency="request.fiatCurrency"
                                />
                                <div class="explainer">{{ $t('Atomic swaps require two BTC transactions.') }}</div>
                            </template>

                            <!-- Euro fee second -->
                            <template v-if="_amountInfoForCurrency[SwapAsset.EUR]">
                                <label>{{ $t('OASIS service fee') }}</label>
                                <FiatAmount
                                    :amount="_toFiat(_amountInfoForCurrency[SwapAsset.EUR].fees, SwapAsset.EUR)"
                                    :currency="request.fiatCurrency"
                                />
                                <div class="explainer">{{ $t('{percentage} of swap value.', {
                                    percentage: _formattedOasisFee,
                                }) }}</div>
                            </template>

                            <!-- Nimiq fee last -->
                            <template v-if="_amountInfoForCurrency[SwapAsset.NIM]">
                                <label>{{ $t('NIM network fee') }}</label>
                                <FiatAmount
                                    :amount="_toFiat(_amountInfoForCurrency[SwapAsset.NIM].fees, SwapAsset.NIM)"
                                    :currency="request.fiatCurrency"
                                />
                            </template>

                            <!-- Swap fee -->
                            <template v-if="request.serviceSwapFee">
                                <label>{{ $t('Swap fee') }}</label>
                                <FiatAmount
                                    :amount="_toFiat(request.serviceSwapFee, _fundingAmountInfo.currency)"
                                    :currency="request.fiatCurrency"
                                />
                                <div class="explainer">{{ $t('{percentage} of swap value.', {
                                    percentage: _formattedServiceFee,
                                }) }}</div>
                            </template>

                            <hr>

                            <!-- Total fees -->
                            <label class="total">{{ $t('Total fees') }}</label>
                            <FiatAmount
                                :amount="_totalFiatFees"
                                :currency="request.fiatCurrency"
                                class="total"
                            />
                        </template>
                    </Tooltip>
                </template>
            </PageHeader>

            <PageBody v-if="request.layout === 'standard'" class="layout-standard">
                <div class="address-infos">
                    <template v-for="fundingOrRedeemingInfo in [request.fund, request.redeem]">
                        <div v-if="fundingOrRedeemingInfo.type === SwapAsset.NIM">
                            <Identicon :address="nimiqLedgerAddressInfo.address.toUserFriendlyAddress()" />
                            <label>{{ nimiqLedgerAddressInfo.label }}</label>
                        </div>
                        <div v-else-if="fundingOrRedeemingInfo.type === SwapAsset.BTC">
                            <img src="/icon-btc.svg">
                            <label>{{ $t('Bitcoin') }}</label>
                        </div>
                        <div v-else-if="fundingOrRedeemingInfo.type === SwapAsset.EUR">
                            <img src="/icon-bank.svg">
                            <label>{{ request.fund.bankLabel || $t('Your Bank') }}</label>
                        </div>
                        <ArrowRightIcon v-if="fundingOrRedeemingInfo === request.fund" />
                    </template>
                </div>

                <div class="swap-values">
                    <!-- use Amount component also for fiat to display currency as currency code instead of symbol -->
                    <Amount
                        :amount="_fundingAmountInfo.myAmount"
                        :currency="_fundingAmountInfo.currency"
                        :currencyDecimals="_fundingAmountInfo.currencyDecimals"
                        :maxDecimals="_fundingAmountInfo.currencyDecimals"
                        :minDecimals="_fundingAmountInfo.currency === SwapAsset.EUR
                            ? _fundingAmountInfo.currencyDecimals : 0"
                        class="from-value nq-light-blue"
                    />

                    <div class="to-value nq-gray">
                        <svg xmlns="http://www.w3.org/2000/svg" width="27" height="21" viewBox="0 0 27 21">
                            <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5">
                                <path d="M.75.75v6a8 8 0 008 8h17"/>
                                <path d="M20.75 9.25l5.5 5.5-5.5 5.5" stroke-linejoin="round"/>
                            </g>
                        </svg>
                        <Amount
                            :amount="_redeemingAmountInfo.myAmount"
                            :currency="_redeemingAmountInfo.currency"
                            :currencyDecimals="_redeemingAmountInfo.currencyDecimals"
                            :maxDecimals="_redeemingAmountInfo.currencyDecimals"
                            :minDecimals="_redeemingAmountInfo.currency === SwapAsset.EUR
                                ? _redeemingAmountInfo.currencyDecimals : 0"
                        />
                    </div>
                </div>
            </PageBody>

            <PageBody v-else-if="request.layout === 'slider'" class="layout-slider">
                <!-- Note: the slider layout is currently only for NIM <-> BTC swaps -->
                <div class="address-infos">
                    <Identicon :address="nimiqLedgerAddressInfo.address.toUserFriendlyAddress()" />
                    <label>{{ nimiqLedgerAddressInfo.label }}</label>

                    <label>{{ $t('Bitcoin') }}</label>
                    <img src="/icon-btc.svg">
                </div>

                <div class="balance-bar">
                    <template v-for="({currency, background, oldFiatBalance, newFiatBalance}, i) in _balanceBarEntries">
                        <template v-if="_balanceBarEntries[i - 1] && _balanceBarEntries[i - 1].currency !== currency">
                            <div class="separator"></div>
                        </template>
                        <div class="bar" :style="{
                            flexGrow: newFiatBalance,
                            opacity: newFiatBalance !== oldFiatBalance ? 1 : .25,
                            background: background,
                            borderColor: background,
                        }">
                            <div v-if="newFiatBalance > oldFiatBalance" class="change" :style="{
                                width: `${(newFiatBalance - oldFiatBalance) / newFiatBalance * 100}%`,
                            }"></div>
                        </div>
                    </template>
                </div>

                <div class="swap-values">
                    <div :class="{ redeeming: _redeemingAmountInfo === _baseAmountInfo }">
                        <Amount
                            :amount="_baseAmountInfo.myAmount"
                            :currency="_baseAmountInfo.currency"
                            :currencyDecimals="_baseAmountInfo.currencyDecimals"
                            :maxDecimals="_baseAmountInfo.currencyDecimals"
                            :minDecimals="0"
                        />
                        <FiatAmount
                            :amount="_toFiat(_baseAmountInfo.myAmount, _baseAmountInfo.currency)"
                            :currency="request.fiatCurrency"
                        />
                    </div>
                    <div :class="{ redeeming: _redeemingAmountInfo === _otherAmountInfo }">
                        <Amount
                            :amount="_otherAmountInfo.myAmount"
                            :currency="_otherAmountInfo.currency"
                            :currencyDecimals="_otherAmountInfo.currencyDecimals"
                            :maxDecimals="_otherAmountInfo.currencyDecimals"
                            :minDecimals="0"
                        />
                        <FiatAmount
                            :amount="_toFiat(_otherAmountInfo.myAmount, _otherAmountInfo.currency)"
                            :currency="request.fiatCurrency"
                        />
                    </div>
                </div>

                <div class="new-balances">
                    <div>
                        <Amount
                            :amount="_baseAmountInfo.newBalance"
                            :currency="_baseAmountInfo.currency"
                            :currencyDecimals="_baseAmountInfo.currencyDecimals"
                            :maxDecimals="_baseAmountInfo.currencyDecimals"
                            :minDecimals="0"
                        />
                        <FiatAmount
                            :amount="_toFiat(_baseAmountInfo.newBalance, _baseAmountInfo.currency)"
                            :currency="request.fiatCurrency"
                        />
                    </div>
                    <div>
                        <Amount
                            :amount="_otherAmountInfo.newBalance"
                            :currency="_otherAmountInfo.currency"
                            :currencyDecimals="_otherAmountInfo.currencyDecimals"
                            :maxDecimals="_otherAmountInfo.currencyDecimals"
                            :minDecimals="0"
                        />
                        <FiatAmount
                            :amount="_toFiat(_otherAmountInfo.newBalance, _otherAmountInfo.currency)"
                            :currency="request.fiatCurrency"
                        />
                    </div>
                </div>
            </PageBody>

            <div class="bottom-container" :class="{
                'full-height': state === State.SYNCING_FAILED || state === State.FETCHING_SWAP_DATA_FAILED,
            }">
                <LedgerUi small
                    @information-shown="ledgerInstructionsShown = true"
                    @no-information-shown="ledgerInstructionsShown = false"
                />
                <transition name="transition-fade">
                    <div v-if="_currentSigningInfo && ledgerApiStateType === LedgerApiStateType.REQUEST_PROCESSING"
                        class="signing-info nq-blue-bg"
                    >
                        <div class="signing-instructions">
                            <CheckmarkSmallIcon v-for="step in _currentSigningInfo.step - 1" class="step" />
                            <div v-if="_currentSigningInfo.totalSteps > 1" class="step current-step">
                                {{ _currentSigningInfo.step }}
                            </div>
                            <div class="instructions-text">{{ _currentSigningInfo.instructions }}</div>
                            <div class="step" v-for="step in _currentSigningInfo.totalSteps - _currentSigningInfo.step">
                                {{ step + _currentSigningInfo.step }}
                            </div>
                        </div>
                        <div class="transaction-details"
                            :class="{
                                // For long BTC htlc addresses use a two line layout
                                'two-line-address-layout': _currentSigningInfo.recipient.length > 44,
                                // on narrower standard layout shrink long amounts if they and the labels don't fit
                                'shrink-amounts': request.layout === 'standard'
                                    && (
                                        $t('Amount')
                                        + `${_currentSigningInfo.amount / 10 ** _currentSigningInfo.currencyDecimals}`
                                        + $t('Fee')
                                        + `${_currentSigningInfo.fee / 10 ** _currentSigningInfo.currencyDecimals}`
                                    ).length > 29,
                             }"
                        >
                            <label class="address-label">{{ $t('Address') }}</label>
                            <div class="address">{{ _currentSigningInfo.recipient }}</div>
                            <label class="amount-label">{{ $t('Amount') }}</label>
                            <Amount
                                :amount="_currentSigningInfo.amount"
                                :currency="_currentSigningInfo.currency"
                                :currencyDecimals="_currentSigningInfo.currencyDecimals"
                                :maxDecimals="_currentSigningInfo.currencyDecimals"
                                :minDecimals="0"
                                class="amount"
                            />
                            <label class="fee-label">{{ $t('Fee') }}</label>
                            <Amount
                                :amount="_currentSigningInfo.fee"
                                :currency="_currentSigningInfo.currency"
                                :currencyDecimals="_currentSigningInfo.currencyDecimals"
                                :maxDecimals="_currentSigningInfo.currencyDecimals"
                                :minDecimals="0"
                                class="fee"
                            />
                        </div>
                    </div>
                    <StatusScreen v-else-if="state === State.SYNCING_FAILED || state === State.FETCHING_SWAP_DATA_FAILED
                        || !ledgerInstructionsShown"
                        :state="statusScreenState"
                        :title="statusScreenTitle"
                        :status="statusScreenStatus"
                        :message="statusScreenMessage"
                        :mainAction="statusScreenAction"
                        @main-action="_statusScreenActionHandler"
                        :small="state !== State.SYNCING_FAILED && state !== State.FETCHING_SWAP_DATA_FAILED"
                    />
                </transition>
            </div>
        </SmallPage>

        <GlobalClose :hidden="state === State.FINISHED" />
    </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import {
    SmallPage,
    PageHeader,
    PageBody,
    Identicon,
    Amount,
    FiatAmount,
    Tooltip,
    ArrowRightIcon,
    CheckmarkSmallIcon,
} from '@nimiq/vue-components';
import SetupSwap, { SwapSetupInfo } from './SetupSwap.vue';
import SetupSwapSuccess, { SwapHtlcInfo } from './SetupSwapSuccess.vue';
import StatusScreen from '../components/StatusScreen.vue';
import GlobalClose from '../components/GlobalClose.vue';
import LedgerUi from '../components/LedgerUi.vue';
import Network from '../components/Network.vue';
import LedgerApi, {
    EventType as LedgerApiEventType,
    State as LedgerApiState,
    StateType as LedgerApiStateType,
    RequestTypeNimiq as LedgerApiRequestTypeNimiq,
    RequestTypeBitcoin as LedgerApiRequestTypeBitcoin,
    TransactionInfoNimiq as LedgerNimiqTransactionInfo,
    TransactionInfoBitcoin as LedgerBitcoinTransactionInfo,
    Network as LedgerApiNetwork,
    getBip32Path,
    parseBip32Path,
    Coin,
} from '@nimiq/ledger-api';
import {
    getBackgroundColorName as getIdenticonBackgroundColorName,
    backgroundColors as identiconBackgroundColors,
    colorNames as identiconColorNames,
// @ts-ignore Could not find a declaration file for module '@nimiq/iqons'.
} from '@nimiq/iqons';
import { SwapAsset } from '@nimiq/fastspot-api';
import Config from 'config';
import { SignedBtcTransaction } from '../lib/PublicRequestTypes';
import { WalletInfo } from '../lib/WalletInfo';
import { ERROR_CANCELED } from '../lib/Constants';
import { BTC_NETWORK_TEST } from '../lib/bitcoin/BitcoinConstants';
import { loadNimiq } from '../lib/Helpers';
import { loadBitcoinJS } from '../lib/bitcoin/BitcoinJSLoader';
import { getElectrumClient } from '../lib/bitcoin/ElectrumClient';
import { satoshisToCoins } from '../lib/bitcoin/BitcoinUtils';
import { prepareBitcoinTransactionForLedgerSigning } from '../lib/bitcoin/BitcoinLedgerUtils';

type BalanceBarEntry = {
    currency: SwapAsset,
    background: string,
    oldFiatBalance: number,
    newFiatBalance: number,
};

type SwapAmountInfo = {
    myAmount: number,
    theirAmount: number,
    myTransactionFee: number,
    fees: number,
    currency: SwapAsset,
    currencyDecimals: number,
    fiatRate: number;
    newBalance?: number,
};

type SigningInfo = {
    step: number,
    totalSteps: number,
    instructions: string,
    recipient: string,
    amount: number,
    fee: number,
    currency: SwapAsset,
    currencyDecimals: number,
};

const ProxyExtraData = {
    // HTLC Proxy Funding, abbreviated as 'HPFD', mapped to values outside of basic ascii range
    FUND:  new Uint8Array([0, ...('HPFD'.split('').map((c) => c.charCodeAt(0) + 63))]),
    // HTLC Proxy Redeeming, abbreviated as 'HPRD', mapped to values outside of basic ascii range
    REDEEM: new Uint8Array([0, ...('HPRD'.split('').map((c) => c.charCodeAt(0) + 63))]),
};

@Component({components: {
    SmallPage,
    PageHeader,
    PageBody,
    Identicon,
    Amount,
    FiatAmount,
    Tooltip,
    ArrowRightIcon,
    CheckmarkSmallIcon,
    StatusScreen,
    GlobalClose,
    LedgerUi,
}})
export default class SetupSwapLedger extends Mixins(SetupSwap, SetupSwapSuccess) {
    protected get State() {
        return {
            // super.State doesn't work
            ...(this.constructor as any).superOptions.computed.State.get.call(this),
            FINISHED: 'finished',
        };
    }

    @Getter protected findWallet!: (id: string) => WalletInfo | undefined;
    protected _account!: WalletInfo;
    private readonly SwapAsset = SwapAsset;
    private readonly LedgerApiStateType = LedgerApiStateType;
    private _setupSwapPromise!: Promise<SwapSetupInfo>;
    private nimiqLedgerAddressInfo?: { address: Nimiq.Address, label: string, balance: number, signerPath: string };
    private _nimiqProxyKeyPromise?: Promise<Nimiq.KeyPair>;
    private ledgerInstructionsShown = false;
    private ledgerApiStateType: LedgerApiStateType = LedgerApi.currentState.type;
    private currentlySignedTransaction: LedgerNimiqTransactionInfo
        | Parameters<typeof prepareBitcoinTransactionForLedgerSigning>[0]
        | null = null;

    protected async created() {
        const { fund, redeem, nimiqAddresses, walletId } = this.request;

        Promise.all([
            // preload nimiq cryptography used in ledger api and createTx, sendToNetwork
            fund.type === SwapAsset.NIM || redeem.type === SwapAsset.NIM ? loadNimiq() : null,
            // if we need to fund the proxy address, pre-initialize the nimiq network
            fund.type === SwapAsset.NIM ? this.nimiqNetwork.getNetworkClient() : null,
            // preload BitcoinJS and the electrum client used in prepareBitcoinTransactionForLedgerSigning
            fund.type === SwapAsset.BTC || redeem.type === SwapAsset.BTC
                ? loadBitcoinJS().then(getElectrumClient) : null,
        ]).catch(() => void 0);

        this._setupSwapPromise = new Promise((resolve) => this._setupSwap = resolve);

        // existence checked by _hubApiHandler in RpcApi
        this._account = this.findWallet(walletId)!;

        if (fund.type === SwapAsset.NIM || redeem.type === SwapAsset.NIM) {
            const nimiqLedgerAddress = fund.type === SwapAsset.NIM
                ? fund.sender
                : redeem.type === SwapAsset.NIM
                    ? redeem.recipient
                    : (() => { throw new Error('Unexpected'); })(); // should never happen
            const nimiqLedgerAddressInfo = this._account.findContractByAddress(nimiqLedgerAddress)
                || this._account.accounts.get(nimiqLedgerAddress.toUserFriendlyAddress());
            if (!nimiqLedgerAddressInfo) {
                this.$rpc.reject(new Error(`Unknown address ${nimiqLedgerAddress.toUserFriendlyAddress()}`));
                return;
            }
            if (nimiqAddresses) {
                // Use the provided balance as it's potentially more up to date. Existence of an entry for our address
                // is ensured by RequestParser.
                nimiqLedgerAddressInfo.balance = nimiqAddresses.find(
                    ({ address }) => Nimiq.Address.fromAny(address).equals(nimiqLedgerAddress))!.balance;
            } else {
                nimiqLedgerAddressInfo.balance = nimiqLedgerAddressInfo.balance || 0;
            }
            const signerPath = this._account.findSignerForAddress(nimiqLedgerAddress)!.path;
            this.nimiqLedgerAddressInfo = {
                ...nimiqLedgerAddressInfo as Required<
                    Pick<typeof nimiqLedgerAddressInfo, 'address' | 'label' | 'balance'>>,
                signerPath,
            };

            // As the Ledger Nimiq app currently does not support signing HTLCs yet, we use a proxy in-memory key.
            // This key gets derived from the Ledger public key at proxyKeyPath as entropy.
            this._nimiqProxyKeyPromise = (async () => {
                const { addressIndex } = parseBip32Path(signerPath);
                const proxyKeyPath = getBip32Path({
                    coin: Coin.NIMIQ,
                    accountIndex: 2 ** 31 - 1, // max index allowed by bip32
                    addressIndex: 2 ** 31 - 1 - addressIndex, // use a distinct proxy per address for improved privacy
                });
                const pubKeyAsEntropy = await LedgerApi.Nimiq.getPublicKey(proxyKeyPath, this._account.keyId);
                const nimProxyKey = Nimiq.KeyPair.derive(new Nimiq.PrivateKey(pubKeyAsEntropy.serialize()));

                // Replace nim address by the proxy's address. Don't replace request.nimiqAddresses which should contain
                // the original address for display.
                const proxyAddress = nimProxyKey.publicKey.toAddress();
                if (fund.type === SwapAsset.NIM) {
                    fund.sender = proxyAddress; // also defines the htlc refundAddress in SetupSwapSuccess
                } else if (redeem.type === SwapAsset.NIM) {
                    redeem.recipient = proxyAddress; // also defines the htlc redeemAddress in SetupSwapSuccess
                }

                return nimProxyKey;
            })();
            // Catch errors to avoid uncaught promise rejections but ignore them and keep errors displayed in LedgerUi.
            this._nimiqProxyKeyPromise.catch(() => void 0);
        }

        this._onLedgerApiStateChange = this._onLedgerApiStateChange.bind(this);
        LedgerApi.on(LedgerApiEventType.STATE_CHANGE, this._onLedgerApiStateChange);
    }

    protected destroyed() {
        this._isDestroyed = true;
        LedgerApi.off(LedgerApiEventType.STATE_CHANGE, this._onLedgerApiStateChange);
        LedgerApi.disconnect(
            /* cancelRequest */ true,
            /* requestTypesToDisconnect */ [
                LedgerApiRequestTypeNimiq.GET_PUBLIC_KEY,
                LedgerApiRequestTypeNimiq.SIGN_TRANSACTION,
                LedgerApiRequestTypeBitcoin.SIGN_TRANSACTION,
            ],
        );
    }

    protected async _collectSwapSetupInfo(): Promise<SwapSetupInfo | null> {
        // super._collectSwapSetupInfo doesn't work
        const swapSetupInfo = await (this.constructor as any).superOptions.methods._collectSwapSetupInfo.call(this);
        if (!swapSetupInfo) return null;

        // Replace nim address by the proxy's address.
        if (this._nimiqProxyKeyPromise) {
            let nimProxyKey: Nimiq.KeyPair;
            try {
                nimProxyKey = await this._nimiqProxyKeyPromise;
            } catch (e) {
                return null;
            }
            const proxyAddress = nimProxyKey.publicKey.toAddress().serialize();
            if (swapSetupInfo.fund.type === SwapAsset.NIM) {
                swapSetupInfo.fund.sender = proxyAddress;
                swapSetupInfo.fund.senderType = Nimiq.Account.Type.BASIC;
            } else if (swapSetupInfo.redeem.type === SwapAsset.NIM) {
                swapSetupInfo.redeem.recipient = proxyAddress;
            }
        }

        return swapSetupInfo;
    }

    protected async _shouldConfirmSwap() {
        if (this._isDestroyed) return false;
        try {
            // await first step of swap setup
            const swapSetupInfo = await this._setupSwapPromise;
            // Require user to connect and unlock his ledger which also shows that he intends to actually do the swap.
            if (this._nimiqProxyKeyPromise) {
                await this._nimiqProxyKeyPromise;
            } else if (swapSetupInfo.fund.type === SwapAsset.BTC || swapSetupInfo.redeem.type === SwapAsset.BTC) {
                await LedgerApi.Bitcoin.getWalletId(Config.bitcoinNetwork === BTC_NETWORK_TEST
                    ? LedgerApiNetwork.TESTNET
                    : LedgerApiNetwork.MAINNET,
                );
            } else {
                return false;
            }
        } catch (e) {
            return false;
        }
        return !this._isDestroyed;
    }

    protected async _signSwapTransactions(htlcInfo: SwapHtlcInfo)
        : Promise<{ nim?: Nimiq.Transaction, nimProxy?: Nimiq.Transaction, btc?: SignedBtcTransaction, eur?: string }
        | null> {
        // Called from SetupSwapSuccess
        if (this._isDestroyed) return null;
        let swapSetupInfo: SwapSetupInfo;
        let nimiqProxyKey: Nimiq.KeyPair | undefined;
        let Buffer: typeof import('buffer').Buffer | undefined;
        try {
            [swapSetupInfo, nimiqProxyKey] = await Promise.all([
                this._setupSwapPromise,
                this._nimiqProxyKeyPromise,
                this.request.fund.type === SwapAsset.BTC || this.request.redeem.type === SwapAsset.BTC
                    ? loadBitcoinJS() : null,
            ]);
            if (typeof BitcoinJS !== 'undefined') {
                // note that buffer is marked as external module in vue.config.js and internally, the buffer bundled
                // with BitcoinJS is used, therefore we retrieve it after having BitcoinJS loaded.
                // TODO change this when we don't prebuild BitcoinJS anymore
                Buffer = await import('buffer').then((module) => module.Buffer);
            }
        } catch (e) {
            return null;
        }

        if (this._isDestroyed) return null;

        // Step 1: collect transaction infos to sign

        // Collect nimiq swap transaction info
        let nimiqSwapTransactionInfo: Parameters<Network['createTx']>[0] | undefined; // signed by proxy, not Ledger
        let nimiqProxyTransactionInfo: LedgerNimiqTransactionInfo & Parameters<Network['createTx']>[0] | undefined;
        if (this.request.fund.type === SwapAsset.NIM
            && swapSetupInfo.fund.type === SwapAsset.NIM
            && htlcInfo.fund.type === SwapAsset.NIM
            && this.nimiqLedgerAddressInfo
            && nimiqProxyKey) {
            nimiqSwapTransactionInfo = {
                signerPubKey: nimiqProxyKey.publicKey,
                sender: new Nimiq.Address(swapSetupInfo.fund.sender),
                senderType: swapSetupInfo.fund.senderType,
                recipient: Nimiq.Address.CONTRACT_CREATION, // htlc creation
                recipientType: Nimiq.Account.Type.HTLC,
                value: swapSetupInfo.fund.value,
                fee: swapSetupInfo.fund.fee,
                validityStartHeight: swapSetupInfo.fund.validityStartHeight,
                // network: Config.network, // enable when signed by Ledger
                flags: Nimiq.Transaction.Flag.CONTRACT_CREATION,
                data: htlcInfo.fund.htlcData, // for proxy via createTx and getUnrelayedTransactions
                // extraData: htlcInfo.fund.htlcData, // for LedgerApi; unset as Ledger does not sign this tx currently
            };
            // funding tx from Ledger to proxy address
            nimiqProxyTransactionInfo = {
                signerPubKey: nimiqProxyKey.publicKey, // anything, unused as signed by Ledger
                sender: this.nimiqLedgerAddressInfo.address,
                recipient: nimiqProxyKey.publicKey.toAddress(),
                value: swapSetupInfo.fund.value,
                validityStartHeight: swapSetupInfo.fund.validityStartHeight,
                network: Config.network,
                // data: ProxyExtraData.FUND, // for createTx and getUnrelayedTransactions; unset as signed by Ledger
                extraData: ProxyExtraData.FUND, // for LedgerApi
            };
        } else if (this.request.redeem.type === SwapAsset.NIM
            && swapSetupInfo.redeem.type === SwapAsset.NIM
            && htlcInfo.redeem.type === SwapAsset.NIM
            && this.nimiqLedgerAddressInfo
            && nimiqProxyKey) {
            // The htlc redeem tx currently has to be signed by the proxy but doesn't have to forward funds through it.
            nimiqSwapTransactionInfo = {
                signerPubKey: nimiqProxyKey.publicKey,
                sender: Nimiq.Address.fromString(htlcInfo.redeem.htlcAddress),
                senderType: Nimiq.Account.Type.HTLC,
                recipient: this.nimiqLedgerAddressInfo.address,
                value: swapSetupInfo.redeem.value,
                fee: swapSetupInfo.redeem.fee,
                validityStartHeight: swapSetupInfo.redeem.validityStartHeight,
                // network: Config.network, // enable when signed by Ledger
            };
        }

        // Collect bitcoin swap transaction info
        let bitcoinTransactionInfo: Parameters<typeof prepareBitcoinTransactionForLedgerSigning>[0] | undefined;
        const bitcoinNetwork = typeof BitcoinJS !== 'undefined' && (Config.bitcoinNetwork === BTC_NETWORK_TEST
            ? BitcoinJS.networks.testnet
            : BitcoinJS.networks.bitcoin);
        if (this.request.fund.type === SwapAsset.BTC
            && swapSetupInfo.fund.type === SwapAsset.BTC
            && htlcInfo.fund.type === SwapAsset.BTC
            && bitcoinNetwork
            && Buffer) {
            const htlcAddress = BitcoinJS.payments.p2wsh({
                witness: [Buffer.from(htlcInfo.fund.htlcScript)],
                network: bitcoinNetwork,
            }).address;

            if (!htlcAddress) {
                throw new Error('Cannot derive HTLC address from BTC HTLC script');
            }

            bitcoinTransactionInfo = {
                inputs: swapSetupInfo.fund.inputs,
                recipientOutput: {
                    ...swapSetupInfo.fund.recipientOutput,
                    address: htlcAddress,
                },
                ...(this.request.fund.changeOutput && swapSetupInfo.fund.changeOutput ? {
                    changeOutput: {
                        ...swapSetupInfo.fund.changeOutput,
                        address: this.request.fund.changeOutput.address,
                    },
                } : {}),
                locktime: swapSetupInfo.fund.locktime,
            };
        } else if (this.request.redeem.type === SwapAsset.BTC
            && swapSetupInfo.redeem.type === SwapAsset.BTC
            && htlcInfo.redeem.type === SwapAsset.BTC) {
            bitcoinTransactionInfo = {
                inputs: [{ // the htlc is our single input
                    keyPath: swapSetupInfo.redeem.input.keyPath,
                    transactionHash: htlcInfo.redeem.transactionHash,
                    outputIndex: htlcInfo.redeem.outputIndex,
                    witnessScript: Nimiq.BufferUtils.toHex(htlcInfo.redeem.htlcScript),
                }],
                recipientOutput: {
                    ...swapSetupInfo.redeem.output,
                    address: this.request.redeem.output.address,
                },
                // no change output
            };
        }

        // prepare btc transaction for ledger signing
        const preparedBitcoinTransactionInfoPromise = bitcoinTransactionInfo
            && prepareBitcoinTransactionForLedgerSigning(bitcoinTransactionInfo);

        // Step 2: sign transactions on the Ledger

        let signedNimiqSwapTransaction: Nimiq.Transaction | undefined;
        let signedNimiqProxyTransaction: Nimiq.Transaction | undefined;
        let nimiqSendPromise: Promise<any> = Promise.resolve();
        let signedBitcoinTransaction: BitcoinJS.Transaction | undefined;
        let euroSettlement: string | undefined;
        try {
            if (this._isDestroyed) return null;

            // First sign Nim transaction (if Nim is involved in the swap) as user is already connected to nimiq app and
            // to give time for proxy funding.

            if (swapSetupInfo.fund.type === SwapAsset.NIM && nimiqProxyTransactionInfo && this.nimiqLedgerAddressInfo) {
                // send funding tx from Ledger to proxy address
                this.currentlySignedTransaction = nimiqProxyTransactionInfo;
                signedNimiqProxyTransaction = this.nimiqNetwork.getUnrelayedTransactions(nimiqProxyTransactionInfo)[0];
                if (!signedNimiqProxyTransaction) {
                    signedNimiqProxyTransaction = await LedgerApi.Nimiq.signTransaction(
                        nimiqProxyTransactionInfo,
                        this.nimiqLedgerAddressInfo.signerPath,
                        this._account.keyId,
                    );
                }
                // ignore broadcast errors. The Wallet will also try to send the tx
                nimiqSendPromise = this.nimiqNetwork.sendToNetwork(signedNimiqProxyTransaction).catch(() => void 0);
            } else if (swapSetupInfo.redeem.type === SwapAsset.NIM && nimiqSwapTransactionInfo) {
                // For redeeming, the htlc swap transaction is signed by the proxy. Nonetheless, we let the user sign an
                // unused dummy transaction for ux consistency. This transaction is signed from a keyPath which does not
                // actually hold funds.
                const dummyTransaction = {
                    ...nimiqSwapTransactionInfo,
                    sender: nimiqSwapTransactionInfo.sender instanceof Nimiq.Address
                        ? nimiqSwapTransactionInfo.sender
                        : new Nimiq.Address(nimiqSwapTransactionInfo.sender),
                    senderType: undefined, // Ledgers can't sign htlc senders yet
                    recipient: nimiqSwapTransactionInfo.recipient instanceof Nimiq.Address
                        ? nimiqSwapTransactionInfo.recipient
                        : new Nimiq.Address(nimiqSwapTransactionInfo.recipient),
                };
                this.currentlySignedTransaction = dummyTransaction;
                await LedgerApi.Nimiq.signTransaction(
                    dummyTransaction,
                    // Any unused key path; We use the highest bip32 nimiq path here; but note that the signing address
                    // is different from the proxy account even if the paths coincide as the proxy account is derived
                    // from the public key. Note that in the case of a coinciding path, this signed tx should not be
                    // exposed to not expose the public key.
                    getBip32Path({ coin: Coin.NIMIQ, accountIndex: 2 ** 31 - 1, addressIndex: 2 ** 31 - 1 }),
                    this._account.keyId,
                );
            }

            if (this._isDestroyed) return null;

            // Sign the Btc transaction

            if (bitcoinTransactionInfo && preparedBitcoinTransactionInfoPromise) {
                let preparedBitcoinTransactionInfo: LedgerBitcoinTransactionInfo;
                try {
                    preparedBitcoinTransactionInfo = await preparedBitcoinTransactionInfoPromise;
                } catch (e) {
                    this.error = e.message || e;
                    return null;
                }

                // Set the state to idle in case it wasn't set yet, as the LedgerApi event fires asynchronously, to
                // avoid that the signing instructions already switch to the next request before it's being processed.
                this.ledgerApiStateType = LedgerApiStateType.IDLE;
                this.currentlySignedTransaction = bitcoinTransactionInfo;

                signedBitcoinTransaction = BitcoinJS.Transaction.fromHex(
                    await LedgerApi.Bitcoin.signTransaction(preparedBitcoinTransactionInfo));
            }
        } catch (e) {
            // If cancelled reject. Otherwise just keep the ledger ui / error message displayed.
            if (e.message.toLowerCase().indexOf('cancelled') !== -1) throw new Error(ERROR_CANCELED);
            return null;
        }

        // Step 3: sign transactions not signed by Ledger

        // Sign Nim swap transaction by proxy
        if (nimiqSwapTransactionInfo && nimiqProxyKey) {
            signedNimiqSwapTransaction = await this.nimiqNetwork.createTx(nimiqSwapTransactionInfo);
            signedNimiqSwapTransaction.proof = Nimiq.SignatureProof.singleSig(
                nimiqProxyKey.publicKey,
                Nimiq.Signature.create(
                    nimiqProxyKey.privateKey,
                    nimiqProxyKey.publicKey,
                    signedNimiqSwapTransaction.serializeContent(),
                ),
            ).serialize();
        }

        // Set euro settlement
        if (swapSetupInfo.fund.type === SwapAsset.EUR) {
            // Nothing to sign for funding EUR
            euroSettlement = '';
        }

        // Step 4: post process signed transactions

        // set htlc witness for redeeming the BTC htlc. For Nimiq, the htlc proof is set in SetupSwapSuccess.
        if (swapSetupInfo.redeem.type === SwapAsset.BTC
            && htlcInfo.redeem.type === SwapAsset.BTC
            && signedBitcoinTransaction) {
            const htlcInput = signedBitcoinTransaction.ins[0];
            // get signature and signer pub key from default witness generated by ledgerjs (see @ledgerhq/hw-app-btc
            // createTransaction.js creation of the witness towards the end of createTransaction)
            const [inputSignature, signerPubKey] = htlcInput.witness;

            const witnessBytes = BitcoinJS.script.fromASM([
                inputSignature.toString('hex'),
                signerPubKey.toString('hex'),
                // Use zero-bytes as a dummy secret which are replaced in the wallet once the swap secret is known
                '0000000000000000000000000000000000000000000000000000000000000000',
                'OP_1', // OP_1 (true) activates the redeem branch in the HTLC script
                Nimiq.BufferUtils.toHex(htlcInfo.redeem.htlcScript),
            ].join(' '));

            const witnessStack = BitcoinJS.script.toStack(witnessBytes);
            signedBitcoinTransaction.setWitness(0, witnessStack);
        }

        this.state = this.State.FINISHED;
        await nimiqSendPromise;

        return {
            nim: signedNimiqSwapTransaction,
            nimProxy: signedNimiqProxyTransaction,
            btc: signedBitcoinTransaction && {
                serializedTx: signedBitcoinTransaction.toHex(),
                hash: signedBitcoinTransaction.getId(),
            },
            eur: euroSettlement,
        };
    }

    protected _statusScreenActionHandler() {
        window.location.reload();
    }

    // Getters for displaying information

    protected get statusScreenTitle() {
        switch (this.state) {
            case this.State.FETCHING_SWAP_DATA_FAILED:
                return this.$t('Swap Setup Failed') as string;
            case this.State.SYNCING_FAILED:
                return this.$t('Syncing Failed') as string;
            default:
                return ''; // don't display a title in small ui state
        }
    }

    protected get statusScreenStatus() {
        // Other than SetupSwapSuccess do no show a status for FETCHING_SWAP_DATA and SIGNING_TRANSACTIONS as during
        // these states typically the LedgerUi is / was just active and the StatusScreen will fade.
        if (this.state !== this.State.SYNCING) return '';
        return this.$t('Syncing with Bitcoin network...') as string;
    }

    private get _fundingAmountInfo(): SwapAmountInfo {
        const { fund: fundInfo, serviceFundingFee, bitcoinAccount, fundingFiatRate: fiatRate } = this.request;
        const { type: currency } = fundInfo;
        let currencyDecimals: number;
        let myAmount: number; // what we are paying including fees
        let myTransactionFee: number;
        let newBalance: number | undefined;
        switch (fundInfo.type) {
            case SwapAsset.NIM:
                currencyDecimals = 5;
                myTransactionFee = fundInfo.fee;
                myAmount = fundInfo.value + fundInfo.fee;
                newBalance = this.nimiqLedgerAddressInfo!.balance - myAmount;
                break;
            case SwapAsset.BTC:
                currencyDecimals = 8;
                const { inputs, output, changeOutput } = fundInfo;
                const inputsValue = inputs.reduce((sum, { value }) => sum + value, 0);
                // inputs minus outputs
                myTransactionFee = (inputsValue - output.value - (changeOutput ? changeOutput.value : 0));
                myAmount = inputsValue - (changeOutput ? changeOutput.value : 0);
                newBalance = bitcoinAccount ? bitcoinAccount.balance - myAmount : undefined;
                break;
            case SwapAsset.EUR:
                currencyDecimals = 2;
                myTransactionFee = fundInfo.fee;
                myAmount = fundInfo.value + fundInfo.fee;
                newBalance = undefined; // unknown and unused
                break;
            default:
                throw new Error(`Unsupported currency ${currency}`);
        }
        const fees = myTransactionFee + serviceFundingFee;
        const theirAmount = myAmount - fees; // what the other party receives excluding fees
        return { myAmount, theirAmount, myTransactionFee, fees, currency, currencyDecimals, newBalance, fiatRate };
    }

    private get _redeemingAmountInfo(): SwapAmountInfo {
        const { redeem: redeemInfo, serviceRedeemingFee, bitcoinAccount, redeemingFiatRate: fiatRate } = this.request;
        const { type: currency } = redeemInfo;
        let currencyDecimals: number;
        let myAmount: number; // what we receive excluding fees
        let myTransactionFee: number;
        let newBalance: number | undefined;
        switch (redeemInfo.type) {
            case SwapAsset.NIM:
                currencyDecimals = 5;
                myAmount = redeemInfo.value;
                myTransactionFee = redeemInfo.fee;
                newBalance = this.nimiqLedgerAddressInfo!.balance + myAmount;
                break;
            case SwapAsset.BTC:
                currencyDecimals = 8;
                const { input, output } = redeemInfo;
                myAmount = output.value;
                myTransactionFee = input.value - output.value; // inputs minus outputs
                newBalance = bitcoinAccount ? bitcoinAccount.balance + myAmount : undefined;
                break;
            // case SwapAsset.EUR:
            //     currencyDecimals = 2;
            //     myAmount = redeemInfo.value;
            //     myTransactionFee = redeemInfo.fee;
            //     newBalance = undefined; // unknown and unused
            //     break;
            default:
                throw new Error(`Unsupported currency ${currency}`);
        }
        const fees = myTransactionFee + serviceRedeemingFee;
        const theirAmount = myAmount + fees; // what the other party pays including fees
        return { myAmount, theirAmount, myTransactionFee, fees, currency, currencyDecimals, newBalance, fiatRate };
    }

    private get _baseAmountInfo(): SwapAmountInfo {
        // alias for _fundingAmountInfo or _redeemingAmountInfo for easier lookup
        const { fund: { type: fundingCurrency }, redeem: { type: redeemingCurrency } } = this.request;
        const swapCurrencies = [fundingCurrency, redeemingCurrency];
        let swapBase: SwapAsset;
        if (swapCurrencies.includes(SwapAsset.NIM)) {
            swapBase = SwapAsset.NIM; // Nim if Nim is involved
        } else {
            swapBase = swapCurrencies.find((currency) => currency !== SwapAsset.EUR)!; // the non-fiat currency
        }
        return [this._fundingAmountInfo, this._redeemingAmountInfo].find((info) => info.currency === swapBase)!;
    }

    private get _otherAmountInfo(): SwapAmountInfo {
        // alias for _fundingAmountInfo or _redeemingAmountInfo for easier lookup
        return [this._fundingAmountInfo, this._redeemingAmountInfo].find((info) => info !== this._baseAmountInfo)!;
    }

    private get _amountInfoForCurrency(): Partial<Record<SwapAsset, SwapAmountInfo>> {
        // alias for _fundingAmountInfo and _redeemingAmountInfo for easier lookup
        const amountInfoForCurrency: Partial<Record<SwapAsset, SwapAmountInfo>> = {};
        amountInfoForCurrency[this._fundingAmountInfo.currency] = this._fundingAmountInfo;
        amountInfoForCurrency[this._redeemingAmountInfo.currency] = this._redeemingAmountInfo;
        return amountInfoForCurrency;
    }

    private get _currentSigningInfo(): SigningInfo | null {
        if (!this.currentlySignedTransaction) return null;
        let currency: SwapAsset;
        let recipient: string;
        if ('recipient' in this.currentlySignedTransaction) {
            currency = SwapAsset.NIM;
            recipient = this.currentlySignedTransaction.recipient.toUserFriendlyAddress();
        } else {
            currency = SwapAsset.BTC;
            recipient = this.currentlySignedTransaction.recipientOutput.address;
        }

        const amountInfo = this._amountInfoForCurrency[currency];
        if (!amountInfo) return null;

        const currenciesToBeSigned = [this._baseAmountInfo, this._otherAmountInfo]
            .map(({ currency: c }) => c)
            // filter out fiat funding which does not have to be signed on the Ledger
            .filter((c) => c === SwapAsset.NIM || c === SwapAsset.BTC);

        return {
            step: currenciesToBeSigned.indexOf(currency) + 1,
            totalSteps: currenciesToBeSigned.length,
            instructions: this.$t('Confirm {outgoingOrIncoming} transaction on Ledger', {
                outgoingOrIncoming: this._fundingAmountInfo.currency === currency
                    ? this.$t('outgoing')
                    : this.$t('incoming'),
            }) as string,
            recipient,
            amount: this._fundingAmountInfo.currency === currency
                ? amountInfo.myAmount - amountInfo.myTransactionFee
                : amountInfo.myAmount,
            fee: amountInfo.myTransactionFee,
            currency,
            currencyDecimals: amountInfo.currencyDecimals,
        };
    }

    private get _totalFiatFees(): number {
        return this._toFiat(this._fundingAmountInfo.fees, this._fundingAmountInfo.currency)
            + this._toFiat(this._redeemingAmountInfo.fees, this._redeemingAmountInfo.currency)
            + this._toFiat(this.request.serviceSwapFee, this._fundingAmountInfo.currency); // in funding currency
    }

    private get _exchangeRate(): number {
        // how much is one coin of the base currency in the other currency (based on theirAmount as the exchange is
        // determined on their side)?
        const exchangeRate = this._toCoins(this._otherAmountInfo.theirAmount, this._otherAmountInfo.currency)
            / this._toCoins(this._baseAmountInfo.theirAmount, this._baseAmountInfo.currency);
        // Round to _otherAmountInfo.currencyDecimals + 1 decimals and avoid displaying a better exchange rate than the
        // actual one by flooring / ceiling in the worse direction instead of rounding, depending on whether we are
        // paying or receiving the base currency. Add or subtract a small epsilon to avoid rounding up or down due to
        // floating point imprecision.
        const roundingFactor = 10 ** (this._otherAmountInfo.currencyDecimals + 1);
        return this._fundingAmountInfo === this._baseAmountInfo
            // when funding, a lower rate is worse (receives less of other currency for same amount of base currency)
            ? Math.floor(exchangeRate * roundingFactor + 1e-10) / roundingFactor
            // when redeeming, a higher rate is worse (pays more of other currency for same amount of base currency)
            : Math.ceil(exchangeRate * roundingFactor - 1e-10) / roundingFactor;
    }

    private get _formattedServiceFee(): string {
        const { serviceSwapFee } = this.request; // in funding currency
        const relativeServiceFee = serviceSwapFee / (this._fundingAmountInfo.theirAmount - serviceSwapFee);
        // Convert to percent and round to two decimals. Always ceil to avoid displaying a lower fee than charged.
        // Subtract a small epsilon to avoid that numbers get rounded up as a result of floating point imprecision after
        // multiplication. Otherwise formatting for example .07 would result in 7.01%.
        return `${Math.ceil(relativeServiceFee * 100 * 100 - 1e-10) / 100}%`;
    }

    private get _formattedOasisFee(): string {
        const euroAmountInfo = this._amountInfoForCurrency[SwapAsset.EUR];
        if (!euroAmountInfo) return '0%';
        const relativeOasisFee = euroAmountInfo.fees / this._fundingAmountInfo.theirAmount;
        // Convert to percent and round to two decimals. Always ceil to avoid displaying a lower fee than charged.
        // Subtract a small epsilon to avoid that numbers get rounded up as a result of floating point imprecision after
        // multiplication. Otherwise formatting for example .07 would result in 7.01%.
        return `${Math.ceil(relativeOasisFee * 100 * 100 - 1e-10) / 100}%`;
    }

    private get _balanceBarEntries(): BalanceBarEntry[] {
        if (this.request.layout !== 'slider'
            || !this.request.nimiqAddresses
            || !this.request.bitcoinAccount
            || !this._amountInfoForCurrency[SwapAsset.NIM]
            || !this._amountInfoForCurrency[SwapAsset.BTC]
        ) return [];
        return [
            ...this.request.nimiqAddresses.map(({ address, balance }) => {
                const nimiqAddress = Nimiq.Address.fromAny(address);
                const oldFiatBalance = this._toFiat(balance, SwapAsset.NIM);
                return {
                    currency: SwapAsset.NIM,
                    background: identiconBackgroundColors[identiconColorNames.indexOf(
                        getIdenticonBackgroundColorName(nimiqAddress.toUserFriendlyAddress()),
                    )],
                    oldFiatBalance,
                    newFiatBalance: nimiqAddress.equals(this.nimiqLedgerAddressInfo!.address)
                        ? this._toFiat(this._amountInfoForCurrency[SwapAsset.NIM]!.newBalance!, SwapAsset.NIM)
                        : oldFiatBalance,
                };
            }), {
                currency: SwapAsset.BTC,
                background: '#F7931A', // Bitcoin orange
                oldFiatBalance: this._toFiat(this.request.bitcoinAccount.balance, SwapAsset.BTC),
                newFiatBalance: this._toFiat(this._amountInfoForCurrency[SwapAsset.BTC]!.newBalance!, SwapAsset.BTC),
            },
        ];
    }

    private _onLedgerApiStateChange(state: LedgerApiState) {
        this.ledgerApiStateType = state.type;
    }

    private _toCoins(amount: number, currency: SwapAsset) {
        switch (currency) {
            case SwapAsset.NIM: return Nimiq.Policy.lunasToCoins(amount);
            case SwapAsset.BTC: return satoshisToCoins(amount);
            case SwapAsset.EUR: return amount / 100;
            default: throw new Error(`Invalid currency ${currency}`);
        }
    }

    private _toFiat(amount: number, currency: SwapAsset) {
        const coins = this._toCoins(amount, currency);
        if (currency === SwapAsset.EUR) return coins;
        const amountInfoForCurrency = this._amountInfoForCurrency[currency];
        if (!amountInfoForCurrency) throw new Error(`Unknown fiat rate for ${currency}`);
        return coins * amountInfoForCurrency.fiatRate;
    }

    private _close() {
        if (this.state === this.State.FINISHED) return;
        this.$rpc.reject(new Error(ERROR_CANCELED));
    }
}
</script>

<style scoped>
    .small-page {
        position: relative;
        padding-bottom: 24rem; /* for bottom container + additional padding */
    }

    .small-page.wide-page {
        min-width: 63.5rem;
    }

    .page-header {
        padding-bottom: 3rem;
    }

    .page-header .tooltip {
        margin-top: 2rem;
        text-align: left;
        vertical-align: bottom;
    }

    .page-header .tooltip:not(:first-of-type) {
        margin-left: .75rem;
    }

    .page-header .tooltip >>> .trigger {
        padding: 0.75rem 1.5rem;
        border-radius: 5rem;
        font-size: 1.75rem;
        font-weight: 600;
        color: rgba(31, 35, 72, .6); /* nq-blue with .6 opacity */
        box-shadow: rgba(31, 35, 72, .15) 0 0 0 1.5px inset;
    }

    .page-header .tooltip >>> .tooltip-box {
        font-size: 2rem;
    }

    .exchange-rate-tooltip >>> .tooltip-box {
        min-width: 19.5rem;
        line-height: 1.3;
    }

    .fee-tooltip >>> .tooltip-box {
        display: grid;
        grid-template-columns: 1fr auto;
        column-gap: 1rem;
        row-gap: 1rem;
        width: 32.5rem;
        padding-left: 2rem;
        padding-right: 2rem;
        white-space: nowrap;
    }

    .fee-tooltip .fiat-amount {
        justify-self: right;
    }

    .fee-tooltip .explainer {
        grid-column: span 2;
        margin-top: -1rem;
        font-size: 1.75rem;
        white-space: normal;
        opacity: .6;
    }

    .fee-tooltip hr {
        grid-column: span 2;
        margin: .75rem -1rem .5rem;
        border: unset;
        border-top: 1px solid white;
        opacity: .2;
    }

    .fee-tooltip .total {
        font-weight: bold;
    }

    .page-body {
        padding-bottom: 0;
    }

    .address-infos,
    .swap-values,
    .new-balances {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .address-infos label {
        font-size: 2rem;
        font-weight: 600;
        line-height: 1.3;
    }

    /* Standard layout */

    .layout-standard {
        display: flex;
        flex-direction: column;
    }

    .layout-standard .address-infos {
        flex-direction: row;
        align-items: flex-start;
        margin: 1rem 0 2rem;
    }

    .layout-standard .address-infos > div {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: calc(50% - 1.5rem);
    }

    .layout-standard .address-infos .identicon {
        width: 9rem;
        height: 9rem;
    }

    .layout-standard .address-infos :not(.identicon) > img {
        width: 8.5rem;
        height: 8.5rem;
        margin: .25rem;
    }

    .layout-standard .address-infos label {
        position: relative;
        width: 18.5rem; /* 148px, the width the automatic labels are designed for */
        margin: 1.75rem 0;
        white-space: nowrap;
        overflow: hidden;
        text-align: center;
    }

    .layout-standard .address-infos label::after {
        content: '';
        display: inline-block;
        width: 2rem;
        height: 100%;
        position: absolute;
        right: 0;
        background: linear-gradient(to right, rgba(255, 255, 255, 0), white);
    }

    .layout-standard .address-infos .nq-icon {
        margin-top: 3.5rem;
        height: 2.25rem;
        width: 3rem;
        color: var(--nimiq-light-blue);
    }

    .layout-standard .swap-values {
        display: inline-flex;
        flex-direction: column;
        align-items: flex-start;
        margin: 0 auto;
    }

    .layout-standard .from-value {
        font-size: 4rem;
        font-weight: 600;
    }

    .layout-standard .from-value >>> .currency {
        margin-left: -.15em;
        font-size: 0.625em;
        font-weight: bold;
    }

    .layout-standard .to-value {
        font-size: 2.5rem;
        font-weight: 600;
        opacity: 0.6;
    }

    .layout-standard .to-value svg {
        opacity: 0.5;
        margin-left: 1.5rem;
        margin-right: 0.375rem;
    }

    .layout-standard .to-value >>> .currency {
        margin-left: -.15em;
        font-size: 0.8em;
        font-weight: bold;
    }

    /* Slider layout */

    .layout-slider .address-infos > .identicon {
        width: 5.75rem;
        height: 5.75rem;
        margin: -.25rem 0;
    }

    .layout-slider .address-infos > img {
        width: 5.25rem;
        height: 5.25rem;
    }

    .layout-slider .address-infos > label {
        max-width: calc(50% - 5.75rem - 3rem); /* minus identicon width and margin */
        margin: 0 1.5rem;
    }

    .layout-slider .address-infos > label:first-of-type {
        margin-right: auto;
    }

    .layout-slider .balance-bar {
        display: flex;
        align-items: center;
        height: 3.5rem;
        margin: 2.75rem 0 4rem;
    }

    .layout-slider .balance-bar > :not(:last-child) {
        margin-right: 0.375rem;
    }

    .layout-slider .balance-bar .bar {
        position: relative;
        height: 2.5rem;
        border-radius: 0.5rem;
        border-width: .25rem;
        border-style: solid;
        overflow: hidden;
    }

    .layout-slider .balance-bar .bar:first-child {
        border-top-left-radius: 2rem;
        border-bottom-left-radius: 2rem;
    }

    .layout-slider .balance-bar .bar:last-child {
        border-top-right-radius: 2rem;
        border-bottom-right-radius: 2rem;
    }

    .layout-slider .balance-bar .bar .change {
        position: absolute;
        height: 100%;
        right: 0;
        border-radius: 0.125rem;
        background: url('/swap-change-background.svg') repeat-x;
    }

    .layout-slider .balance-bar .separator ~ .bar .change {
        left: 0;
        right: unset;
    }

    .layout-slider .balance-bar .separator {
        width: 0.25rem;
        height: 100%;
        background: rgba(31, 35, 72, 0.3);
        border-radius: .125rem;
    }

    .layout-slider .swap-values {
        margin-bottom: 2rem;
    }

    .layout-slider .swap-values > *,
    .layout-slider .new-balances > * {
        display: flex;
        flex-direction: column;
        line-height: 1;
    }

    .layout-slider .swap-values > :last-child,
    .layout-slider .new-balances > :last-child {
        text-align: right;
    }

    .layout-slider .swap-values .amount,
    .layout-slider .new-balances .amount {
        font-size: 2.5rem;
        font-weight: bold;
    }

    .layout-slider .swap-values .fiat-amount,
    .layout-slider .new-balances .fiat-amount {
        margin-top: .5rem;
        font-size: 2rem;
        font-weight: 600;
        opacity: .4;
    }

    .layout-slider .swap-values .redeeming {
        color: var(--nimiq-green);
    }

    .layout-slider .swap-values .redeeming .amount::before {
        content: '+';
    }

    .layout-slider .swap-values :not(.redeeming) .amount::before {
        content: '-';
    }

    .layout-slider .swap-values .redeeming .fiat-amount {
        opacity: .7;
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
        transition: opacity .4s;
        overflow: hidden;
    }

    .ledger-ui >>> .loading-spinner {
        margin-top: -1.25rem; /* position at same position as StatusScreen's loading spinner */
    }

    .signing-info {
        display: flex;
        padding: 2rem;
        margin: .75rem;
        width: calc(100% - 1.5rem); /* minus 2 * margin */
        height: calc(100% - 1.5rem);
        border-radius: .625rem;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        z-index: 1000;
    }

    .signing-instructions {
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .signing-instructions .step {
        display: flex;
        width: 2.5rem;
        height: 2.5rem;
        margin: 0 .375rem;
        border-radius: 1.25rem;
        justify-content: center;
        align-items: center;
        font-size: 1.5rem;
        font-weight: bold;
        line-height: 1;
        color: rgba(255, 255, 255, .5);
        background: rgba(255, 255, 255, .1);
    }

    .signing-instructions .step.nq-icon {
        padding: .75rem;
    }

    .signing-instructions .current-step {
        color: white;
    }

    .signing-instructions .instructions-text {
        font-size: 1.75rem;
        font-weight: 600;
        margin: 0 1rem 0 .625rem;
    }

    .transaction-details {
        /* as grid layout to be able to align address with amount in two-line-address-layout regardless of label
        transaction lengths */
        display: grid;
        min-width: 100%;
        grid-template-columns: 1fr auto 1fr auto;
        /* short address layout: have the address and address label in separate lines */
        grid-template-areas:
            "address-label address-label address-label address-label"
            "address       address       address       address"
            "amount-label  amount        fee-label     fee";
    }

    .transaction-details.two-line-address-layout {
        grid-template-columns: .5fr auto 1fr auto;
        /* long address layout: no own line for address label, allow the address to break into multiple lines instead */
        grid-template-areas:
            "address-label   address   address   address"
            "amount-label    amount    fee-label fee";
    }

    .transaction-details > * {
        border-radius: .5rem;
        padding: 1rem 1rem .875rem;
        border: .25rem solid rgba(255, 255, 255, .15);
    }

    .transaction-details.two-line-address-layout .address-label,
    .transaction-details .amount-label,
    .transaction-details .fee-label {
        padding-right: 0;
        border-right: none;
        border-top-right-radius: unset;
        border-bottom-right-radius: unset;
    }
    .transaction-details.two-line-address-layout .address,
    .transaction-details .amount,
    .transaction-details .fee {
        border-left: none;
        border-top-left-radius: unset;
        border-bottom-left-radius: unset;
    }
    .transaction-details:not(.two-line-address-layout) .address-label {
        border-bottom: none;
        border-bottom-left-radius: unset;
        border-bottom-right-radius: unset;
    }
    .transaction-details:not(.two-line-address-layout) .address {
        padding-top: .125rem;
        border-top: none;
        border-top-left-radius: unset;
        border-top-right-radius: unset;
    }

    .transaction-details .address ~ * {
        margin-top: 1.5rem;
    }
    .transaction-details .fee-label {
        margin-left: 1.5rem;
    }

    .transaction-details label {
        font-size: 1.5rem;
        font-weight: bold;
        line-height: 1;
        letter-spacing: 0.0875rem;
        text-transform: uppercase;
        color: rgba(255, 255, 255, .5);
    }

    /* Let the browser lazy load the missing glyph for the letter I that is not included in the Fira Mono subset for
    Nimiq addresses (see blocking.css) when we need it to render the ticker "NIM".
    See https://jakearchibald.com/2014/minimising-font-downloads/ or https://jakearchibald.com/2017/combining-fonts/ */
    @font-face {
        font-family: 'Fira Mono';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: local('Fira Mono Regular'), local('FiraMono-Regular'),
            /* Taken from https://fonts.googleapis.com/css2?family=Fira+Mono&text=I */
            url(https://fonts.gstatic.com/l/font?kit=N0bX2SlFPv1weGeLZDtQJOzW0A&skey=bb26c8d476ab3f05&v=v9) format('woff2');
        unicode-range: U+49; /* capital I */
    }

    .transaction-details label + * {
        font-family: 'Fira Mono', monospace;
        font-size: 1.75rem;
        line-height: 1;
    }

    .wide-page .transaction-details label + * {
        font-size: 2rem;
        line-height: .75;
    }

    .transaction-details .address {
        word-spacing: -.25rem;
        white-space: nowrap;
    }

    .wide-page  .transaction-details .address {
        word-spacing: normal;
    }

    .transaction-details.two-line-address-layout .address {
        padding-top: .5rem;
        line-height: 1.3;
        word-break: break-all;
        white-space: normal;
    }

    .transaction-details .amount,
    .transaction-details .fee {
        word-spacing: -.375rem;
    }

    .transaction-details.shrink-amounts .amount,
    .transaction-details.shrink-amounts .fee {
        letter-spacing: -.125rem;
    }

    .transaction-details .address-label {
        grid-area: address-label;
    }
    .transaction-details .address {
        grid-area: address;
    }
    .transaction-details .amount-label {
        grid-area: amount-label;
    }
    .transaction-details .amount:not(.fee) {
        grid-area: amount;
    }
    .transaction-details .fee-label {
        grid-area: fee-label;
    }
    .transaction-details .fee {
        grid-area: fee;
    }
</style>
