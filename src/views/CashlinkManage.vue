<template>
    <div class="container pad-bottom">
        <SmallPage class="cashlink-manage" v-if="retrievedCashlink" :class="{ 'fixed-height': this.request.skipSharing }">
            <transition name="transition-fade">
                <StatusScreen v-if="!isTxSent || this.request.skipSharing"
                    :state="state"
                    :title="title"
                    :status="status"
                    :message="message"
                    :mainAction="$t('Reload')"
                    :alternativeAction="$t('Cancel')"
                    @main-action="reload"
                    @alternative-action="cancel"
                    lightBlue
                />
            </transition>

            <PageBody v-if="!this.request.skipSharing">
                <transition name="transition-fade">
                    <div v-if="!isManagementRequest && isTxSent" class="nq-green cashlink-status"><CheckmarkSmallIcon/>{{ $t('Cashlink created') }}</div>
                </transition>
                <button class="nq-button-s close" @click="close">{{ $t('Done') }}</button>
                <div class="cashlink-and-url">
                    <Account layout="column" :displayAsCashlink="true" :class="{'sending': !isTxSent, 'show-loader': !isManagementRequest}"/>
                    <Copyable :text="link">
                        <div class="cashlink-url">{{link}}</div>
                    </Copyable>
                </div>
            </PageBody>
            <PageFooter v-if="!this.request.skipSharing">
                <button class="nq-button copy" :class="copied ? 'green' : 'light-blue'" @click="copy">
                    <span v-if="copied"><CheckmarkSmallIcon /> {{ $t('Copied') }}</span>
                    <span v-else>{{ $t('Copy') }}</span>
                </button>
                <button v-if="nativeShareAvailable" class="nq-button share-mobile" @click="share">
                    {{ $t('Share') }}
                </button>
                <template v-else>
                    <a class="nq-button-s social-share telegram" target="_blank" :href="telegram">
                        <svg width="29" height="25" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                            <path opacity=".6" d="M28.54.53c-.1-.31-.23-.4-.42-.47C27.7-.11 27 .14 27 .14S1.94 9.5.52 10.54c-.31.22-.42.35-.47.5-.25.74.52 1.06.52 1.06l6.46 2.19h.06L10.1 23s.28.59.61.78l.03.02.03.02.13.02h.02c.25 0 .66-.21 1.31-.9a56.7 56.7 0 013.4-3.22 90.48 90.48 0 015.64 4.27c.51.47.95.54 1.3.53.98-.04 1.25-1.16 1.25-1.16S28.41 4.26 28.56 1.7c0-.25.03-.4.03-.58 0-.24-.02-.48-.05-.6zM8.34 13.76v-.13c3.46-2.27 13.88-9.1 14.56-9.35.13-.04.21 0 .2.09-.32 1.12-11.88 11.8-11.88 11.8l-.06.12-.02-.01-.4 4.4-2.4-6.92z"/>
                        </svg>
                    </a>
                    <a class="nq-button-s social-share" :href="mail">
                        <svg width="28" height="24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                            <g opacity=".6">
                                <path d="M13.9 11.36c.14.14.27.14.4 0l12.84-8.55c.27-.14.4-.4.27-.67A2.73 2.73 0 0024.73 0H2.67A2.73 2.73 0 000 2.14c0 .27.13.53.4.8l13.5 8.42z"/>
                                <path d="M15.38 14.44c-.8.53-1.74.53-2.55 0L1.08 6.95c-.4-.13-.8 0-.94.27-.13.13-.13.27-.13.4v13.1a2.68 2.68 0 002.67 2.68h22.06a2.68 2.68 0 002.68-2.68V7.62c0-.4-.27-.67-.67-.67-.13 0-.27 0-.4.14l-10.96 7.35z"/>
                            </g>
                        </svg>
                    </a>
                    <a class="nq-button-s social-share" target="_blank" :href="whatsapp">
                        <svg width="28" height="28" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                            <path opacity=".6" d="M14 0A14 14 0 000 14c0 2.82.82 5.65 2.45 8L.82 26.7c-.12.24 0 .48.11.6.12.11.35.23.59.11l5.01-1.53a13.91 13.91 0 0019.25-4.47c1.4-2.23 2.1-4.82 2.1-7.41C28 6.24 21.7 0 14 0zm8.4 19.65a4.57 4.57 0 01-4.08 2.47c-1.4-.12-2.8-.6-3.97-1.18a16.76 16.76 0 01-7-6.12c-2.22-2.94-2.33-5.76-.23-8.11a2.9 2.9 0 012.21-.6c.59.12 1.17.48 1.4 1.07l.47 1.06c.35.82.7 1.64.7 1.76.23.35.23.82 0 1.18-.35.58-.7 1.17-1.17 1.64a10.68 10.68 0 002.1 2.47 8.68 8.68 0 003.15 1.89c.35-.47.94-1.18 1.17-1.53a1.18 1.18 0 011.52-.47c.46.11 2.91 1.4 2.91 1.4.35.13.59.36.82.6.47.94.47 1.76 0 2.47z"/>
                        </svg>
                    </a>
                </template>
            </PageFooter>
        </SmallPage>
        <Network ref="network" :visible="false"/>
    </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Static } from '../lib/StaticStore';
import { Cashlink as PublicCashlink } from '../../client/PublicRequestTypes';
import { ParsedCreateCashlinkRequest, ParsedManageCashlinkRequest } from '../lib/RequestTypes';
import { SmallPage, PageBody, PageFooter, Account, CheckmarkSmallIcon, Copyable } from '@nimiq/vue-components';
import StatusScreen from '../components/StatusScreen.vue';
import Network from '../components/Network.vue';
import Cashlink from '../lib/Cashlink';
import { CashlinkStore } from '../lib/CashlinkStore';
import { State } from 'vuex-class';
import KeyguardClient from '@nimiq/keyguard-client';
import { Clipboard } from '@nimiq/utils';
import { i18n } from '../i18n/i18n-setup';
import { ERROR_CANCELED } from '../lib/Constants';

@Component({components: {
    Account,
    CheckmarkSmallIcon,
    PageBody,
    PageFooter,
    SmallPage,
    StatusScreen,
    Network,
    Copyable,
}})
export default class CashlinkManage extends Vue {
    private static readonly SHARE_PREFIX: string = i18n.t('Here is your Nimiq Cashlink!') as string;

    @Static private request!: ParsedManageCashlinkRequest | ParsedCreateCashlinkRequest;
    @Static private cashlink?: Cashlink;
    @Static private keyguardRequest?: KeyguardClient.SignTransactionRequest;
    @State private keyguardResult?: KeyguardClient.SignTransactionResult;

    private isTxSent: boolean = false;
    private isManagementRequest: boolean = false;
    private status: string = i18n.t('Connecting to network...') as string;
    private state: StatusScreen.State = StatusScreen.State.LOADING;
    private message: string = '';
    private retrievedCashlink: Cashlink | null = null;
    private copied: boolean = false;

    // @ts-ignore Property 'share' does not exist on type 'Navigator'
    private readonly nativeShareAvailable: boolean = (!!window.navigator && !!window.navigator.share);

    private async mounted() {
        const network = this.$refs.network as Network;

        this.isManagementRequest = !this.cashlink; // freshly created cashlink or management request?
        let storedCashlink;
        if ('cashlinkAddress' in this.request && !!this.request.cashlinkAddress) {
            storedCashlink = await CashlinkStore.Instance.get(this.request.cashlinkAddress.toUserFriendlyAddress());
            if (!storedCashlink) {
                this.$rpc.reject(new Error(`Could not find Cashlink for address ${this.request.cashlinkAddress}.`));
                return;
            }
        } else if (this.cashlink) {
            storedCashlink = await CashlinkStore.Instance.get(this.cashlink.address.toUserFriendlyAddress());
        } else {
            this.$rpc.reject(new Error('CashlinkManage expects the cashlink to display to be specified either via '
                + 'request.cashlinkAddress or the cashlink in the static store.'));
            return;
        }

        let transactionToSend;
        if (storedCashlink) {
            // Cashlink is typically already sent as the sending happens right after storing the Cashlink. However, it
            // might be that the sending failed and the user reloaded the page, in which case we try sending again.
            transactionToSend = network.getUnrelayedTransactions({
                recipient: storedCashlink.address,
                value: storedCashlink.value,
            })[0];
            this.isTxSent = !transactionToSend;
            this.retrievedCashlink = storedCashlink;
        } else {
            // Cashlink can not have been sent yet because whenever it gets sent, it was also added to the store.
            this.isTxSent = false;
            this.retrievedCashlink = this.cashlink!;
        }

        if (!this.isTxSent) {
            // Note that this will never be called when coming from SignTransactionLedger as it sends and stores
            // the cashlink itself.
            if (!this.keyguardResult || !this.keyguardRequest) {
                this.$rpc.reject(new Error('Unexpected: No valid Cashlink;'));
                return;
            }
            network.$on(Network.Events.API_READY,
                () => this.status = this.$t('Contacting seed nodes...') as string);
            network.$on(Network.Events.CONSENSUS_SYNCING,
                () => this.status = this.$t('Syncing consensus...') as string);
            network.$on(Network.Events.CONSENSUS_ESTABLISHED,
                () => this.status = this.$t('Sending transaction...') as string);
            network.$on(Network.Events.TRANSACTION_PENDING,
                () => this.status = this.$t('Awaiting receipt confirmation...') as string);
            this.retrievedCashlink.networkClient = await network.getNetworkClient();

            // Store cashlink in database first to be safe when browser crashes during sending
            await CashlinkStore.Instance.put(this.retrievedCashlink);

            transactionToSend = transactionToSend || await network.createTx({
                ...this.keyguardRequest,
                signerPubKey: this.keyguardResult.publicKey,
                signature: this.keyguardResult.signature,
            });
            try {
                await network.sendToNetwork(transactionToSend);
                this.isTxSent = true;
            } catch (error) {
                this.state = StatusScreen.State.WARNING;
                if (error.message === Network.Errors.TRANSACTION_EXPIRED) {
                    this.message = this.$t('Transaction is expired') as string;
                } else if (error.message === Network.Errors.TRANSACTION_NOT_RELAYED) {
                    this.message = this.$t('Transaction could not be relayed') as string;
                } else {
                    this.message = error.message;
                }
                return;
            }
        }

        if ('skipSharing' in this.request && this.request.skipSharing) {
            this.state = StatusScreen.State.SUCCESS;
            window.setTimeout(() => this.close(), StatusScreen.SUCCESS_REDIRECT_DELAY);
        }
    }

    private get title(): string {
        switch (this.state) {
            case StatusScreen.State.SUCCESS: return this.$t('Cashlink created.') as string;
            case StatusScreen.State.WARNING: return this.$t('Something went wrong') as string;
            default: return this.$t('Creating your Cashlink') as string;
        }
    }

    private get link(): string {
        return `${window.location.origin}/cashlink/#${this.retrievedCashlink!.render()}`;
    }

    private close() {
        const result: PublicCashlink = {
            address: this.retrievedCashlink!.address.toUserFriendlyAddress(),
            message: this.retrievedCashlink!.message,
            value: this.retrievedCashlink!.value,
            status: this.retrievedCashlink!.state,
            theme: this.retrievedCashlink!.theme,
        };
        if ('returnLink' in this.request && this.request.returnLink) {
            // exposes the cashlink private key to the caller
            result.link = this.link;
        }
        this.$rpc.resolve(result);
    }

    private copy() {
        Clipboard.copy(this.link);

        this.copied = true;
        setTimeout(() => this.copied = false, 800);
    }

    private get shareText(): string {
        return encodeURIComponent(`${CashlinkManage.SHARE_PREFIX} ${this.link}`);
    }

    private share() {
        (navigator as any).share({
            title: 'Nimiq Cashlink',
            text: CashlinkManage.SHARE_PREFIX,
            url: this.link,
        }).catch( (error: Error) => console.log('Error sharing', error));
    }

    private get telegram(): string {
        return `https://telegram.me/share/msg?url=${location.host}&text=${this.shareText}`;
    }

    private get mail(): string {
        return `mailto:?subject=${encodeURIComponent('Nimiq Cashlink')}&body=${this.shareText}`;
    }

    private get whatsapp(): string {
        return `https://api.whatsapp.com/send?text=${this.shareText}`;
    }

    private reload() {
        window.location.reload();
    }

    private cancel() {
        this.$rpc.reject(new Error(ERROR_CANCELED));
    }
}
</script>

<style scoped>
    .cashlink-manage {
        position: relative;
    }

    .cashlink-manage:not(.fixed-height) {
        height: auto;
        min-height: 70.5rem;
    }

    .status-screen {
        position: absolute;
        transition: opacity .3s var(--nimiq-ease);
    }

    .close {
        position: absolute;
        top: 2rem;
        right: 2rem;
    }

    .cashlink-status {
        position: absolute;
        top: 2rem;
        left: 2rem;
        transition: opacity .4s var(--nimiq-ease);
        font-size: 2rem;
        font-weight: bold;
    }

    .cashlink-status .nq-icon {
        font-size: 1.5rem;
        margin-right: 1.25rem;
    }

    .cashlink-manage .cashlink-and-url {
        height: 100%;
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex-grow: 1;
    }

    .cashlink-manage .cashlink >>> .identicon {
        width: 18rem;
        height: 18rem;
        padding: 1rem;
        margin-bottom: 1.25rem;
    }

    .cashlink-manage .cashlink >>> .identicon:before {
        border: .5rem solid transparent;
    }

    .cashlink-manage .cashlink.show-loader >>> .identicon:before {
        border: .5rem solid var(--nimiq-green);
        animation: spin 4s linear infinite;
        transition: border 1s var(--nimiq-ease);
    }

    .cashlink-manage .cashlink.show-loader.sending  >>> .identicon:before {
        border-color: var(--nimiq-gray) var(--nimiq-gray) var(--nimiq-gray) var(--nimiq-light-blue);
    }

    @keyframes spin { 100% { -webkit-transform: rotate(360deg); transform:rotate(360deg); } }

    .cashlink-manage .cashlink-and-url .cashlink-url {
        text-align: center;
        font-size: 3rem;
        line-height: 4rem;
        text-transform: none;
        word-break: break-all;
        max-width: unset;
        max-height: unset;
        opacity: .5;
    }

    .page-body {
        padding-top: 6rem;
        padding-bottom: 0;
        display: flex;
        flex-direction: column;
    }

    .page-footer {
        flex-direction: row;
        justify-content: space-evenly;
    }

    .page-footer .nq-button {
        min-width: unset;
        width: 17rem;
        margin-left: unset;
        margin-right: unset;
    }
    .page-footer .nq-button:hover,
    .page-footer .nq-button:focus {
        transform: none;
    }

    .page-footer .nq-button.copy {
        padding: unset;
    }

    .social-share {
        width: 7.5rem;
        height: 7.5rem;
        border-radius: 50%;
        padding: 2rem;
        margin: 2rem 0 3rem;
    }

    .social-share.telegram {
        padding-left: 1.75rem;
        padding-right: 2.25rem;
    }

    .social-share svg {
        width: 3.5rem;
        height: 3.5rem;
        transition: opacity .4s var(--nimiq-ease);
        opacity: .7;
    }

    .social-share:hover svg,
    .social-share:focus svg {
        opacity: .8;
    }

    .share-mobile {
        background: none;
        box-shadow: none;
        background-color: rgba(31, 35, 72, 0.07); /* Based on Nimiq Blue */
        color: rgba(31, 35, 72, 0.7);
        transition: background-color 300ms var(--nimiq-ease), color 300ms var(--nimiq-ease);
    }

    .share-mobile:hover,
    .share-mobile:focus {
        background: none;
        background-color: rgba(31, 35, 72, 0.12); /* Based on Nimiq Blue */
        color: rgba(31, 35, 72, 1);
    }
</style>
