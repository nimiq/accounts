<template>
    <div class="container">
        <SmallPage>
            <h1 class="nq-h1">{{ $t('Choose an Address') }}</h1>

            <div class="request-info nq-text">
                {{ $t('{appName} is asking for an address to use.', { appName: request.appName }) }}
            </div>

            <AccountSelector
                :wallets="processedWallets"
                :minBalance="request.minBalance"
                :disableContracts="request.disableContracts"
                :disableLegacyAccounts="request.disableLegacyAccounts"
                :disableBip39Accounts="request.disableBip39Accounts"
                :disableLedgerAccounts="request.disableLedgerAccounts"
                :highlightBitcoinAccounts="request.returnBtcAddress"
                @account-selected="accountSelected"
                @login="() => goToOnboarding(false)"/>

            <StatusScreen v-if="state !== State.NONE"
                :state="statusScreenState"
                :title="statusScreenTitle"
                :status="statusScreenStatus"
                :message="statusScreenMessage"
                :mainAction="statusScreenAction"
                :lightBlue="!useDarkSyncStatusScreen"
                @main-action="_statusScreenActionHandler"
            />
        </SmallPage>

        <GlobalClose />
    </div>
</template>

<script lang="ts">
import { Component } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import { SmallPage, AccountSelector } from '@nimiq/vue-components';
import BitcoinSyncBaseView from './BitcoinSyncBaseView.vue';
import StatusScreen from '../components/StatusScreen.vue';
import GlobalClose from '../components/GlobalClose.vue';
import { ChooseAddressResult, RequestType } from '../lib/PublicRequestTypes';
import { ParsedChooseAddressRequest } from '../lib/RequestTypes';
import staticStore, { Static } from '../lib/StaticStore';
import { WalletInfo } from '../lib/WalletInfo';
import { AccountInfo } from '../lib/AccountInfo';
import { ContractInfo } from '../lib/ContractInfo';
import WalletInfoCollector from '../lib/WalletInfoCollector';
import { WalletStore } from '../lib/WalletStore';
import { BtcAddressInfo } from '../lib/bitcoin/BtcAddressInfo';

@Component({components: { AccountSelector, SmallPage, StatusScreen, GlobalClose }})
export default class ChooseAddress extends BitcoinSyncBaseView {
    @Static private request!: ParsedChooseAddressRequest;

    @Getter private findWallet!: (id: string) => WalletInfo | undefined;
    @Getter private processedWallets!: WalletInfo[];

    @Mutation('setActiveAccount') private $setActiveAccount!: (payload: {
        walletId: string,
        userFriendlyAddress: string,
    }) => any;

    public async created() {
        if (this.processedWallets.length === 0) {
            this.goToOnboarding(true);
        }
    }

    private async accountSelected(walletId: string, address: string) {
        const walletInfo = this.findWallet(walletId);
        if (!walletInfo) {
            console.error('UNEXPECTED: Selected walletId not found:', walletId);
            return;
        }

        const accountOrContractInfo: AccountInfo | ContractInfo = walletInfo.accounts.get(address) ||
            walletInfo.findContractByAddress(Nimiq.Address.fromString(address))!;

        this.$setActiveAccount({
            walletId: walletInfo.id,
            userFriendlyAddress: accountOrContractInfo.userFriendlyAddress,
        });

        let btcAddress: string | undefined;

        if (this.request.returnBtcAddress && walletInfo.btcXPub) {
            this.state = this.State.SYNCING;
            // const startIndex = Math.max(Math.min(
            //     walletInfo.btcAddresses.external.findIndex((addressInfo) => !addressInfo.used),
            //     walletInfo.btcAddresses.internal.findIndex((addressInfo) => !addressInfo.used),
            // ), 0);
            let btcAddresses: {
                internal: BtcAddressInfo[];
                external: BtcAddressInfo[];
            };
            try {
                btcAddresses = await WalletInfoCollector.detectBitcoinAddresses(walletInfo.btcXPub, /* startIndex */ 0);
            } catch (error) {
                this.state = this.State.SYNCING_FAILED;
                this.error = error.message;
                return;
            }
            walletInfo.btcAddresses = btcAddresses;
            await WalletStore.Instance.put(walletInfo);
            const unusedExternalAddresses = btcAddresses.external.filter((addressInfo) => !addressInfo.used);
            if (unusedExternalAddresses.length > 0) {
                // We try to use the 7th unused address, because the first is reserved for swaps, and the next 5
                // are reserved for copying in the Wallet. This way we hope to not have double-use of an address.
                btcAddress = unusedExternalAddresses[Math.min(unusedExternalAddresses.length - 1, 6)].address;
            }
        }

        const result: ChooseAddressResult = {
            address: accountOrContractInfo.userFriendlyAddress,
            label: accountOrContractInfo.label,
            btcAddress,
        };

        this.$rpc.resolve(result);
    }

    private goToOnboarding(useReplace?: boolean) {
        // Redirect to onboarding
        staticStore.originalRouteName = RequestType.CHOOSE_ADDRESS;
        if (useReplace) {
            this.$router.replace({name: RequestType.ONBOARD});
        }
        this.$router.push({name: RequestType.ONBOARD});
    }
}
</script>

<style scoped>
    .small-page {
        position: relative;
    }

    .nq-h1 {
        margin-top: 3.5rem;
        margin-bottom: 1rem;
        line-height: 1;
        text-align: center;
    }

    .request-info {
        text-align: center;
        margin-left: 2rem;
        margin-right: 2rem;
        flex-shrink: 0;
    }

    .status-screen {
        position: absolute;
        left: 0;
        top: 0;
        right: 0;
        bottom: 0;
    }
</style>
