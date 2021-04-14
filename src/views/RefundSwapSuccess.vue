<template>
    <Network ref="network" :visible="false"/>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { State } from 'vuex-class';
import Network from '../components/Network.vue';
import { SignedBtcTransaction, SignedTransaction } from '../lib/PublicRequestTypes';
import { Static } from '../lib/StaticStore';
import KeyguardClient from '@nimiq/keyguard-client';
import { SwapAsset } from '@nimiq/fastspot-api';
import { ParsedRefundSwapRequest } from '@/lib/RequestTypes';

@Component({components: {Network}})
export default class SignBtcTransactionSuccess extends Vue {
    @Static private request!: ParsedRefundSwapRequest;
    @State private keyguardResult!: KeyguardClient.SignedBitcoinTransaction | KeyguardClient.SignatureResult;

    private async mounted() {
        if ('signature' in this.keyguardResult && this.request.refund.type === SwapAsset.NIM) {
            const tx = await (this.$refs.network as Network).createTx(Object.assign({
                signerPubKey: this.keyguardResult.publicKey,
            }, this.keyguardResult, this.request.refund, {
                senderType: Nimiq.Account.Type.HTLC,
            }));

            const proof = new Nimiq.SerialBuffer(1 + Nimiq.SignatureProof.SINGLE_SIG_SIZE);
            // FIXME: Use constant when HTLC is part of CoreJS web-offline build
            proof.writeUint8(3 /* Nimiq.HashedTimeLockedContract.ProofType.TIMEOUT_RESOLVE */);
            proof.write(new Nimiq.SerialBuffer(tx.proof)); // Current tx.proof is a regular SignatureProof
            tx.proof = proof;

            // FIXME: Enable validation when HTLC is part of CoreJS web-offline build
            // The signature check below can then be removed
            // // Validate that transaction is valid
            // if (!tx.verify()) {
            //     this.$rpc.reject(new Error('NIM transaction is invalid'));
            //     return;
            // }

            // Validate signature
            const signature = new Nimiq.Signature(this.keyguardResult.signature);
            if (!signature.verify(new Nimiq.PublicKey(this.keyguardResult.publicKey), tx.serializeContent())) {
                this.$rpc.reject(new Error('NIM signature is invalid'));
                return;
            }

            const result: SignedTransaction = await (this.$refs.network as Network).makeSignTransactionResult(tx);

            this.$rpc.resolve(result);
        }

        if ('transactionHash' in this.keyguardResult) {
            const result: SignedBtcTransaction = {
                serializedTx: this.keyguardResult.raw,
                hash: this.keyguardResult.transactionHash,
            };

            this.$rpc.resolve(result);
        }
    }
}
</script>
