<template>
    <div class="container pad-bottom">
        <SmallPage>
            <StatusScreen
                :title="title"
                :state="state"
                :status="status"
                :lightBlue="true"
                :mainAction="action"
                @main-action="resolve"
                :message="message" />
        </SmallPage>
    </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { State, Action } from 'vuex-class';
import KeyguardClient from '@nimiq/keyguard-client';
import { BrowserDetection } from '@nimiq/utils';
import { SmallPage } from '@nimiq/vue-components';
import { ParsedBasicRequest } from '../lib/RequestTypes';
import { Account, RequestType } from '../lib/PublicRequestTypes';
import { WalletInfo } from '../lib/WalletInfo';
import { WalletStore } from '../lib/WalletStore';
import { Static } from '../lib/StaticStore';
import StatusScreen from '../components/StatusScreen.vue';
import WalletInfoCollector, { BasicAccountInfo } from '../lib/WalletInfoCollector';
import { WalletCollectionResultKeyguard } from '../lib/WalletInfoCollector';
import CookieHelper from '../lib/CookieHelper';
import { ERROR_COOKIE_SPACE, WalletType } from '../lib/Constants';

@Component({components: {StatusScreen, SmallPage}})
export default class LoginSuccess extends Vue {
    @Static private request!: ParsedBasicRequest;
    @State private keyguardResult!: KeyguardClient.KeyResult;

    @Action('addWalletAndSetActive') private $addWalletAndSetActive!: (walletInfo: WalletInfo) => any;

    private walletInfos: WalletInfo[] = [];
    private state: StatusScreen.State = StatusScreen.State.LOADING;
    private title: string = this.$root.$t('Fetching your Addresses') as string;
    private status: string = this.$root.$t('Connecting to network...') as string;
    private message: string = '';
    private action: string = '';
    private receiptsError: Error | null = null;
    private result: Account[] | null = null;
    private resolve = () => {}; // tslint:disable-line:no-empty

    private async mounted() {
        const collectionResults: WalletCollectionResultKeyguard[] = [];

        try {
            await Promise.all(
                this.keyguardResult.map(async (keyResult) => {
                    // The Keyguard always returns (at least) one derived Address,
                    const keyguardResultAccounts = keyResult.addresses.map((addressObj) => ({
                        address: new Nimiq.Address(addressObj.address).toUserFriendlyAddress(),
                        path: addressObj.keyPath,
                    }));

                    let tryCount = 0;
                    while (true) {
                        try {
                            tryCount += 1;
                            let collectionResult: WalletCollectionResultKeyguard;
                            if (keyResult.keyType === WalletType.BIP39) {
                                collectionResult = await WalletInfoCollector.collectBip39WalletInfo(
                                    keyResult.keyId,
                                    keyguardResultAccounts,
                                    this.onUpdate.bind(this),
                                    this.keyguardResult.length === 1,
                                    keyResult.bitcoinXPub,
                                );
                            } else {
                                collectionResult = await WalletInfoCollector.collectLegacyWalletInfo(
                                    keyResult.keyId,
                                    keyguardResultAccounts[0],
                                    this.onUpdate.bind(this),
                                    this.keyguardResult.length === 1,
                                );
                            }

                            if (collectionResult.receiptsError) {
                                this.receiptsError = collectionResult.receiptsError;
                            }

                            collectionResult.walletInfo.fileExported = collectionResult.walletInfo.fileExported
                                || keyResult.fileExported;
                            collectionResult.walletInfo.wordsExported = collectionResult.walletInfo.wordsExported
                                || keyResult.wordsExported;

                            collectionResults.push(collectionResult);

                            break;
                        } catch (e) {
                            this.status = this.$root.$t('Address detection failed. Retrying...') as string;
                            if (tryCount >= 5) throw e;
                        }
                    }
                }),
            );
        } catch (e) {
            this.state = StatusScreen.State.ERROR;
            this.title = this.$t('Fetching Addresses Failed') as string;
            this.message = this.$t('Syncing with the network failed: {error}', { error: e.message || e }) as string;
            this.action = this.$t('Retry') as string;
            await new Promise((resolve) => { this.resolve = resolve; });
            window.location.reload();
            return;
        }

        // In case there is only one returned Account it is always added.
        let keepWalletCondition: (collectionResult: WalletCollectionResultKeyguard) => boolean = () => true;
        if (collectionResults.length > 1) {
            if (collectionResults.some((walletInfo) => walletInfo.hasActivity)) {
                // In case there is more than one account returned and at least one saw activity in the past
                // add the accounts with activity while discarding the others.
                keepWalletCondition = (collectionResult) => collectionResult.hasActivity;
            } else {
                // In case of more than one returned account but none saw activity in the past
                // look for the BIP39 account and add it while discarding the others.
                keepWalletCondition = (collectionResult) => collectionResult.walletInfo.type === WalletType.BIP39;
            }
        }

        let failBecauseOfCookieSpace = false;
        if (BrowserDetection.isIOS() || BrowserDetection.isSafari()) {
            const walletInfosToKeep = collectionResults
                .filter((collectionResult) => keepWalletCondition(collectionResult))
                .map((collectionResult) => collectionResult.walletInfo.toObject());
            failBecauseOfCookieSpace = !await CookieHelper.canFitNewWallets(walletInfosToKeep);
        }

        await Promise.all (
            collectionResults.map(async (collectionResult) => {
                if (!failBecauseOfCookieSpace && keepWalletCondition(collectionResult)) {
                    await WalletStore.Instance.put(collectionResult.walletInfo);
                    this.walletInfos.push(collectionResult.walletInfo);
                    await collectionResult.releaseKey(false);
                } else {
                    await collectionResult.releaseKey(true);
                }
            }),
        );

        if (failBecauseOfCookieSpace) {
            this.title = this.$t('Space exceeded') as string;
            this.state = StatusScreen.State.ERROR;
            this.message = this.$t('Unfortunately, due to space restrictions of Safari and IOS, this account cannot be '
                + 'stored properly. Please free up space by logging out of other accounts.') as string;
            this.action = this.$t('Continue') as string;
            await new Promise((resolve) => { this.resolve = resolve; });
            this.$rpc.reject(new Error(ERROR_COOKIE_SPACE));
            return;
        }

        this.done();
    }

    private onUpdate(walletInfo: WalletInfo, currentlyCheckedAccounts: BasicAccountInfo[]) {
        const count = !walletInfo ? 0 : walletInfo.accounts.size;
        this.status = this.$tc('Imported {count} address so far... | Imported {count} addresses so far...', count);
    }

    private async done() {
        if (!this.walletInfos.length) throw new Error('WalletInfo not ready.');

        // Add wallets to vuex
        for (const walletInfo of this.walletInfos) {
            this.$addWalletAndSetActive(walletInfo);
        }

        const result: Account[] = await Promise.all(this.walletInfos.map((walletInfo) => walletInfo.toAccountType()));

        if (this.receiptsError) {
            this.title = this.$t('Your Addresses may be\nincomplete.') as string;
            this.state = StatusScreen.State.WARNING;
            this.message = this.$t('Used addresses without balance might have been missed.') as string;
            this.action = this.$t('Continue') as string;
            await new Promise((resolve) => { this.resolve = resolve; });
        }

        // In RequestType.CHANGE_PASSWORD a reset password function was added leading to an import with
        // recovery words. Display an appropriate success message in case that is how this successful
        // import came to be.
        if (this.request.kind === RequestType.CHANGE_PASSWORD) {
            this.title = this.$t('Your password was changed.') as string;
            this.state = StatusScreen.State.SUCCESS;
            setTimeout(() => { this.$rpc.resolve({success: true}); }, StatusScreen.SUCCESS_REDIRECT_DELAY);
            return;
        }

        this.title = this.$tc('Your Account is ready. | Your Accounts are ready.', result.length);
        this.state = StatusScreen.State.SUCCESS;
        setTimeout(() => { this.$rpc.resolve(result); }, StatusScreen.SUCCESS_REDIRECT_DELAY);
    }
}
</script>
