<template>
    <div class="container">
        <SmallPage class="add-vesting-contract">
            <PageHeader>{{ $t('Add Vesting Contract') }}</PageHeader>
            <PageBody>
                <AddressInput @address="checkContract"/>

                <div class="info-box">
                    <template v-if="!hasConsensus">
                        <div class="flex-row">
                            <CircleSpinner/> {{ $t('Syncing consensus...') }}
                        </div>
                    </template>
                    <template v-else-if="checkingContract">
                        <div class="flex-row">
                            <CircleSpinner/> {{ $t('Fetching contract information...') }}
                        </div>
                    </template>
                    <template v-else-if="contract">
                        <h2 class="nq-h2">{{ $t('Contract Information') }}</h2>
                        <div class="row">
                            <strong>{{ $t('Owner:') }}</strong>
                            <span class="address" :class="{'nq-green': !!wallet, 'nq-red': !wallet}">
                                {{ contract.owner.toUserFriendlyAddress() }}
                            </span>
                        </div>
                        <div class="row">
                            <strong>{{ $t('Balance:') }}</strong>
                            <Amount :amount="contract.balance" :minDecimals="0"/>
                        </div>
                        <div class="row">
                            <strong>{{ $t('Start Block:') }}</strong>
                            <span>{{ contract.start }}</span>
                        </div>
                        <div class="row">
                            <strong>{{ $t('Blocks/Step:') }}</strong>
                            <span>{{ contract.stepBlocks }}</span>
                        </div>
                        <div class="row">
                            <strong>{{ $t('Amount/Step:') }}</strong>
                            <Amount :amount="contract.stepAmount" :minDecimals="0"/>
                        </div>
                    </template>
                    <template v-else>
                        {{ $t('Enter the address of a vesting contract.') }}
                    </template>
                </div>
            </PageBody>
            <PageFooter>
                <button class="nq-button light-blue" :disabled="!canStore" @click="storeContract">
                    {{ $t('Add contract') }}
                </button>
            </PageFooter>
            <StatusScreen v-if="contractStored"
                state="success"
                :title="$t('Contract added.')"
                class="grow-from-bottom-button" />
        </SmallPage>

        <GlobalClose :hidden="contractStored"/>

        <Network ref="$network"/>
    </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import {
    SmallPage,
    PageHeader,
    PageBody,
    PageFooter,
    AddressInput,
    CircleSpinner,
    Amount,
} from '@nimiq/vue-components';
import { NetworkClient } from '@nimiq/network-client';
import StatusScreen from '../components/StatusScreen.vue';
import GlobalClose from '../components/GlobalClose.vue';
import Network from '../components/Network.vue';
import { WalletInfo } from '../lib/WalletInfo';
import { WalletStore } from '../lib/WalletStore';
import { VestingContractInfo } from '../lib/ContractInfo';

@Component({components: {
        SmallPage,
        PageHeader,
        PageBody,
        AddressInput,
        CircleSpinner,
        Amount,
        PageFooter,
        StatusScreen,
        GlobalClose,
        Network,
    }})
export default class AddVestingContract extends Vue {
    @Getter private findWalletByAddress!: (address: string, includeContracts: boolean) => WalletInfo | undefined;

    private hasConsensus = false;
    private checkingContract = false;
    private wallet: WalletInfo | null = null;
    private contract: VestingContractInfo | null = null;

    private contractStored: boolean = false;

    private async mounted() {
        const client = await (this.$refs.$network as Network).getNetworkClient();
        client.on(NetworkClient.Events.CONSENSUS, (state) => {
            this.hasConsensus = state === 'established';
        });
    }

    private async checkContract(address: string) {
        this.checkingContract = true;

        const client = await (this.$refs.$network as Network).getNetworkClient();
        const account = (await client.getAccounts(address))[0] as any as {
            type: string,
            balance: number,
            owner: string,
            vestingStart: number,
            vestingStepAmount: number,
            vestingStepBlocks: number,
            vestingTotalAmount: number,
        };

        if (account.type !== 'vesting') {
            this.contract = null;
            this.wallet = null;
            this.checkingContract = false;
            return;
        }

        this.contract = new VestingContractInfo(
            this.$t('Vesting Contract') as string,
            Nimiq.Address.fromUserFriendlyAddress(address),
            Nimiq.Address.fromUserFriendlyAddress(account.owner),
            account.vestingStart,
            account.vestingStepAmount,
            account.vestingStepBlocks,
            account.vestingTotalAmount,
            account.balance,
        );

        this.wallet = this.findWalletByAddress(account.owner, false) || null;

        this.checkingContract = false;
    }

    private get canStore() {
        return !this.checkingContract && this.wallet && this.contract;
    }

    private async storeContract() {
        if (!this.wallet || !this.contract) return;

        const hasContractAlready = this.wallet.contracts
            .some((contract) => contract.address.equals(this.contract!.address));

        if (!hasContractAlready) {
            this.wallet.contracts.push(this.contract);
            await WalletStore.Instance.put(this.wallet);
        }

        this.contractStored = true;
        setTimeout(() => this.done(), StatusScreen.SUCCESS_REDIRECT_DELAY);
    }

    private async done() {
        const result = await this.wallet!.toAccountType();
        this.$rpc.resolve(result);
    }
}
</script>

<style scoped>
.add-vesting-contract {
    position: relative;
}

.page-body {
    padding-bottom: 2rem;
}

.address-input {
    margin: 0 auto;
}

.flex-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
}

>>> .circle-spinner {
    margin-right: 1rem;
}

.info-box {
    background: rgba(5, 130, 202, 0.1);
    padding: 2rem;
    border-radius: 1rem;
    margin-top: 3rem;
    text-align: center;
    font-size: 2rem;
    font-weight: 600;
    color: var(--nimiq-light-blue);
}

.info-box > *:first-child {
    margin-top: 0;
}

.info-box .row {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    text-align: left;
    line-height: 1.5;
}

.info-box .row > *:first-child {
    margin-right: 1rem;
}

.info-box .row > *:last-child {
    text-align: right;
    font-weight: normal;
}

.address {
    font-family: 'Fira Mono', monospace;
    font-size: 1.75rem;
    word-spacing: -0.2em;
    font-weight: 600 !important;
    overflow: hidden;
    white-space: nowrap;
    mask-image: linear-gradient(90deg, rgba(255,255,255, 1), rgba(255,255,255,1) calc(100% - 4rem), rgba(255,255,255,0));
}

.status-screen {
    white-space: nowrap;
}
</style>
