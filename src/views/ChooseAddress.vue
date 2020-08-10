<template>
    <div class="container">
       <SmallPage>
            <h1 class="nq-h1">{{ $t('Choose an Address') }}</h1>

            <div class="request-info nq-text">
                {{ $t('{appName} is asking for an address to use.', { appName: request.appName }) }}
            </div>

            <AccountSelector
                :wallets="processedWallets"
                @account-selected="accountSelected"
                @login="() => goToOnboarding(false)"/>

        </SmallPage>

        <button class="global-close nq-button-s" @click="close">
            <ArrowLeftSmallIcon/>
            {{ $t('Back to {appName}', { appName: request.appName}) }}
        </button>
    </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import { SmallPage, AccountSelector, ArrowLeftSmallIcon } from '@nimiq/vue-components';
import { SimpleRequest, Account, Address, RequestType } from '../../client/PublicRequestTypes';
import staticStore, { Static } from '@/lib/StaticStore';
import { WalletStore } from '@/lib/WalletStore';
import { WalletInfo } from '../lib/WalletInfo';
import { ERROR_CANCELED } from '../lib/Constants';
import { AccountInfo } from '../lib/AccountInfo';
import { ContractInfo } from '../lib/ContractInfo';

@Component({components: { AccountSelector, SmallPage, ArrowLeftSmallIcon }})
export default class ChooseAddress extends Vue {
    @Static private request!: SimpleRequest;

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

    private accountSelected(walletId: string, address: string) {
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

        const result: Address = {
            address: accountOrContractInfo.userFriendlyAddress,
            label: accountOrContractInfo.label,
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

    private close() {
        this.$rpc.reject(new Error(ERROR_CANCELED));
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
</style>
