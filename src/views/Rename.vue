<template>
    <div class="container">
        <SmallPage class="rename">
            <PageHeader>{{ $t('Rename Account') }}</PageHeader>
            <PageBody v-if="wallet">
                <div class="wallet-label" v-if="wallet.type !== 1 /* LEGACY */">
                    <AccountRing :addresses="addressesArray"/>
                    <Input :value="wallet.label" @changed="onWalletLabelChange" :placeholder="wallet.defaultLabel" ref="wallet"/>
                </div>

                <AccountList ref="accountList"
                             :walletId="wallet.id"
                             :accounts="accountsAndContractsArray"
                             :editable="true"
                             @account-changed="accountChanged"/>
            </PageBody>
            <PageFooter>
                <button class="nq-button light-blue" @click="storeLabels">{{ $t('Save') }}</button>
            </PageFooter>
            <StatusScreen v-if="labelsStored"
                    state="success"
                    :title="$t('All labels saved.')"
                    class="grow-from-bottom-button" />
        </SmallPage>

        <GlobalClose :hidden="labelsStored"/>
    </div>
</template>

<script lang="ts">
    import { Component, Vue } from 'vue-property-decorator';
    import { AccountRing, AccountList, SmallPage, PageHeader, PageBody, PageFooter } from '@nimiq/vue-components';
    import Input from '../components/Input.vue';
    import { ParsedRenameRequest } from '../lib/RequestTypes';
    import { Account } from '../lib/PublicRequestTypes';
    import StatusScreen from '../components/StatusScreen.vue';
    import GlobalClose from '../components/GlobalClose.vue';
    import { WalletInfo } from '../lib/WalletInfo';
    import { WalletType } from '../lib/Constants';
    import { WalletStore } from '@/lib/WalletStore';
    import { Static } from '../lib/StaticStore';

    /*
        In Case some sort auf Authentication with the wallet is desireable, there are 2 options:
            1.  is to have the user enter the password at the very beginning. This would require the Hub to
                first redirect to the Keyguard. After returning and validating (sign message) this component would come
                into view.
            2.  is to have the user enter his Password as confirmation of the changes (sign message and validate). That
                would move the storeLabels function into a RenameSuccess Component where the store and return happens.
    */

    @Component({components: {
            AccountRing,
            AccountList,
            SmallPage,
            PageHeader,
            PageBody,
            PageFooter,
            Input,
            StatusScreen,
            GlobalClose,
        }})
    export default class Rename extends Vue {
        @Static private request!: ParsedRenameRequest;

        private wallet: WalletInfo | null = null;
        private labelsStored: boolean = false;

        private async mounted() {
            this.wallet = (await WalletStore.Instance.get(this.request.walletId))!;

            // Wait for the next tick to update the DOM, then focus the correct label
            Vue.nextTick(this.focusElement);
        }

        private focusElement() {
            if (this.request.address) { // Account with address this.request.address was selected
                const el = (this.$refs.accountList as AccountList);
                el.focus(this.request.address);
            } else { // A wallet was selected
                if (this.wallet!.type !== WalletType.LEGACY) {
                    const el = (this.$refs.wallet as Input);
                    el.focus();
                }
            }
        }

        private get accountsAndContractsArray() {
            if (!this.wallet) return [];
            return [
                ...this.wallet.accounts.values(),
                ...this.wallet.contracts,
            ];
        }

        private get addressesArray() {
            return this.accountsAndContractsArray.map((acc) => acc.userFriendlyAddress);
        }

        private accountChanged(address: string, label: string) {
            const addressInfo = this.wallet!.accounts.get(address);
            if (addressInfo) {
                addressInfo.label = label || addressInfo.defaultLabel;
                this.wallet!.accounts.set(address, addressInfo);
                return;
            }
            const contractInfo = this.wallet!.findContractByAddress(Nimiq.Address.fromString(address));
            if (contractInfo) {
                contractInfo.label = label || contractInfo.defaultLabel;
                this.wallet!.setContract(contractInfo);
                return;
            }

            throw new Error('UNEXPECTED: Address that was changed does not exist');
        }

        private onWalletLabelChange(label: string) {
            this.wallet!.label = label || this.wallet!.defaultLabel;
        }

        private storeLabels() {
            WalletStore.Instance.put(this.wallet!);
            this.labelsStored = true;

            setTimeout(() => this.done(), StatusScreen.SUCCESS_REDIRECT_DELAY);
        }

        private async done() {
            const result: Account = await this.wallet!.toAccountType();
            this.$rpc.resolve(result);
        }
    }
</script>

<style scoped>
    .rename {
        position: relative;
    }

    .page-body {
        padding: 0;
    }

    .wallet-icon {
        width: 3rem;
        height: 3rem;
        margin-right: 1rem;
    }

    .wallet-label {
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
        font-size: 2.25rem;
        line-height: 2.5rem;
        font-weight: 500;
        margin: 0 3rem;
        padding: 2rem 1rem;
    }

    >>> .label-input {
        font-weight: 600;
    }

    .wallet-label .label-input {
        font-weight: bold;
        font-size: 2.5rem;
    }

    >>> .label-input input {
        padding: .5rem 0 .5rem 1rem;
    }

    >>> .label-input .width-finder {
        padding: 0 1.25rem; /* input padding + border-width */
    }

    >>> .amount {
        display: none; /* Hide balances in list, as they may be terribly out-of-date */
    }

    .account-ring {
        margin-right: 2rem;
        flex-shrink: 0;
    }

    .status-screen {
        white-space: nowrap;
    }
</style>
