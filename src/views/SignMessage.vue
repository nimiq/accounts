<template>
    <div v-if="showAccountSelector" class="container">
        <SmallPage>
            <div class="info-line">
                <span class="request-title">{{ $t('Sign Message') }}</span>
                <div class="arrow-runway">
                    <ArrowRightIcon/>
                </div>
                <span class="origin">{{ originDomain }}</span>
            </div>

            <h1 class="nq-h1">{{ $t('Choose an Address to sign') }}</h1>

            <AccountSelector
                :wallets="processedWallets"
                disableContracts
                disableLedgerAccounts
                @account-selected="setAccount"
                @login="() => goToOnboarding(false)"/>
        </SmallPage>

        <button class="global-close nq-button-s" @click="close">
            <ArrowLeftSmallIcon/>
            {{ $t('Back to {appName}', { appName: request.appName }) }}
        </button>
    </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import { SmallPage, AccountSelector, ArrowRightIcon, ArrowLeftSmallIcon } from '@nimiq/vue-components';
import { ParsedSignMessageRequest } from '../lib/RequestTypes';
import { RequestType, Account } from '../../client/PublicRequestTypes';
import staticStore, { Static } from '../lib/StaticStore';
import { WalletStore } from '@/lib/WalletStore';
import { AccountInfo } from '@/lib/AccountInfo';
import { WalletInfo } from '@/lib/WalletInfo';
import KeyguardClient from '@nimiq/keyguard-client';
import { ERROR_CANCELED } from '@/lib/Constants';
import { State as RpcState } from '@nimiq/rpc';
import { WalletType } from '../lib/WalletInfo';

@Component({components: {SmallPage, AccountSelector, ArrowRightIcon, ArrowLeftSmallIcon}})
export default class SignMessage extends Vue {
    @Static protected request!: ParsedSignMessageRequest;
    @Static private rpcState!: RpcState;

    @Getter private processedWallets!: WalletInfo[];
    @Getter private findWallet!: (id: string) => WalletInfo | undefined;
    @Getter private findWalletByAddress!: (address: string, includeContracts: boolean) => WalletInfo | undefined;

    @Mutation('setActiveAccount') private $setActiveAccount!: (payload: {
        walletId: string,
        userFriendlyAddress: string,
    }) => any;

    private showAccountSelector = false;

    private async created() {
        if (this.request.signer) {
            const wallet = this.findWalletByAddress(this.request.signer.toUserFriendlyAddress(), false);
            if (wallet && wallet.type !== WalletType.LEDGER) {
                this.setAccount(wallet.id, this.request.signer.toUserFriendlyAddress(), true);
                return;
            }
        }

        // If account not specified / found or is an unsupported Ledger account let the user pick another account.
        // Don't automatically reject to not directly leak the information whether an account exists / is a Ledger.
        this.showAccountSelector = true;
    }

    private async setAccount(walletId: string, address: string, isFromRequest = false) {
        const walletInfo = this.findWallet(walletId);
        if (!walletInfo) {
            // We can also return an error here and when checking the address below,
            // but it would enable malicous sites to query for stored walletIds and addresses.
            // Instead we quietly ignore any unavailable pre-set walletId and address and give
            // the user the option to chose as if it was not pre-set.
            this.showAccountSelector = true;
            if (!isFromRequest) throw new Error(`UNEXPECTED: Selected walletId not found: ${walletId}`);
            return;
        }

        const accountInfo = walletInfo.accounts.get(address);
        if (!accountInfo) {
            this.showAccountSelector = true;
            if (!isFromRequest) throw new Error(`UNEXPECTED: Selected account not found: ${address}`);
            return;
        }

        if (this.showAccountSelector) {
            // set active account if user selected the account himself
            this.$setActiveAccount({
                walletId: walletInfo.id,
                userFriendlyAddress: accountInfo.userFriendlyAddress,
            });
        }

        // Forward to Keyguard
        const request: KeyguardClient.SignMessageRequest = {
            appName: this.request.appName,

            keyId: walletInfo.keyId,
            keyPath: accountInfo.path,

            message: this.request.message,

            signer: accountInfo.address.serialize(),
            signerLabel: accountInfo.label,
        };

        staticStore.keyguardRequest = request;

        const client = this.$rpc.createKeyguardClient(isFromRequest);
        client.signMessage(request);
    }

    private goToOnboarding(useReplace?: boolean) {
        // Redirect to onboarding
        staticStore.originalRouteName = RequestType.SIGN_MESSAGE;
        if (useReplace) {
            this.$router.replace({name: RequestType.ONBOARD});
        } else {
            this.$router.push({name: RequestType.ONBOARD});
        }
    }

    private close() {
        this.$rpc.reject(new Error(ERROR_CANCELED));
    }

    private get originDomain() {
        return this.rpcState.origin.split('://')[1];
    }
}
</script>

<style scoped>
    .info-line {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        box-sizing: border-box;
        margin: 2.5rem 2.5rem 1rem 2.5rem;
        flex-shrink: 0;
        font-size: 2rem;
        line-height: 1.5;
        font-weight: normal;
    }

    .request-title {
        font-weight: bold;
        color: var(--nimiq-light-blue);
    }

    .arrow-runway {
        flex-grow: 1;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }

    .arrow-runway .nq-icon {
        opacity: 0;
        font-size: 2rem;
        animation: arrow-shooting 2s ease-in-out infinite;
        /* opacity: 0.3;     */
    }

    @keyframes arrow-shooting {
        from { transform: translateX(-2rem); }
        10% { opacity: 0; }
        50% { opacity: 0.3; }
        90% { opacity: 0; }
        to { transform: translateX(2rem); }
    }

    .nq-h1 {
        margin-top: 3.5rem;
        margin-bottom: 1rem;
        line-height: 1;
        text-align: center;
    }
</style>
