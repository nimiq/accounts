<template>
    <div class="container pad-bottom" :class="{ themed: themeBackground, 'dark-theme': isDarkTheme }">
        <img v-if="themeBackground && !isMobile"
            :src="`/img/cashlink-themes/${themeBackground}.svg`"
            class="theme-background theme-background-desktop"
            :class="themeBackground"
            @load="$event.target.style.opacity = 1"
        >
        <SmallPage v-if="cashlink || statusState">
            <transition name="transition-fade">
                <StatusScreen v-if="statusState"
                    :state="statusState"
                    :title="statusTitle"
                    :status="statusStatus"
                    :message="statusMessage"
                    :mainAction="$t('Got it')"
                    @main-action="redirectToWallet"
                />
            </transition>
            <div v-if="cashlink && hasWallets" class="card-content has-account" :class="{ 'account-selector-shown': !!isAccountSelectorOpened }">
                <PageHeader class="blur-target">{{ $t('You received a Cashlink!') }}</PageHeader>
                <PageBody>
                    <div class="accounts" :class="{'single-address': addressCount === 1}">
                        <Account class="cashlink-account blur-target" layout="column"
                            :displayAsCashlink="true"
                            label="Cashlink"/>
                        <ArrowRightIcon class="arrow-right blur-target"/>
                        <div v-if="addressCount > 1" class="recipient-button blur-target">
                            <button class="nq-button-s" @click="isAccountSelectorOpened = true;">{{ $t('Change') }}</button>
                            <Account layout="column"
                                :address="activeAccount.userFriendlyAddress"
                                :label="activeAccount.label"/>
                        </div>
                        <Account v-else layout="column"
                            :address="activeAccount.userFriendlyAddress"
                            :label="activeAccount.label"/>
                    </div>

                    <hr class="blur-target"/>

                    <div>
                        <Amount class="value nq-light-blue blur-target"
                            :amount="cashlink.value"
                            :minDecimals="0"
                            :maxDecimals="5"/>

                        <div v-if="cashlink.message" class="data nq-text blur-target">
                            {{ cashlink.message }}
                        </div>
                    </div>
                    <div><!-- bottom flex spacer --></div>
                </PageBody>
                <PageFooter>
                    <button
                        class="nq-button light-blue blur-target"
                        :disabled="!canCashlinkBeClaimed"
                        @click="claim"
                    ><CircleSpinner v-if="isButtonLoading"/>{{ buttonText }}</button>
                </PageFooter>

                <transition name="transition-fade">
                    <div v-if="isAccountSelectorOpened" class="overlay">
                        <CloseButton class="top-right" @click="isAccountSelectorOpened = false" />
                        <PageHeader>{{ $t('Choose an Address') }}</PageHeader>
                        <AccountSelector
                            :wallets="processedWallets"
                            :disableContracts="true"
                            @account-selected="accountSelected"
                            @login="callHub('login')"
                        />
                    </div>
                </transition>
            </div>
            <div v-if="cashlink && !hasWallets" class="card-content no-account">
                <div class="top-spacer"><!-- top flex spacer --></div>

                <CashlinkSparkle/>

                <div>
                    <Amount class="value nq-light-blue"
                        :amount="cashlink.value" :minDecimals="0" :maxDecimals="5" />

                    <div v-if="cashlink.message" class="data nq-text">
                        {{ cashlink.message }}
                    </div>
                </div>

                <PageFooter>
                    <button class="nq-button light-blue" @click="callHub('signup')">{{ $t('Create account') }}</button>
                    <a class="nq-link skip" href="javascript:void(0)" @click="callHub('onboard')">
                        {{ $t('Login to existing account') }}
                        <CaretRightSmallIcon/>
                    </a>
                </PageFooter>
            </div>
        </SmallPage>

        <div v-if="(cashlink && !hasWallets) || isMobile" class="outside-container">
            <img v-if="themeBackground && isMobile"
                 :src="`/img/cashlink-themes/${themeBackground}${hasMobileTheme ? '-mobile' : ''}.svg`"
                 class="theme-background theme-background-mobile"
                 :class="themeBackground"
                 @load="$event.target.style.opacity = 1"
            >
            <div v-if="cashlink && !hasWallets" class="welcome-text">
                <h1 class="nq-h1">{{ welcomeHeadline }}</h1>
                <p class="nq-text">
                    {{ welcomeText }}
                    {{ $t('Create an account and claim your money.') }}
                    <span class="secondary-text">{{ $t('30\u00a0seconds, no\u00a0email, no\u00a0download.') }}</span>
                </p>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import {
    SmallPage,
    PageHeader,
    PageBody,
    PageFooter,
    ArrowRightIcon,
    CaretRightSmallIcon,
    CloseButton,
    Account,
    Amount,
    AccountSelector,
} from '@nimiq/vue-components';
import StatusScreen from '../components/StatusScreen.vue';
import CashlinkSparkle from '../components/CashlinkSparkle.vue';
import CircleSpinner from '../components/CircleSpinner.vue';
import Cashlink from '../lib/Cashlink';
import { CashlinkState, BasicRequest, CashlinkTheme } from '../../client/PublicRequestTypes';
import { AccountInfo } from '../lib/AccountInfo';
import { Getter, Mutation } from 'vuex-class';
import { NetworkClient, DetailedPlainTransaction } from '@nimiq/network-client';
import Config from 'config';
import { WalletInfo } from '../lib/WalletInfo';
import { NETWORK_MAIN } from '../lib/Constants';
import { CashlinkStore } from '../lib/CashlinkStore';
import HubApi from '../../client/HubApi';

@Component({components: {
    SmallPage,
    StatusScreen,
    CashlinkSparkle,
    CircleSpinner,
    PageHeader,
    PageBody,
    PageFooter,
    ArrowRightIcon,
    CaretRightSmallIcon,
    CloseButton,
    Account,
    Amount,
    AccountSelector,
}})
class CashlinkReceive extends Vue {
    private static MOBILE_BREAKPOINT = 450;

    @Getter private addressCount!: number;
    @Getter private hasWallets!: boolean;
    @Getter private activeAccount?: AccountInfo;
    @Getter private processedWallets!: WalletInfo[];

    @Mutation('setActiveAccount') private $setActiveAccount!:
        (payload: {walletId: string, userFriendlyAddress: string}) => any;

    private cashlink: Cashlink | null = null;
    private selectedAddress: AccountInfo | null = null;
    private isAccountSelectorOpened: boolean = false;
    private isClaiming: boolean = false;
    private isMobile: boolean = false;

    private statusState: StatusScreen.State | false = false;
    private statusTitle = '';
    private statusStatus = '';
    private statusMessage = '';

    public created() {
        const handler = (result: any, storedData: {url: string}) => {
            if (storedData.url) {
                window.history.replaceState(window.history.state, '', storedData.url);
            }
        };

        const hubApi = new HubApi();
        hubApi.on(HubApi.RequestType.SIGNUP, handler, handler);
        hubApi.on(HubApi.RequestType.LOGIN, handler, handler);
        hubApi.on(HubApi.RequestType.ONBOARD, handler, handler);
        hubApi.checkRedirectResponse();

        this._onResize = this._onResize.bind(this);
        window.addEventListener('resize', this._onResize);
        this._onResize();
    }

    public async mounted() {
        // Load Cashlink from URL
        this.cashlink = await Cashlink.parse(window.location.hash.substring(1));

        // Fail if no Cashlink was found
        if (!this.cashlink) {
            this.statusState = StatusScreen.State.WARNING;
            this.statusTitle = this.$t('404 - Cash not found') as string;
            this.statusMessage = this.$t('This is not a valid Cashlink, sorry.') as string;
            return;
        }

        if (this.cashlink.theme) {
            this.$emit(CashlinkReceive.Events.THEME_CHANGED, this.cashlink.theme, this.isDarkTheme);
        }

        // When user has no wallets, skip Cashlink init because user needs to signup/login first
        // which requires this page to be reloaded anyway.
        if (!this.hasWallets) return;

        // Start network to check Cashlink status
        if (!NetworkClient.hasInstance()) {
            NetworkClient.createInstance(Config.networkEndpoint);
        }
        await NetworkClient.Instance.init();

        // Assign network to Cashlink
        this.cashlink.networkClient = NetworkClient.Instance;
    }

    public destroyed() {
        window.removeEventListener('resize', this._onResize);
    }

    private async claim() {
        // Start loading screen
        this.statusState = StatusScreen.State.LOADING;
        this.statusTitle = this.$t('Claiming Cashlink') as string;
        this.statusStatus = this.$t('Connecting to Nimiq...') as string;

        this.isClaiming = true;

        this.cashlink!.claim(this.activeAccount!.userFriendlyAddress);

        // Set up transaction-relayed listener, so we know when the tx has been sent
        await new Promise((resolve, reject) => {
            NetworkClient.Instance.on(NetworkClient.Events.TRANSACTION_RELAYED, (tx: DetailedPlainTransaction) => {
                if (tx.sender === this.cashlink!.address.toUserFriendlyAddress()) resolve();
            });
        });

        try {
            await CashlinkStore.Instance.put(this.cashlink!);
        } catch (err) {
            // Ignore, because cashlink has been claimed sucessfully and will show up in the Safe
        }

        // Show success screen and redirect to Safe
        this.statusState = StatusScreen.State.SUCCESS;
        this.statusTitle = this.$t('Cashlink claimed!') as string;

        window.setTimeout(() => this.redirectToWallet(), StatusScreen.SUCCESS_REDIRECT_DELAY);
    }

    private accountSelected(walletId: string, userFriendlyAddress: string) {
        this.$setActiveAccount({ walletId, userFriendlyAddress });
        this.isAccountSelectorOpened = false;
    }

    private callHub(method: 'signup' | 'login' | 'onboard') {
        const request: BasicRequest = {
            appName: 'Cashlink',
        };

        const redirectBehavior = new HubApi.RedirectRequestBehavior(undefined, { url: window.location.href });
        const hubApi = new HubApi(undefined, redirectBehavior);

        switch (method) {
            case 'signup': hubApi.signup(request); break;
            case 'login': hubApi.login(request); break;
            case 'onboard': hubApi.onboard(request); break;
        }
    }

    private redirectToWallet() {
        window.location.href = Config.redirectTarget;
    }

    private get isCashlinkStateKnown(): boolean {
        return this.cashlink!.state !== CashlinkState.UNKNOWN;
    }

    private get canCashlinkBeClaimed(): boolean {
        return this.cashlink!.state === CashlinkState.UNCLAIMED;
    }

    private get buttonText(): string {
        if (!this.isCashlinkStateKnown) return this.$t('Checking status') as string;
        else if (this.canCashlinkBeClaimed) return this.$t('Claim Cashlink') as string;
        else if (this.cashlink!.state === CashlinkState.UNCHARGED) return this.$t('Cashlink not funded') as string;
        else if (this.cashlink!.state === CashlinkState.CHARGING) return this.$t('Cashlink funding') as string;
        else {
            if (!this.isClaiming) {
                this.statusState = StatusScreen.State.WARNING;
                this.statusTitle = this.$t('Cashlink is empty') as string;
                this.statusMessage = this.$t('This Cashlink has already been claimed.') as string;
            }
            return this.$t('Cashlink empty :(') as string;
        }
    }

    private get isButtonLoading(): boolean {
        return !this.isCashlinkStateKnown || this.cashlink!.state === CashlinkState.CHARGING;
    }

    private get themeBackground(): string | null {
        return this.cashlink && this.cashlink.theme !== CashlinkTheme.STANDARD
            ? `${CashlinkTheme[this.cashlink.theme].toLowerCase().replace(/_/g, '-')}`
            : null;
    }

    private get isDarkTheme(): boolean {
        return !!this.cashlink && this.cashlink.theme === CashlinkTheme.LUNAR_NEW_YEAR;
    }

    private get hasMobileTheme(): boolean {
        const theme = this.cashlink ? this.cashlink.theme : CashlinkTheme.STANDARD;
        switch (theme) {
            case CashlinkTheme.STANDARD:
            case CashlinkTheme.EASTER:
            case CashlinkTheme.BIRTHDAY:
                return false;
            default:
                return true;
        }
    }

    private get welcomeHeadline(): string {
        const theme = this.cashlink ? this.cashlink.theme : CashlinkTheme.STANDARD;
        switch (theme) {
            case CashlinkTheme.GENERIC:
            case CashlinkTheme.CHRISTMAS:
            case CashlinkTheme.LUNAR_NEW_YEAR:
                return this.$t('You are loved') as string;
            case CashlinkTheme.EASTER:
                return this.$t('Happy Easter!') as string;
            case CashlinkTheme.BIRTHDAY:
                return this.$t('Happy birthday!') as string;
            default: return this.$t('Claim your Cash') as string;
        }
    }

    private get welcomeText(): string {
        if (this.cashlink && this.cashlink.hasEncodedTheme) {
            return this.$t('Congrats, you received a Nimiq Gift Card.') as string;
        } else {
            const theme = this.cashlink ? this.cashlink.theme : CashlinkTheme.STANDARD;
            return theme === CashlinkTheme.STANDARD
                ? this.$t('Congrats, you just opened a Nimiq Cashlink.') as string
                : this.$t('Congrats, somebody gifted you a Nimiq Cashlink.') as string;
        }
    }

    private _onResize() {
        this.isMobile = window.innerWidth <= CashlinkReceive.MOBILE_BREAKPOINT;
    }
}

namespace CashlinkReceive {
    export enum Events {
        THEME_CHANGED = 'theme-change',
    }
}

export default CashlinkReceive;
</script>

<style scoped>
    .container {
        flex-direction: row !important;
        padding: 0 5rem; /* Side padding for smaller screens */
    }

    .theme-background {
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: opacity 1s var(--nimiq-ease);
        opacity: 0;
        z-index: -1; /* put behind header */
    }

    .theme-background-desktop {
        position: fixed;
    }

    .theme-background-mobile {
        position: absolute;
        top: -7.5rem; /* header height */
        height: calc(100% + 7.5rem + 1rem); /* + header height + SmallPage border radius */
    }

    .theme-background.generic {
        object-position: center bottom;
    }

    .theme-background.christmas,
    .theme-background.lunar-new-year {
        object-position: right bottom;
    }

    .theme-background.easter {
        object-position: center 60%;
    }

    .theme-background.birthday {
        object-position: 70% bottom;
    }

    .card-content {
        display: flex;
        flex-direction: column;
        flex-grow: 1;
    }

    .card-content.no-account {
        align-items: center;
        justify-content: space-between;
    }

    .outside-container {
        display: flex;
        justify-content: center;
        align-items: center;
        align-self: stretch;
        position: relative;
    }

    .welcome-text {
        max-width: 514px;
        margin-left: 8.75rem; /* nq-card already has 1.25rem margin */
    }

    .dark-theme .welcome-text {
        color: white;
    }

    .welcome-text .nq-h1 {
        font-size: 8rem;
        margin-top: 0;
        margin-bottom: 4rem;
    }

    .welcome-text .nq-text {
        font-size: 4rem;
        color: inherit;
    }

    .welcome-text .secondary-text {
        color: rgba(31, 35, 72, 0.5);
    }

    .dark-theme .welcome-text .secondary-text {
        color: rgba(255, 255, 255, .65);
    }

    .small-page {
        position: relative;
        overflow: hidden; /* avoid overflow of blurred elements */
        transition: opacity .8s;
    }

    .page-header {
        padding: 0;
        margin: 4rem; /* use margin instead of padding to reduce area on which to apply expensive blur */
    }

    .page-body {
        display: flex;
        flex-direction: column;
        padding-bottom: 0;
        justify-content: space-between;
    }

    .page-footer {
        align-self: stretch;
        text-align: center;
    }

    .accounts {
        display: flex;
        align-self: stretch;
    }

    .cashlink-account {
        margin-top: 3rem;
    }

    .cashlink-account,
    .recipient-button {
        width: calc(50% - 1.5rem - 2.75rem); /* minus half arrow width */
    }

    .cashlink-icon {
        width: 8rem;
        height: 8rem;
        border-radius: 4rem;
        margin: 0.5rem;
        margin-bottom: 1.75rem; /* 1.25rem like the Identicon, + 0.5rem from own margin */
    }

    .cashlink-icon svg {
        width: 100%;
        height: 100%;
    }

    .recipient-button .account >>> .identicon {
        height: 9rem;
    }

    .cashlink-label {
        line-height: 1.5;
    }

    .accounts .arrow-right {
        font-size: 3rem;
        margin: 8.125rem 2.75rem 0;
        color: var(--nimiq-light-blue);
        flex-shrink: 0;
    }

    .recipient-button {
        border: .25rem solid rgba(31, 35, 72, 0.1);
        border-radius: 0.5rem;
        display: flex;
        flex-direction: column;
        position: relative;
        padding-top: 3rem;
    }

    .recipient-button button {
        position: absolute;
        right: 0.75rem;
        top: 0.75rem;
        font-size: 1.5rem;
        line-height: 2.75rem;
        height: 2.75rem;
        padding: 0 1.125rem;
    }

    .recipient-button .account {
        padding-left: 0;
        padding-right: 0;
    }

    .accounts.single-address .cashlink-account {
        margin-top: 0;
        width: calc(50% - 2rem);
    }

    .accounts.single-address .arrow-right {
        margin: 5.125rem 0 0 auto;
    }

    hr {
        width: 100%;
        height: 1px;
        margin: 2rem 0;
        border: none;
        background: #1F2348;
        opacity: .1;
    }

    .value {
        display: block;
        text-align: center;
        font-size: 5rem;
    }

    .no-account .value {
        font-size: 8rem;
    }

    .value >>> .nim {
        margin-left: -.25rem;
        font-size: 0.45em;
        font-weight: 700;
    }

    .data {
        margin: 0.5rem 0 0;
        font-size: 2.5rem;
        color: var(--nimiq-blue);
        text-align: center;
        max-height: 9.75rem; /* three lines */
        overflow-wrap: break-word;
    }

    .no-account .data {
        margin-top: 1rem;
    }

    .nq-button >>> .circle-spinner {
        margin-right: 1.5rem;
        margin-bottom: -0.375rem;
    }

    .skip {
        font-size: 1.75rem;
        font-weight: 600;
        line-height: 2;
        color: inherit;
        margin: -1.5rem auto 1rem;
        padding: 0 2rem;
        opacity: 0.7;
        transition: opacity .3s var(--nimiq-ease);
    }

    .skip .nq-icon  {
        height: 1.125rem;
        width: 1.125rem;
        transition: transform .3s var(--nimiq-ease);
        vertical-align: middle;
    }

    .skip:hover,
    .skip:focus {
        outline: none;
        opacity: 1;
        text-decoration: none;
    }

    .skip:hover .nq-icon,
    .skip:focus .nq-icon {
        transform: translate3D(-0.25rem, 0, 0);
    }

    .status-screen {
        position: absolute;
        transition: opacity .4s;
        z-index: 2;
    }

    .overlay {
        position: absolute;
        top: 0;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        transition: opacity .4s;
        background: rgba(255, 255, 255, .875); /* equivalent to keyguard: .5 on blurred and .75 on account details */
    }

    .account-selector {
        margin-top: -3rem;
    }

    .account-selector >>> .amount {
        display: none !important;
    }

    .blur-target {
        transition: filter .4s;
    }

    .account-selector-shown .blur-target {
        filter: blur(20px);
    }
    .account-selector-shown .page-footer {
        filter: blur(35px);
    }

    @media (max-width: 939px) {
        .container {
            padding: 0 4rem;
        }

        .welcome-text {
            margin-left: 5.75rem;
        }

        .welcome-text .nq-h1 {
            font-size: 5.5rem;
            margin-bottom: 3rem;
        }

        .welcome-text .nq-text {
            font-size: 3rem;
        }
    }

    @media (max-width: 799px) {
        .container {
            padding: 0 2.5rem;
        }

        .welcome-text {
            margin-left: 3.75rem;
        }

        .welcome-text .nq-h1 {
            font-size: 4rem;
            margin-bottom: 1.75rem;
        }

        .welcome-text .nq-text {
            margin-top: 1.75rem;
            font-size: 2.5rem;
        }
    }

    @media (max-width: 699px) {
        .container {
            flex-direction: column-reverse !important;
            padding: 0;
        }

        .small-page {
            height: auto !important;
        }

        .top-spacer {
            display: none;
        }

        .no-account .value {
            font-size: 6rem;
        }

        .no-account .data {
            font-size: 2rem;
        }

        .welcome-text {
            max-width: 420px;
            text-align: center;
            margin: 3rem 0 4rem;
            padding: 0 2rem;
        }
    }

    @media (max-width: 450px) {
        .welcome-text {
            font-weight: 600;
        }

        .welcome-text .nq-h1 {
            font-size: 3.5rem;
        }

        .welcome-text .nq-text {
            font-size: 1.875rem;
            line-height: 1.4;
        }

        .themed .outside-container {
            flex-grow: 1;
        }

        .container:not(.themed) .small-page {
            flex-grow: 1;
        }

        .theme-background.easter {
            object-position: 60% center;
        }

        .small-page {
            max-width: unset !important;
        }

        .account-selector-shown .blur-target {
            filter: blur(10px);
        }

        .account-selector-shown .page-footer {
            filter: blur(25px);
        }
    }
</style>
