<template>
    <div class="container pad-bottom">
        <SmallPage>
            <StatusScreen :title="$t('You are logged out.')" state="success"/>
        </SmallPage>
    </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { ParsedSimpleRequest } from '../lib/RequestTypes';
import { SimpleResult } from '../../client/PublicRequestTypes';
import { State } from 'vuex-class';
import { SmallPage } from '@nimiq/vue-components';
import { WalletStore } from '@/lib/WalletStore';
import { Static } from '@/lib/StaticStore';
import StatusScreen from '../components/StatusScreen.vue';
import KeyguardClient from '@nimiq/keyguard-client';

@Component({components: {StatusScreen, SmallPage}})
export default class LogoutSuccess extends Vue {
    @Static private request!: ParsedSimpleRequest;
    @State private keyguardResult!: KeyguardClient.SimpleResult;

    public async mounted() {
        const start = Date.now();

        // If we at some point notice that the removal takes longer than SUCCESS_REDIRECT_DELAY
        // (currently 2s), we need to add a loading state before the success state.
        await WalletStore.Instance.remove(this.request.walletId);

        const remainingTimeout = Math.max(0, StatusScreen.SUCCESS_REDIRECT_DELAY - (Date.now() - start));

        setTimeout(() => this.$rpc.resolve(this.keyguardResult as SimpleResult), remainingTimeout);
    }
}
</script>
