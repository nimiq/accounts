<template>
    <NotEnoughCookieSpace v-if='notEnoughCookieSpace'/>
    <div v-else class="container" :class="{'isSecondaryOnboarding': headerText}">
        <h1 v-if="headerText" class="uber-header">{{headerText}}</h1>
        <div class="center">
            <OnboardingMenu @signup="signup" @login="login" @ledger="ledger"/>

            <button v-if="!request.disableBack" class="global-close nq-button-s" @click="close">
                <ArrowLeftSmallIcon/>
                {{backButtonText}}
            </button>
        </div>
        <div v-if="headerText" class="uber-header"><!-- bottom spacing to balance header --></div>
    </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import KeyguardClient from '@nimiq/keyguard-client';
import { BrowserDetection } from '@nimiq/utils';
import OnboardingMenu from '../components/OnboardingMenu.vue';
import { ParsedOnboardRequest } from '@/lib/RequestTypes';
import { RequestType } from '../../client/PublicRequestTypes';
import { Static } from '@/lib/StaticStore';
import { DEFAULT_KEY_PATH, ERROR_CANCELED } from '@/lib/Constants';
import CookieHelper from '../lib/CookieHelper';
import NotEnoughCookieSpace from '../components/NotEnoughCookieSpace.vue';
import { ArrowLeftSmallIcon } from '@nimiq/vue-components';

@Component({components: {OnboardingMenu, NotEnoughCookieSpace, ArrowLeftSmallIcon}})
export default class OnboardingSelector extends Vue {
    @Static private request!: ParsedOnboardRequest;
    @Static private originalRouteName?: string;

    private notEnoughCookieSpace = false;

    public async created() {
        this.notEnoughCookieSpace = (BrowserDetection.isIOS() || BrowserDetection.isSafari())
            && !await CookieHelper.canFitNewWallets();
    }

    private signup() {
        const request: KeyguardClient.CreateRequest = {
            appName: this.request.appName,
            defaultKeyPath: DEFAULT_KEY_PATH,
            enableBackArrow: true,
        };
        const client = this.$rpc.createKeyguardClient();
        client.create(request);
    }

    private login() {
        const request: KeyguardClient.ImportRequest = {
            appName: this.request.appName,
            requestedKeyPaths: [DEFAULT_KEY_PATH],
            enableBackArrow: true,
        };
        const client = this.$rpc.createKeyguardClient();
        client.import(request);
    }

    private ledger() {
        this.$router.push({name: `${RequestType.SIGNUP}-ledger`});
    }

    private close() {
        if (this.isSecondaryOnboarding) {
            window.history.back();
        } else {
            this.$rpc.reject(new Error(ERROR_CANCELED));
        }
    }

    private get backButtonText() {
        switch (this.originalRouteName) {
            case RequestType.CHECKOUT:
                return this.$t('Back to Checkout') as string;
            case RequestType.CHOOSE_ADDRESS:
                return this.$t('Back to Choose Address') as string;
            case RequestType.SIGN_MESSAGE:
                return this.$t('Back to Sign Message') as string;
            case RequestType.CREATE_CASHLINK:
                return this.$t('Back to Cashlink') as string;
            default:
                return this.$t('Back to {appName}', { appName: this.request.appName }) as string;
        }
    }

    private get headerText() {
        switch (this.originalRouteName) {
            case RequestType.CHECKOUT:
                return this.$t('Pay with Nimiq') as string;
            case RequestType.CREATE_CASHLINK:
                return this.$t('Login to fund your Cashlink') as string;
            default:
                return undefined;
        }
    }

    private get isSecondaryOnboarding() {
        return this.originalRouteName === RequestType.CHECKOUT
            || this.originalRouteName === RequestType.CHOOSE_ADDRESS
            || this.originalRouteName === RequestType.SIGN_MESSAGE
            || this.originalRouteName === RequestType.CREATE_CASHLINK;
    }
}
</script>

<style scoped>
    .container.isSecondaryOnboarding {
        justify-content: space-around !important;
    }

    .uber-header {
        font-size: 5rem;
        margin-top: 2rem;
        margin-bottom: 6rem;
    }

    .center {
        text-align: center;
        width: 100%;
    }

    .onboarding-menu {
        margin: auto !important;
    }

    @media (max-height: 700px) {
        .uber-header:last-child {
            margin-bottom: 0;
        }
    }

    @media (max-height: 580px), (max-width: 420px) {
        .uber-header:last-child {
            display: none;
        }
    }
</style>
