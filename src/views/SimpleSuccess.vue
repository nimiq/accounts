<template>
    <div class="container pad-bottom">
        <SmallPage>
            <StatusScreen :title="text" :state="state" :lightBlue="true"/>
        </SmallPage>
    </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { SmallPage, CheckmarkIcon } from '@nimiq/vue-components';
import { State } from 'vuex-class';
import { RpcRequest, SimpleResult } from '../../client/PublicRequestTypes';
import { SimpleResult as KSimpleResult } from '@nimiq/keyguard-client';
import { Static } from '@/lib/StaticStore';
import StatusScreen from '../components/StatusScreen.vue';

@Component({components: {SmallPage, StatusScreen, CheckmarkIcon}})
export default class SimpleSuccess extends Vue {
    @Static private request!: RpcRequest;
    @State private keyguardResult!: KSimpleResult;
    private state: StatusScreen.State = StatusScreen.State.SUCCESS;

    public async mounted() {
        setTimeout(() => this.$rpc.resolve(this.keyguardResult as SimpleResult), StatusScreen.SUCCESS_REDIRECT_DELAY);
    }

    get text() {
        switch (this.$route.name) {
            case 'change-password-success':
                return this.$t('Your password was changed.') as string;
            default:
                throw new Error('No matching route');
        }
    }
}
</script>
