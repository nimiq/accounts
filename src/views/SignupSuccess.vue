<template>
    <div class="container pad-bottom">
        <SmallPage>
            <StatusScreen :title="title" :state="state" :lightBlue="true"/>
        </SmallPage>
    </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { SmallPage, CheckmarkIcon } from '@nimiq/vue-components';
import { AccountInfo } from '../lib/AccountInfo';
import { WalletInfo } from '../lib/WalletInfo';
import { WalletType } from '../lib/Constants';
import { State, Action } from 'vuex-class';
import { WalletStore } from '@/lib/WalletStore';
import { Account } from '../lib/PublicRequestTypes';
import StatusScreen from '@/components/StatusScreen.vue';
import KeyguardClient from '@nimiq/keyguard-client';
import { labelAddress, labelKeyguardAccount } from '@/lib/LabelingMachine';
import { i18n } from '../i18n/i18n-setup';
import { deriveAddressesFromXPub } from '../lib/bitcoin/BitcoinUtils';
import { loadBitcoinJS } from '../lib/bitcoin/BitcoinJSLoader';
import { INTERNAL_INDEX, EXTERNAL_INDEX, BTC_ACCOUNT_MAX_ALLOWED_ADDRESS_GAP } from '../lib/bitcoin/BitcoinConstants';

@Component({components: {SmallPage, StatusScreen, CheckmarkIcon}})
export default class SignupSuccess extends Vue {
    @State private keyguardResult!: KeyguardClient.KeyResult;

    @Action('addWalletAndSetActive') private $addWalletAndSetActive!: (walletInfo: WalletInfo) => any;

    private title: string = i18n.t('Creating your Account') as string;
    private state: StatusScreen.State = StatusScreen.State.LOADING;

    private async mounted() {
        const walletType = WalletType.BIP39;

        const createdAddress = new Nimiq.Address(this.keyguardResult[0].addresses[0].address);

        const userFriendlyAddress = createdAddress.toUserFriendlyAddress();
        const walletLabel = labelKeyguardAccount(userFriendlyAddress);
        const accountLabel = labelAddress(userFriendlyAddress);

        const accountInfo = new AccountInfo(
            this.keyguardResult[0].addresses[0].keyPath,
            accountLabel,
            createdAddress!,
        );

        // Derive initial BTC addresses
        await loadBitcoinJS();
        const bitcoinXPub = this.keyguardResult[0].bitcoinXPub;
        const btcAddresses = bitcoinXPub
            ? {
                internal:
                    deriveAddressesFromXPub(bitcoinXPub, [INTERNAL_INDEX], 0, BTC_ACCOUNT_MAX_ALLOWED_ADDRESS_GAP),
                external:
                    deriveAddressesFromXPub(bitcoinXPub, [EXTERNAL_INDEX], 0, BTC_ACCOUNT_MAX_ALLOWED_ADDRESS_GAP),
            }
            : {
                internal: [],
                external: [],
            };

        const walletInfo = new WalletInfo(
            await WalletStore.Instance.deriveId(this.keyguardResult[0].keyId),
            this.keyguardResult[0].keyId,
            walletLabel,
            new Map<string, AccountInfo>().set(userFriendlyAddress, accountInfo),
            [],
            walletType,
            false, // keyMissing
            this.keyguardResult[0].fileExported,
            this.keyguardResult[0].wordsExported,
            this.keyguardResult[0].bitcoinXPub,
            btcAddresses,
        );

        await WalletStore.Instance.put(walletInfo);

        // Add wallet to vuex
        this.$addWalletAndSetActive(walletInfo);

        // Artificially delay, to display loading status
        await new Promise((res) => setTimeout(res, 2000));

        this.title = this.$t('Welcome to the\nNimiq Blockchain.') as string;
        this.state = StatusScreen.State.SUCCESS;

        const result: Account[] = [await walletInfo.toAccountType()];
        setTimeout(() => this.$rpc.resolve(result), StatusScreen.SUCCESS_REDIRECT_DELAY);
    }
}
</script>
