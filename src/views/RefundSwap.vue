<script lang="ts">
import { Component } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { SmallPage } from '@nimiq/vue-components';
import BitcoinSyncBaseView from './BitcoinSyncBaseView.vue';
import { BitcoinTransactionInputType } from '@nimiq/keyguard-client';
import StatusScreen from '../components/StatusScreen.vue';
import GlobalClose from '../components/GlobalClose.vue';
import { RequestType } from '../lib/PublicRequestTypes';
import {
    ParsedRefundSwapRequest,
    ParsedSignTransactionRequest,
    ParsedSignBtcTransactionRequest,
} from '../lib/RequestTypes';
import { Static } from '../lib/StaticStore';
import { WalletInfo } from '../lib/WalletInfo';
import { SwapAsset } from '@nimiq/fastspot-api';

// Import only types to avoid bundling of KeyguardClient in Ledger request if not required.
// (But note that currently, the KeyguardClient is still always bundled in the RpcApi).
type KeyguardSignNimTransactionRequest = import('@nimiq/keyguard-client').SignTransactionRequest;
type KeyguardSignBtcTransactionRequest = import('@nimiq/keyguard-client').SignBtcTransactionRequest;

@Component({components: {StatusScreen, SmallPage, GlobalClose}}) // including components used in parent class
export default class RefundSwap extends BitcoinSyncBaseView {
    // Can be ParsedSignTransactionRequest or ParsedSignBtcTransactionRequest in RefundSwapLedger after returning from
    // signing via a ParsedSignTransactionRequest or ParsedSignBtcTransactionRequest.
    @Static protected request!: ParsedRefundSwapRequest | ParsedSignTransactionRequest
        | ParsedSignBtcTransactionRequest;
    @Getter private findWallet!: (id: string) => WalletInfo | undefined;

    protected async created() {
        if (this.request.kind !== RequestType.REFUND_SWAP) {
            // can happen for RefundSwapLedger and is handled there
            return;
        }

        const request = this.request as ParsedRefundSwapRequest;

        const refundInfo = request.refund;
        const account = this.findWallet(request.walletId)!; // existence checked in RpcApi

        if (refundInfo.type === SwapAsset.NIM) {
            const { sender, recipient, value, fee, extraData: data, validityStartHeight } = refundInfo;
            const signer = account.findSignerForAddress(recipient);

            if (!signer) {
                this.$rpc.reject(new Error(`Unknown recipient ${refundInfo.recipient}`));
                return;
            }

            const signRequest: KeyguardSignNimTransactionRequest = {
                appName: request.appName,

                keyId: account.keyId,
                keyLabel: account.labelForKeyguard,

                keyPath: signer.path,
                sender: sender.serialize(), // HTLC address
                senderType: Nimiq.Account.Type.HTLC,
                senderLabel: 'Swap HTLC',
                // My address, must be refund address of HTLC. Send to signer as recipient might be a contract.
                recipient: signer.address.serialize(),
                recipientLabel: signer.label,
                value, // Luna
                fee, // Luna
                data,
                validityStartHeight,
            };

            this._signTransaction(signRequest);
        }

        if (refundInfo.type === SwapAsset.BTC) {
            let signerKeyPath: string;
            try {
                // Note that the sync state will only be visible in UI if the sync is not instant (if we actually sync)
                this.state = this.State.SYNCING;

                let didDeriveAddresses = false;
                let addressInfo = account.findBtcAddressInfo(refundInfo.refundAddress);
                if (addressInfo instanceof Promise) {
                    didDeriveAddresses = true;
                    addressInfo = await addressInfo;
                }
                if (!addressInfo) {
                    this.$rpc.reject(new Error(`Refund address not found: ${refundInfo.refundAddress}`));
                    return;
                }
                signerKeyPath = addressInfo.path;

                if (!await account.findBtcAddressInfo(refundInfo.output.address, !didDeriveAddresses)) {
                    this.$rpc.reject(new Error(`Output address not found: ${refundInfo.output.address}`));
                    return;
                }

                this.state = this.State.NONE;
            } catch (e) {
                this.state = this.State.SYNCING_FAILED;
                this.error = e.message || e;
                return;
            }

            const signRequest: KeyguardSignBtcTransactionRequest = {
                appName: request.appName,

                keyId: account.keyId,
                keyLabel: account.labelForKeyguard,

                inputs: [{
                    ...refundInfo.input,
                    keyPath: signerKeyPath,
                    type: BitcoinTransactionInputType.HTLC_REFUND,
                }],
                recipientOutput: {
                    ...refundInfo.output,
                    label: account.label,
                },
            };

            this._signTransaction(signRequest);
        }
    }

    protected _signTransaction(request: KeyguardSignNimTransactionRequest | KeyguardSignBtcTransactionRequest) {
        // Note that this method gets overwritten in RefundSwapLedger
        const client = this.$rpc.createKeyguardClient(true);
        if ('sender' in request) {
            // Nimiq request
            client.signTransaction(request);
        } else {
            // Bitcoin request
            client.signBtcTransaction(request);
        }
    }
}
</script>
