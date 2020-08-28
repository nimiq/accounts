<template>
    <div class="container pad-bottom">
        <Network ref="network"/>
        <SmallPage v-if="page === 'intro'" class="intro">
            <PageHeader>
                {{ $t('Time to grow') }}
                <p slot="more" class="nq-notice info">
                    {{ $t('Nimiq just got better! The new design comes with a batch of new features.') }}
                </p>
            </PageHeader>

            <PageBody>
                <div class="topic">
                    <div class="topic-visual account-ring">
                        <AccountRing :addresses="['NQ18 37VM K2Y5 2HPY 5U80 2E0U VHUJ R7RK QSNE', 'NQ81 K7NT 9TJA BXE8 5D0R 3FN4 QJK0 YVYQ YD9A', 'NQ90 277A GR05 F775 AVFK 61RP CS7Y R7JA KGCT']"/>
                    </div>
                    <p class="topic-text">
                        {{ $t('One account can now have multiple addresses.') }}
                    </p>
                </div>
                <div class="topic">
                    <p class="topic-text">
                        {{ $t('Nimiq implements the ImageWallet standard with the Nimiq Login File.') }}
                    </p>
                    <div class="topic-visual login-file">
                        <svg width="58" height="97" viewBox="0 0 58 97" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x=".59" y=".78" width="56.81" height="95.45" rx="2.78" fill="#fff"/><path d="M1.67 3.7c0-1.01.83-1.84 1.85-1.84h50.95c1.02 0 1.85.83 1.85 1.85v89.58c0 1.02-.83 1.85-1.85 1.85H3.52a1.85 1.85 0 0 1-1.85-1.85V3.71z" fill="url(#paint0_radial)"/><g opacity=".5" fill="#fff"><g clip-path="url(#clip0)"><path d="M15.87 10.5l-1.02-1.77a.4.4 0 0 0-.35-.2h-2.03a.4.4 0 0 0-.35.2l-1.01 1.76a.4.4 0 0 0 0 .4l1.01 1.77c.08.13.21.2.35.2h2.03a.4.4 0 0 0 .35-.2l1.02-1.76a.4.4 0 0 0 0-.4z"/><rect x="17.26" y="9.14" width="12.12" height="3.03" rx="1.51"/><rect x="30.89" y="9.14" width="15.15" height="3.03" rx="1.51"/></g><rect x="21.8" y="16.52" width="14.39" height="1.51" rx=".76"/></g><g opacity=".5" fill="#fff"><path fill-rule="evenodd" clip-rule="evenodd" d="M23.47 67.02h-6.62c-.61 0-1.1-.5-1.1-1.1v-6.63c0-.61.49-1.1 1.1-1.1h6.62c.62 0 1.11.49 1.11 1.1v6.63c0 .6-.5 1.1-1.1 1.1zm-5.24-6.63a.28.28 0 0 0-.28.28v3.86c0 .16.13.28.28.28h3.86c.16 0 .28-.12.28-.28v-3.86a.28.28 0 0 0-.28-.28h-3.86zM16.85 75.86h6.62c.61 0 1.1.5 1.1 1.1v6.63c0 .6-.49 1.1-1.1 1.1h-6.62c-.61 0-1.1-.49-1.1-1.1v-6.63c0-.6.49-1.1 1.1-1.1zm5.24 6.62c.16 0 .28-.12.28-.27v-3.87a.28.28 0 0 0-.28-.27h-3.86a.28.28 0 0 0-.28.27v3.87c0 .15.13.27.28.27h3.86zM34.52 58.18h6.63c.6 0 1.1.5 1.1 1.1v6.64c0 .6-.5 1.1-1.1 1.1h-6.63c-.6 0-1.1-.5-1.1-1.1v-6.63c0-.61.5-1.1 1.1-1.1zm5.25 6.63c.15 0 .27-.12.27-.28v-3.86a.28.28 0 0 0-.27-.28H35.9a.28.28 0 0 0-.27.28v3.86c0 .16.12.28.27.28h3.87z"/><path d="M26.79 62.88h1.1a.83.83 0 1 0 0-1.66.28.28 0 0 1-.27-.28V59.3a.83.83 0 0 0-1.66 0v2.76c0 .46.37.83.83.83zM30.1 60.12c.16 0 .28.12.28.27v6.08a.83.83 0 0 0 1.66 0v-7.18a.83.83 0 0 0-.83-.83h-1.1a.83.83 0 0 0 0 1.66zM22.1 69.78c0 .46.36.83.82.83h3.87c.46 0 .83-.37.83-.83v-4.42a.83.83 0 0 0-1.66 0v3.32c0 .15-.12.27-.28.27h-2.76a.83.83 0 0 0-.83.83z"/><path d="M19.06 68.95a.83.83 0 0 0-.83.83v2.76c0 .16-.13.28-.28.28h-1.1a.83.83 0 0 0 0 1.66H31.2c.45 0 .83-.37.83-.83v-3.32a.83.83 0 0 0-1.66 0v2.21c0 .16-.13.28-.28.28h-9.94a.28.28 0 0 1-.28-.28v-2.76a.83.83 0 0 0-.82-.83zM30.93 76.96a.83.83 0 0 0-.83-.83H26.8a.83.83 0 0 0-.83.83v4.42a.83.83 0 0 0 1.66 0v-3.31c0-.16.12-.28.27-.28h2.21c.46 0 .83-.37.83-.83zM41.15 82.76h-9.39a.28.28 0 0 1-.28-.28v-2.2a.83.83 0 0 0-1.65 0v3.31c0 .46.37.83.82.83h10.5a.83.83 0 1 0 0-1.66z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M37.28 80.55h-3.31a.83.83 0 0 1-.83-.83v-3.31c0-.46.37-.83.83-.83h3.31c.46 0 .83.37.83.83v3.31c0 .46-.37.83-.83.83zm-2.2-3.31a.28.28 0 0 0-.28.27v1.1c0 .16.12.28.27.28h1.1c.16 0 .28-.12.28-.27v-1.1a.28.28 0 0 0-.27-.28h-1.1z"/><path d="M40.6 72.27a.83.83 0 0 0-.83.83v7.18a.83.83 0 1 0 1.66 0V73.1a.83.83 0 0 0-.83-.83zM41.43 69.23a.83.83 0 0 0-.83-.83h-6.08a.83.83 0 0 0-.83.83v3.31a.83.83 0 1 0 1.66 0v-2.2c0-.16.12-.28.28-.28h4.97c.45 0 .83-.37.83-.83z"/></g><g opacity=".35" fill="#fff"><path opacity=".7" d="M32.29 29.4l-1.57-2.72a.63.63 0 0 0-.54-.31h-3.14a.63.63 0 0 0-.54.31l-1.57 2.72a.63.63 0 0 0 0 .62l1.57 2.72c.11.2.32.31.54.31h3.14c.22 0 .43-.12.54-.31l1.57-2.72a.62.62 0 0 0 0-.62z"/><path opacity=".78" d="M32.29 45.2l-1.57-2.72a.63.63 0 0 0-.54-.31h-3.14a.63.63 0 0 0-.54.3l-1.57 2.72a.63.63 0 0 0 0 .63l1.57 2.72c.11.2.32.31.54.31h3.14c.22 0 .43-.12.54-.31l1.57-2.72a.62.62 0 0 0 0-.63z"/><path opacity=".5" d="M25.45 33.35l-1.57-2.72a.63.63 0 0 0-.54-.31h-3.13a.63.63 0 0 0-.54.31l-1.57 2.72a.63.63 0 0 0 0 .62l1.56 2.72c.12.2.32.31.55.31h3.13c.22 0 .43-.12.54-.31l1.57-2.72a.63.63 0 0 0 0-.62z"/><path opacity=".6" d="M25.45 41.24l-1.57-2.71a.63.63 0 0 0-.54-.31h-3.13a.63.63 0 0 0-.54.3l-1.57 2.72a.63.63 0 0 0 0 .63l1.56 2.72c.12.2.32.31.55.31h3.13c.22 0 .43-.12.54-.31l1.57-2.72a.63.63 0 0 0 0-.63z"/><path opacity=".8" d="M39.12 33.35l-1.56-2.72a.63.63 0 0 0-.55-.31h-3.13a.63.63 0 0 0-.54.31l-1.57 2.72a.63.63 0 0 0 0 .62l1.57 2.72c.1.2.32.31.54.31h3.13c.23 0 .43-.12.54-.31l1.57-2.72a.62.62 0 0 0 0-.62z"/><path opacity=".6" d="M39.12 41.24l-1.56-2.71a.63.63 0 0 0-.55-.31h-3.13a.63.63 0 0 0-.54.3l-1.57 2.72a.63.63 0 0 0 0 .63l1.57 2.72c.1.2.32.31.54.31H37c.23 0 .43-.12.54-.31l1.57-2.72a.62.62 0 0 0 0-.63z"/></g><defs><radialGradient id="paint0_radial" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(-54.6465 0 0 -93.2842 56.32 95.14)"><stop stop-color="#EC991C"/><stop offset="1" stop-color="#E9B213"/></radialGradient><clipPath id="clip0"><path fill="#fff" transform="translate(11.05 8.53)" d="M0 0h35.81v4.33H0z"/></clipPath></defs></svg>
                    </div>
                </div>
                <div class="topic">
                    <div class="topic-visual qr-code"><ScanQrCodeIcon/></div>
                    <p class="topic-text">
                        {{ $t('Create and scan QR codes to quickly share addresses.') }}
                    </p>
                </div>

                <a href="https://medium.com/nimiq-network/the-biggest-release-since-mainnet-launch-f8096e33dab9" target="_blank" class="nq-link link-read-article">
                    {{ $t("There's much more. Read the full article") }} <ArrowRightSmallIcon/>
                </a>
            </PageBody>

            <PageFooter key="intro-footer">
                <button class="nq-button light-blue" @click="page = 'accounts'">{{ $t('Prepare for update') }}</button>
            </PageFooter>
        </SmallPage>

        <SmallPage v-else-if="page === 'accounts'" class="accounts">
            <PageHeader backArrow @back="page = 'intro'; backupsAreSafe = false;">
                {{ $tc('Check your Backup | Check your Backups', legacyAccounts.length) }}
                <p slot="more" class="nq-notice warning">
                    {{ $t('The update is easy, fast and secure. Still – it’s a good time to check on your Recovery Words.') }}
                </p>
            </PageHeader>
            <PageBody>
                <div v-for="account in legacyAccounts" :key="account.userFriendlyAddress" class="account">
                    <Identicon :address="account.userFriendlyAddress"/>
                    <div class="meta">
                        <div class="label">{{account.label}}</div>
                        <Amount v-if="account.balance !== undefined" :amount="account.balance" :decimals="0"/>
                    </div>
                    <button
                        class="nq-button-s"
                        :class="{'green': account.isBackedUp}"
                        @click="startExportForAddress(account.userFriendlyAddress)">
                        <svg v-if="account.isBackedUp" width="12" height="11" viewBox="0 0 12 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M10.5 1.9l-5.8 8-3-3.1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        {{ account.isBackedUp ? $t('Backed Up') : $t('Back Up') }}
                    </button>
                </div>
            </PageBody>

            <PageFooter key="accounts-footer">
                <transition name="transition-fade" mode="out-in">
                    <div v-if="!backupsAreSafe" class="nq-light-blue-bg check-box">
                        <label>
                            <input type="checkbox" v-model="backupsAreSafe">
                            <div class="checkcircle"><CheckmarkIcon/></div>
                            {{ $t('My Backups are safe.') }}
                        </label>
                    </div>
                    <button v-else class="nq-button light-blue activate" @click="runMigration">{{ $t('Activate update') }}</button>
                </transition>
            </PageFooter>
        </SmallPage>

        <SmallPage v-else class="migration">
            <StatusScreen
                lightBlue
                :title="title"
                :status="status"
                :state="state"
                :message="message"
                :mainAction="$t('Try again')"
                @main-action="tryAgain"
            />
        </SmallPage>
    </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { AccountInfo, AccountInfoEntry } from '@/lib/AccountInfo';
import { WalletStore } from '@/lib/WalletStore';
import { WalletInfo, WalletType } from '@/lib/WalletInfo';
import {
    SmallPage, PageHeader, PageBody, PageFooter,
    AccountRing, Identicon, Amount,
    ScanQrCodeIcon, ArrowRightSmallIcon, CheckmarkIcon,
} from '@nimiq/vue-components';
import Network from '@/components/Network.vue';
import StatusScreen from '@/components/StatusScreen.vue';
import KeyguardClient from '@nimiq/keyguard-client';
import { ACCOUNT_DEFAULT_LABEL_LEGACY } from '@/lib/Constants';
import { ContractInfo } from '@/lib/ContractInfo';
import staticStore, { Static } from '@/lib/StaticStore';
import { SimpleRequest, RequestType } from '../../client/PublicRequestTypes';
import { State } from 'vuex-class';
import { i18n } from '../i18n/i18n-setup';

type SerializedAccount = {
    path: string;
    label: string;
    address: string;
    balance?: number;
    isBackedUp?: boolean;
};

@Component({components: {
    SmallPage, PageHeader, PageBody, PageFooter,
    AccountRing, Identicon, Amount,
    ScanQrCodeIcon, ArrowRightSmallIcon, CheckmarkIcon,
    StatusScreen, Network,
}})
export default class Migrate extends Vue {
    @Static private request!: SimpleRequest;
    @Static private keyguardRequest?: KeyguardClient.ExportRequest;
    @State private keyguardResult?: KeyguardClient.ExportResult;

    private page: 'intro' | 'accounts' | 'migration' = 'intro';
    private backupsAreSafe: boolean = false;

    private title: string = i18n.t('Updating your Accounts') as string;
    private status: string = i18n.t('Connecting to Keyguard...') as string;
    private state: StatusScreen.State = StatusScreen.State.LOADING;
    private message: string = '';

    private legacyAccounts: AccountInfo[] = [];

    private LOCALSTORAGE_ACCOUNTS_KEY = '__legacy_accounts';

    public async created() {
        try {
            this.legacyAccounts = this.readAccountsCache(); // Throws when none stored
            this.page = 'accounts';
            console.debug('From LocalStorage');

            if (this.keyguardRequest
                && this.keyguardResult
                && !(this.keyguardResult instanceof Error)
                && this.keyguardResult.wordsExported
            ) {
                // Find account that was exported
                const exportedAccount = this.legacyAccounts.find(
                    (account) => account.userFriendlyAddress === this.keyguardRequest!.keyId,
                )!;
                exportedAccount.isBackedUp = true;
                this.storeAccountsCache();
            }
        } catch (e) {} // tslint:disable-line:no-empty

        if (!this.legacyAccounts.length) {
            const legacyKeys = await this.$rpc.keyguardClient.listLegacyAccounts();
            this.legacyAccounts = legacyKeys.map((key) => this.legacyKeyInfoObject2AccountInfo(key));
            this.storeAccountsCache();
            console.debug('From Keyguard');
        }
    }

    @Watch('legacyAccounts')
    private async getBalances() {
        // Get balances from network
        const network = (this.$refs.network as Network);
        const balances: Map<string, number> = await network.getBalances(
            this.legacyAccounts.map((account) => account.userFriendlyAddress));
        console.log(balances);

        // Update legacyAccounts array
        this.legacyAccounts.forEach((account) => {
            const balance = balances.get(account.userFriendlyAddress);
            account.balance = balance !== undefined ? Nimiq.Policy.coinsToSatoshis(balance) : balance;
        });
        this.storeAccountsCache();
    }

    private startExportForAddress(address: string) {
        const request: KeyguardClient.ExportRequest = {
            appName: this.request.appName,
            keyId: address,
            keyLabel: '',
        };

        staticStore.keyguardRequest = request;

        const client = this.$rpc.createKeyguardClient();
        client.export(request);
    }

    private async runMigration() {
        try {
            await this.doMigration();
        } catch (error) {
            this.onError(error);
        }
    }

    private async doMigration() {
        this.page = 'migration';

        this.status = this.$t('Retrieving your old accounts...') as string;
        const legacyAccounts = await this.$rpc.keyguardClient.listLegacyAccounts();

        if (!legacyAccounts.length) {
            this.deleteAccountsCache();
            this.title = this.$t('Nothing to update.') as string;
            this.state = StatusScreen.State.SUCCESS;
            setTimeout(() => this.$rpc.resolve([]), StatusScreen.SUCCESS_REDIRECT_DELAY);
            return;
        }

        this.status = this.$t('Detecting vesting contracts...') as string;
        const genesisVestingContracts = await (this.$refs.network as Network).getGenesisVestingContracts();

        this.status = this.$t('Storing your new accounts...') as string;
        // For the wallet ID derivation to work, the ID derivation and storing of new wallets needs
        // to happen serially, e.g. synchroneous.
        const walletInfos: WalletInfo[] = [];
        for (const keyInfo of legacyAccounts) {
            const accountInfo = this.legacyKeyInfoObject2AccountInfo(keyInfo);
            const accounts = new Map<string, AccountInfo>([
                [accountInfo.userFriendlyAddress, accountInfo],
            ]);

            const contracts = genesisVestingContracts.filter((contract) => contract.owner.equals(accountInfo.address));

            const walletInfo = new WalletInfo(
                await WalletStore.Instance.deriveId(keyInfo.id),
                keyInfo.id,
                ACCOUNT_DEFAULT_LABEL_LEGACY,
                accounts,
                contracts,
                WalletType.LEGACY,
                /* keyMissing */ false,
                /* fileExported */ false,
                /* wordsExported */ true,
            );

            await WalletStore.Instance.put(walletInfo);

            walletInfos.push(walletInfo);
        }

        this.status = this.$t('Updating Keyguard...') as string;
        await this.$rpc.keyguardClient.migrateAccountsToKeys();
        this.deleteAccountsCache();

        this.title = this.$t('Accounts updated!') as string;
        this.state = StatusScreen.State.SUCCESS;
        const listResult = walletInfos.map((walletInfo) => walletInfo.toAccountType());
        setTimeout(() => this.$rpc.resolve(listResult), StatusScreen.SUCCESS_REDIRECT_DELAY);
    }

    private onError(error: Error) {
        this.title = this.$t('Whoops, something went wrong') as string;
        this.message = `${error.name}: ${error.message}`;
        this.state = StatusScreen.State.ERROR;
        if (this.$captureException) {
            this.$captureException(error);
        }
    }

    private tryAgain() {
        this.title = this.$t('Updating your Accounts') as string;
        this.status = this.$t('Connecting to Keyguard...') as string;
        this.state = StatusScreen.State.LOADING;
        setTimeout(() => this.runMigration(), 1000);
    }

    private legacyKeyInfoObject2AccountInfo(keyInfo: KeyguardClient.LegacyKeyInfoObject): AccountInfo {
        return new AccountInfo(
            'm/0\'',
            keyInfo.legacyAccount.label,
            new Nimiq.Address(keyInfo.legacyAccount.address),
        );
    }

    private serializeAccounts(accounts: AccountInfo[]): string {
        return JSON.stringify(accounts.map((account): SerializedAccount => {
            const entry = account.toObject();
            return {
                ...entry,
                address: Nimiq.BufferUtils.toBase64(entry.address),
                isBackedUp: account.isBackedUp,
            };
        }));
    }

    private deserializeAccounts(storedAccounts: string): AccountInfo[] {
        return JSON.parse(storedAccounts).map((entry: SerializedAccount) => {
            const accountInfo = AccountInfo.fromObject({
                ...entry,
                address: Nimiq.BufferUtils.fromBase64(entry.address),
            });
            accountInfo.isBackedUp = entry.isBackedUp;
            return accountInfo;
        });
    }

    private storeAccountsCache() {
        window.localStorage.setItem(this.LOCALSTORAGE_ACCOUNTS_KEY, this.serializeAccounts(this.legacyAccounts));
    }

    private readAccountsCache(): AccountInfo[] {
        const storedAccounts = window.localStorage.getItem(this.LOCALSTORAGE_ACCOUNTS_KEY);
        if (!storedAccounts) throw new Error('No accounts cached');
        return this.deserializeAccounts(storedAccounts);
    }

    private deleteAccountsCache() {
        window.localStorage.removeItem(this.LOCALSTORAGE_ACCOUNTS_KEY);
    }
}
</script>

<style scoped>
    .intro .page-body {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding-left: 5rem;
        padding-right: 5rem;
    }

    .topic {
        display: flex;
        flex-direction: row;
        align-items: center;
    }

    .topic-visual {
        flex-shrink: 0;
        width: 8rem;
        height: 8rem;
        border-radius: .5rem;
        margin-top: -1rem;
        margin-bottom: -1rem;
        margin-right: 3rem;
    }

    .topic-text {
        margin: 0;
        font-size: 2rem;
        line-height: 1.3;
    }

    .topic-text + .topic-visual {
        margin-right: 0;
        margin-left: 2rem; /* Less than the right margin, to fit in Firefox */
    }

    .topic-visual .account-ring {
        width: 100%;
        height: 100%;
    }

    .topic-visual.login-file {
        width: 6.875rem;
        height: 11.75rem;
        margin-top: -2.875rem;
        margin-bottom: -2.875rem;
    }

    .topic-visual.login-file svg {
        width: 100%;
        height: 100%;
    }

    .topic-visual.qr-code {
        font-size: 7.25rem;
        padding: .375rem;
        opacity: .4;
    }

    .link-read-article {
        font-size: 2rem;
        font-weight: bold;
        align-self: center;
    }

    .link-read-article .nq-icon {
        vertical-align: middle;
        width: 1.375rem;
        height: 1.125rem;
        margin-top: -0.125rem;
        transition: transform .3s cubic-bezier(0.25, 0, 0, 1);
    }

    .link-read-article:hover .nq-icon,
    .link-read-article:focus .nq-icon {
        transform: translate3D(0.25rem, 0, 0);
    }

    .accounts .page-body {
        margin-top: -2rem;
        padding-top: 0;
        padding-bottom: 0;
        mask-image: linear-gradient(0deg , rgba(255,255,255,0), rgba(255,255,255, 1) 4rem, rgba(255,255,255,1) calc(100% - 4rem), rgba(255,255,255,0));
    }

    .account {
        display: flex;
        flex-direction: row;
        justify-content: flex-start;
        align-items: center;
        margin: 4rem 0;
    }

    .account .identicon {
        width: 6.25rem;
        height: 6.25rem;
        margin-right: 2rem;
        flex-shrink: 0;
    }

    .account .meta {
        flex-grow: 1;
        min-width: 0;
    }

    .account .label {
        font-size: 2.25rem;
        line-height: 3rem;
        font-weight: bold;
        white-space: nowrap;
        overflow: hidden;
        max-width: 100%;
        mask-image: linear-gradient(90deg , white, white calc(100% - 3rem), rgba(255,255,255, 0));
    }

    .account .amount {
        display: block;
        font-size: 1.75rem;
        line-height: 2rem;
        font-weight: 600;
        opacity: .5;
    }

    .account .nq-button-s {
        margin-left: 1rem;
        flex-shrink: 0;
    }

    .account .nq-button-s svg {
        margin-right: 0.25rem;
    }

    .page-footer .nq-button {
        margin-top: 1rem;
    }

    .check-box {
        width: 100%;
        padding: 2.5rem;
        border-radius: .5rem;
        font-size: 2.375rem;
        font-weight: 600;
        text-align: center;
        position: relative;
    }

    .check-box {
        transition: opacity .5s .5s ease-in;
    }

    .nq-button.activate {
        transition:
            transform 450ms cubic-bezier(.25,0,0,1),
            box-shadow 450ms cubic-bezier(.25,0,0,1),
            opacity 450ms cubic-bezier(.25,0,0,1);
    }

    .check-box input {
        position: absolute;
        left: -9999rem;
        opacity: 0;
    }

    .check-box label {
        display: inline-flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
        padding: 1.5rem 2.5rem;
        cursor: pointer;
        border-radius: 4rem;
    }

    .check-box .checkcircle {
        border: solid .25rem rgba(255, 255, 255, 0.6);
        border-radius: 50%;
        width: 3.5rem;
        height: 3.5rem;
        margin-right: 2rem;
        position: relative;
        flex-shrink: 0;
    }

    .check-box .checkcircle .nq-icon {
        display: none;
    }

    .check-box .checkcircle::after {
        content: "";
        position: absolute;
        left: -0.875rem;
        top: -0.875rem;
        right: -0.875rem;
        bottom: -0.875rem;
        border: 0.25rem solid rgba(255, 255, 255, 0.6);
        border-radius: 50%;
        opacity: 0;
    }

    .check-box input:focus ~ .checkcircle::after,
    .check-box input:active ~ .checkcircle::after {
        opacity: 1;
    }

    .check-box input:checked ~ .checkcircle {
        background: rgba(255, 255, 255, 0.6);
        border: none;
    }

    .check-box input:checked ~ .checkcircle::after {
        left: -0.625rem;
        top: -0.625rem;
        right: -0.625rem;
        bottom: -0.625rem;
    }

    .check-box input:checked ~ .checkcircle .nq-icon {
        position: absolute;
        display: block;
        font-size: 3rem;
        margin-left: -1.125rem;
        left: 50%;
        bottom: .75rem;
    }

    .transition-fade-enter,
    .transition-fade-leave-to {
        opacity: 0;
    }
</style>
