<script lang="ts">
import { Component } from 'vue-property-decorator';
import { State, Getter } from 'vuex-class';
import KeyguardClient from '@nimiq/keyguard-client';
import { SmallPage } from '@nimiq/vue-components';
import BitcoinSyncBaseView from './BitcoinSyncBaseView.vue';
import { ParsedSimpleRequest } from '../lib/RequestTypes';
import { WalletType } from '../lib/Constants';
import { WalletInfo } from '../lib/WalletInfo';
import { WalletStore } from '../lib/WalletStore';
import { Static } from '../lib/StaticStore';
import StatusScreen from '../components/StatusScreen.vue';
import GlobalClose from '../components/GlobalClose.vue';
import { deriveAddressesFromXPub } from '../lib/bitcoin/BitcoinUtils';
import { BTC_ACCOUNT_MAX_ALLOWED_ADDRESS_GAP, EXTERNAL_INDEX, INTERNAL_INDEX } from '../lib/bitcoin/BitcoinConstants';
import { loadBitcoinJS } from '../lib/bitcoin/BitcoinJSLoader';

@Component({components: {StatusScreen, SmallPage, GlobalClose}}) // including components used in parent class
export default class ActivateBitcoinSuccess extends BitcoinSyncBaseView {
    protected get State() {
        return {
            ...super.State,
            TRANSITION_SYNCING: 'transition-syncing', // transition ui from ActivateBitcoinLedger into SYNCING state
            FINISHED: 'finished',
        };
    }

    @Static private request!: ParsedSimpleRequest;
    @State private keyguardResult!: KeyguardClient.DeriveBtcXPubResult;
    @Getter private findWallet!: (id: string) => WalletInfo | undefined;

    private async created() {
        const walletInfo = this.findWallet(this.request.walletId);

        if (!walletInfo) {
            throw new Error(`UNEXPECTED: accountId not found anymore in ActivateBitcoinSuccess (${this.request.walletId})`);
        }

        this.state = walletInfo.type === WalletType.LEDGER
            ? this.State.TRANSITION_SYNCING // set ui state from which to transition to SYNCING state
            : this.State.SYNCING;
        this.useDarkSyncStatusScreen = walletInfo.type === WalletType.LEDGER;

        await loadBitcoinJS();

        const btcAddresses = {
            external: deriveAddressesFromXPub(
                this.keyguardResult.bitcoinXPub,
                [EXTERNAL_INDEX],
                0,
                BTC_ACCOUNT_MAX_ALLOWED_ADDRESS_GAP,
            ),
            internal: deriveAddressesFromXPub(
                this.keyguardResult.bitcoinXPub,
                [INTERNAL_INDEX],
                0,
                BTC_ACCOUNT_MAX_ALLOWED_ADDRESS_GAP,
            ),
        };

        walletInfo.btcXPub = this.keyguardResult.bitcoinXPub;
        walletInfo.btcAddresses = btcAddresses;

        WalletStore.Instance.put(walletInfo);

        const result = await walletInfo.toAccountType();

        this.state = this.State.FINISHED;
        setTimeout(() => { this.$rpc.resolve(result); }, StatusScreen.SUCCESS_REDIRECT_DELAY);
    }

    private mounted() {
        if (this.state !== this.State.TRANSITION_SYNCING) return;
        // For Ledger transition UI after first rendering a state that replicates ActivateBitcoinLedger for a smooth
        // transition between the two views.
        requestAnimationFrame(() => this.state = this.State.SYNCING);
    }

    protected get statusScreenState(): StatusScreen.State {
        if (this.state === this.State.FINISHED) return StatusScreen.State.SUCCESS;
        return super.statusScreenState;
    }

    protected get statusScreenTitle() {
        switch (this.state) {
            case this.State.TRANSITION_SYNCING:
                return this.$t('Fetching your Addresses') as string;
            case this.State.FINISHED:
                return this.$t('Bitcoin activated') as string;
            default:
                return super.statusScreenTitle;
        }
    }

    protected get isGlobalCloseShown() {
        return this.state === this.State.TRANSITION_SYNCING || super.isGlobalCloseShown;
    }

    // Note: not overwriting statusScreenStatus as we can stick to the default behavior which returns '' for
    // TRANSITION_SYNCING such that the status animates in on change to SYNCING.
}
</script>
