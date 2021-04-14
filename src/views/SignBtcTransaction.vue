<script lang="ts">
import { Component } from 'vue-property-decorator';
import { SmallPage } from '@nimiq/vue-components';
import BitcoinSyncBaseView from './BitcoinSyncBaseView.vue';
import StatusScreen from '../components/StatusScreen.vue';
import GlobalClose from '../components/GlobalClose.vue';
import { RequestType } from '../lib/PublicRequestTypes';
import { ParsedSignBtcTransactionRequest } from '../lib/RequestTypes';
import { Static } from '../lib/StaticStore';
import { WalletInfo } from '../lib/WalletInfo';
import { Getter } from 'vuex-class';

// Import only types to avoid bundling of KeyguardClient in Ledger request if not required.
// (But note that currently, the KeyguardClient is still always bundled in the RpcApi).
import type {
    SignBtcTransactionRequest as KeyguardSignBtcTransactionRequest,
    BitcoinTransactionInput,
    BitcoinTransactionChangeOutput,
    BitcoinTransactionInfo as KeyguardBitcoinTransactionInfo,
} from '@nimiq/keyguard-client';

export type BitcoinTransactionInfo = Omit<KeyguardBitcoinTransactionInfo, 'changeOutput'> & {
    changeOutput?: BitcoinTransactionChangeOutput,
};

@Component({components: {StatusScreen, SmallPage, GlobalClose}}) // including components used in parent class
export default class SignBtcTransaction extends BitcoinSyncBaseView {
    @Static protected request!: ParsedSignBtcTransactionRequest;
    @Getter private findWallet!: (id: string) => WalletInfo | undefined;

    protected async created() {
        if (this.request.kind !== RequestType.SIGN_BTC_TRANSACTION) {
            if (history.length >= 3) {
                // First history entry is root, the second an original request handler invoking the transaction signing
                // and the third is this one. If there was an original request handler calling us but the intermediate
                // transaction signing request was lost on reload and instead the original request recovered from the
                // RPC state, navigate back to the original request handler.
                // TODO implementing a proper request call stack instead of the originalRouteName hack would avoid this
                history.back();
            } else {
                this.$rpc.reject(new Error(`Unexpected request ${this.request.kind}`));
            }
            return;
        }

        const walletInfo = this.findWallet(this.request.walletId)!;

        if (!walletInfo.btcXPub || !walletInfo.btcAddresses || !walletInfo.btcAddresses.external.length) {
            this.$rpc.reject(new Error(`Account does not have any Bitcoin addresses`));
            return;
        }

        const inputs: BitcoinTransactionInput[] = [];
        let changeOutput: BitcoinTransactionChangeOutput | undefined;

        try {
            // Note that the sync state will only be visible in the UI if the sync is not instant (if we actually sync)
            this.state = this.State.SYNCING;

            for (const input of this.request.inputs) {
                let keyPath: string;
                if (input.keyPath) {
                    keyPath = input.keyPath;
                } else {
                    const addressInfo = await walletInfo.findBtcAddressInfo(input.address);
                    if (!addressInfo) {
                        this.$rpc.reject(new Error(`Input address not found: ${input.address}`));
                        return;
                    }
                    keyPath = addressInfo.path;
                }

                inputs.push({
                    keyPath,
                    transactionHash: input.transactionHash,
                    outputIndex: input.outputIndex,
                    outputScript: input.outputScript,
                    witnessScript: input.witnessScript,
                    value: input.value,
                    sequence: input.sequence,
                });
            }

            if (this.request.changeOutput) {
                const addressInfo = await walletInfo.findBtcAddressInfo(this.request.changeOutput.address);
                if (!addressInfo) {
                    this.$rpc.reject(new Error(`Change address not found: ${this.request.changeOutput.address}`));
                    return;
                }

                changeOutput = {
                    keyPath: addressInfo.path,
                    address: addressInfo.address,
                    value: this.request.changeOutput.value,
                };
            }

            this.state = this.State.NONE;
        } catch (e) {
            this.state = this.State.SYNCING_FAILED;
            this.error = e.message || e;
            return;
        }

        this._signBtcTransaction({
            inputs,
            changeOutput,
            recipientOutput: this.request.output,
            locktime: this.request.locktime,
        }, walletInfo);
    }

    protected _signBtcTransaction(transactionInfo: BitcoinTransactionInfo, walletInfo: WalletInfo) {
        // note that this method gets overwritten for SignBtcTransactionLedger

        const request: KeyguardSignBtcTransactionRequest = {
            layout: 'standard',
            appName: this.request.appName,

            ...transactionInfo,

            keyId: walletInfo.keyId,
            keyLabel: walletInfo.labelForKeyguard,

            // flags: this.request.flags,
        };

        // staticStore.keyguardRequest = request; // Currently not used in SignBtcTransactionSuccess

        const client = this.$rpc.createKeyguardClient(true);
        client.signBtcTransaction(request);
    }
}
</script>
