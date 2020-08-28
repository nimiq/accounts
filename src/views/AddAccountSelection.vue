<template>
    <div class="container">
        <SmallPage>
            <IdenticonSelector :accounts="accounts" :confirmButtonText="$t('Add to account')" @identicon-selected="identiconSelected">
                <PageHeader slot="header" backArrow @back="back">{{ $t('Choose a new Address') }}</PageHeader>
            </IdenticonSelector>

            <StatusScreen v-if="showStatusScreen"
                class="grow-from-bottom-button"
                :title="title"
                :state="state"
                lightBlue>
                <div v-if="!showLoadingSpinner" slot="loading"><!-- hide loading spinner --></div>
            </StatusScreen>
        </SmallPage>

        <button class="global-close nq-button-s" @click="close">
            <ArrowLeftSmallIcon/>
            {{ $t('Back to {appName}', { appName: request.appName }) }}
        </button>
    </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { SmallPage, PageHeader, CheckmarkIcon, ArrowLeftSmallIcon } from '@nimiq/vue-components';
import IdenticonSelector from '../components/IdenticonSelector.vue';
import { AccountInfo } from '../lib/AccountInfo';
import { State } from 'vuex-class';
import { WalletStore } from '../lib/WalletStore';
import { DerivedAddress } from '@nimiq/keyguard-client';
import { ParsedSimpleRequest } from '../lib/RequestTypes';
import { Address } from '../../client/PublicRequestTypes';
import StatusScreen from '../components/StatusScreen.vue';
import { Static } from '../lib/StaticStore';
import { ERROR_CANCELED } from '../lib/Constants';

@Component({components: {StatusScreen, SmallPage, PageHeader, IdenticonSelector, CheckmarkIcon, ArrowLeftSmallIcon}})
export default class AddAccountSelection extends Vue {
    @Static private request!: ParsedSimpleRequest;
    @State private keyguardResult!: DerivedAddress[];

    private showStatusScreen: boolean = false;
    private state: StatusScreen.State = StatusScreen.State.LOADING;
    private title: string = '';
    private showLoadingSpinner: boolean = false;

    private get accounts(): AccountInfo[] {
        return this.keyguardResult.map((address) => new AccountInfo(
            address.keyPath,
            '',
            new Nimiq.Address(address.address),
        ));
    }

    private back() {
        window.history.back();
    }

    private async identiconSelected(selectedAccount: AccountInfo) {
        this.showStatusScreen = true;

        const wallet = (await WalletStore.Instance.get(this.request.walletId))!;

        if (!selectedAccount.label) {
            selectedAccount.label = selectedAccount.defaultLabel;
        }

        wallet.accounts.set(selectedAccount.userFriendlyAddress, selectedAccount);

        // Display loading spinner only if storing takes longer than 500ms
        const showLoadingSpinnerTimeout = window.setTimeout(() => this.showLoadingSpinner = true, 500);

        await Promise.all([
            WalletStore.Instance.put(wallet),
            Vue.nextTick(), // Wait at least one paint cycle to enable animation from blue to green in StatusScreen
        ]);

        window.clearTimeout(showLoadingSpinnerTimeout);

        this.title = this.$t('New Address added to your Account.') as string;
        this.state = StatusScreen.State.SUCCESS;

        const result: Address = {
            address: selectedAccount.userFriendlyAddress,
            label: selectedAccount.label,
        };

        setTimeout(() => this.$rpc.resolve(result), StatusScreen.SUCCESS_REDIRECT_DELAY);
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
</style>
