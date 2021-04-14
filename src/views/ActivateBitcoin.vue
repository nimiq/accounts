<template>
    <NotEnoughCookieSpace v-if='notEnoughCookieSpace'/>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { BrowserDetection } from '@nimiq/utils';
import { ParsedSimpleRequest } from '../lib/RequestTypes';
import { Static } from '../lib/StaticStore';
import CookieHelper from '../lib/CookieHelper';
import NotEnoughCookieSpace from '../components/NotEnoughCookieSpace.vue';
import { BTC_ACCOUNT_KEY_PATH } from '../lib/bitcoin/BitcoinConstants';
import { WalletInfo } from '../lib/WalletInfo';
import { WalletType } from '../lib/Constants';
import Config from 'config';

// Import only types to avoid bundling of KeyguardClient in Ledger request if not required.
// (But note that currently, the KeyguardClient is still always bundled in the RpcApi).
import type { DeriveBtcXPubRequest as KeyguardDeriveBtcXPubRequest } from '@nimiq/keyguard-client';

@Component({components: {NotEnoughCookieSpace}})
export default class ActivateBitcoin extends Vue {
    @Static private request!: ParsedSimpleRequest;
    @Getter private findWallet!: (id: string) => WalletInfo | undefined;

    private notEnoughCookieSpace = false;

    public async created() {
        const walletInfo = this.findWallet(this.request.walletId)!;

        if (walletInfo.type === WalletType.LEGACY) {
            throw new Error('Cannot enable Bitcoin for legacy accounts');
        }

        if (BrowserDetection.isIOS() || BrowserDetection.isSafari()) {
            // Dummy xpub, to test space in cookie
            const walletInfoEntry = {
                ...walletInfo.toObject(),
                btcXPub: 'xpub6H1LXWLaKsWFhvm6RVpEL9P4KfRZSW7abD2ttkWP3SSQvnyA8FSVqNTEcYFgJS2UaFcxupHiYkro49S8yGasTvXEYBVPamhGW6cFJodrTHy',
            };

            this.notEnoughCookieSpace = !(await CookieHelper.canFitNewWallets([walletInfoEntry]));
            if (this.notEnoughCookieSpace) return;
        }

        this._startBtcXpubRequest(walletInfo.keyId);
    }

    protected _startBtcXpubRequest(keyId: string) {
        // note that this method gets overwritten for ActivateBitcoinLedger
        const keyguardRequest: KeyguardDeriveBtcXPubRequest = {
            appName: this.request.appName,
            keyId,
            bitcoinXPubPath: BTC_ACCOUNT_KEY_PATH[Config.bitcoinAddressType][Config.bitcoinNetwork],
        };

        const client = this.$rpc.createKeyguardClient(true);
        client.deriveBtcXPub(keyguardRequest);
    }
}
</script>
