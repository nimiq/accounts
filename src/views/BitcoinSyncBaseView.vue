<template>
    <div v-if="state !== State.NONE" class="container">
        <SmallPage>
            <StatusScreen
                :state="statusScreenState"
                :title="statusScreenTitle"
                :status="statusScreenStatus"
                :message="statusScreenMessage"
                :mainAction="statusScreenAction"
                :lightBlue="!useDarkSyncStatusScreen"
                @main-action="_statusScreenActionHandler"
            />
        </SmallPage>

        <GlobalClose :hidden="!isGlobalCloseShown" />
    </div>
</template>

<script lang="ts">
import { Vue } from 'vue-property-decorator';
import StatusScreen from '../components/StatusScreen.vue';

// Note: we don't decorate this class as @Component on purpose as the class component decorator converts the getters
// into vue computed properties which result in an endless recursion when called from overwrites in child classes. As we
// don't decorate this class, decorated child classes must include the components used in the template here.
export default class BitcoinSyncBaseView extends Vue {
    protected get State() {
        // As getter such that child classes can extend this implementation.
        return {
            NONE: 'none',
            SYNCING: 'syncing',
            SYNCING_FAILED: 'syncing-failed',
        };
    }

    protected state: string = this.State.NONE;
    protected useDarkSyncStatusScreen = false;
    protected error: string = '';

    protected get statusScreenState(): StatusScreen.State {
        if (this.state === this.State.SYNCING_FAILED) return StatusScreen.State.ERROR;
        return StatusScreen.State.LOADING;
    }

    protected get statusScreenTitle() {
        switch (this.state) {
            case this.State.SYNCING:
                return this.$t('Fetching your Addresses') as string;
            case this.State.SYNCING_FAILED:
                return this.$t('Syncing Failed') as string;
            default:
                return '';
        }
    }

    protected get statusScreenStatus() {
        if (this.state !== this.State.SYNCING) return '';
        return this.$t('Syncing with Bitcoin network...') as string;
    }

    protected get statusScreenMessage() {
        if (this.state !== this.State.SYNCING_FAILED) return '';
        return this.$t('Syncing with Bitcoin network failed: {error}', { error: this.error }) as string;
    }

    protected get statusScreenAction() {
        if (this.state !== this.State.SYNCING_FAILED) return '';
        return this.$t('Retry') as string;
    }

    protected get isGlobalCloseShown() {
        return this.state === this.State.SYNCING_FAILED;
    }

    protected _statusScreenActionHandler() {
        window.location.reload();
    }
}
</script>
