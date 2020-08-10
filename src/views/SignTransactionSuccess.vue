<template>
    <Network ref="network" :visible="false"/>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Network from '@/components/Network.vue';
import { SignedTransaction } from '../../client/PublicRequestTypes';
import { State } from 'vuex-class';
import { Static } from '../lib/StaticStore';
import KeyguardClient from '@nimiq/keyguard-client';

@Component({components: {Network}})
export default class SignTransactionSuccess extends Vue {
    @Static private keyguardRequest!: KeyguardClient.SignTransactionRequest;
    @State private keyguardResult!: KeyguardClient.SignTransactionResult;

    private async mounted() {
        const tx = await (this.$refs.network as Network).createTx(Object.assign({
            signerPubKey: this.keyguardResult.publicKey,
        }, this.keyguardResult, this.keyguardRequest));
        const result: SignedTransaction = await (this.$refs.network as Network).makeSignTransactionResult(tx);

        this.$rpc.resolve(result);
    }
}
</script>
