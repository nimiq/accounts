<template>
    <div class="container pad-bottom">
        <SmallPage>
            <StatusScreen state="success" :title="$t('Your message is signed.')"/>
        </SmallPage>
    </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { State } from 'vuex-class';
import { ParsedSignMessageRequest } from '../lib/RequestTypes';
import { SignedMessage } from '../../client/PublicRequestTypes';
import KeyguardClient from '@nimiq/keyguard-client';
import { Static } from '@/lib/StaticStore';
import StatusScreen from '../components/StatusScreen.vue';
import { SmallPage, CheckmarkIcon } from '@nimiq/vue-components';

@Component({components: {StatusScreen, SmallPage, CheckmarkIcon}})
export default class SignMessageSuccess extends Vue {
    @Static private request!: ParsedSignMessageRequest;
    @Static private keyguardRequest!: KeyguardClient.SignMessageRequest;
    @State private keyguardResult!: KeyguardClient.SignatureResult;

    private mounted() {
        const result: SignedMessage = {
            signer: new Nimiq.Address(this.keyguardRequest.signer).toUserFriendlyAddress(),
            signerPublicKey: this.keyguardResult.publicKey,
            signature: this.keyguardResult.signature,
        };

        setTimeout(() => this.$rpc.resolve(result), StatusScreen.SUCCESS_REDIRECT_DELAY);
    }
}
</script>
