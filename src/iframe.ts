import { RpcServer, State } from '@nimiq/rpc';
import { BrowserDetection } from '@nimiq/utils';
import { WalletStore } from '@/lib/WalletStore';
import { WalletInfoEntry, WalletInfo } from '@/lib/WalletInfo';
import { WalletType } from './lib/Constants';
import CookieJar from '@/lib/CookieJar';
import Config from 'config';
import {
    Account,
    Cashlink as PublicCashlink,
    RequestType,
    AddBtcAddressesRequest,
    AddBtcAddressesResult,
} from './lib/PublicRequestTypes';
import Cashlink from './lib/Cashlink';
import { CashlinkStore } from './lib/CashlinkStore';
import { loadBitcoinJS } from './lib/bitcoin/BitcoinJSLoader';
import {
    ERROR_NO_XPUB,
    EXTERNAL_INDEX, INTERNAL_INDEX,
    BTC_ACCOUNT_MAX_ALLOWED_ADDRESS_GAP,
    NESTED_SEGWIT,
    NATIVE_SEGWIT,
} from './lib/bitcoin/BitcoinConstants';
import { deriveAddressesFromXPub } from './lib/bitcoin/BitcoinUtils';
import { detectLanguage, setLanguage } from './i18n/i18n-setup';

class IFrameApi {
    public static run() {
        const rpcServer = new RpcServer(Config.privilegedOrigins);

        // Register handlers
        rpcServer.onRequest(RequestType.LIST, IFrameApi.list);
        rpcServer.onRequest(RequestType.LIST_CASHLINKS, IFrameApi.cashlinks);
        rpcServer.onRequest(RequestType.ADD_BTC_ADDRESSES, IFrameApi.addBitcoinAddresses);

        rpcServer.init();
    }

    public static async list(): Promise<Account[]> {
        let wallets: WalletInfoEntry[];
        if (BrowserDetection.isIOS() || BrowserDetection.isSafari()) {
            /*
            ** We need to load the language before the Cookie decoding
            ** since it'll use functions from the LabelingMachine that require the language to be loaded.
            ** Otherwise the label will show up as a number. (translation string index)
            */
            await setLanguage(detectLanguage());
            wallets = await CookieJar.eat();
        } else {
            wallets = await WalletStore.Instance.list();
        }
        if (wallets.length > 0) {
            return Promise.all(wallets
                .filter((wallet) => !wallet.keyMissing)
                .map((wallet) => WalletInfo.objectToAccountType(wallet)));
        }

        // If no wallets exist, see if the Keyguard has keys
        const client = new (await import('@nimiq/keyguard-client')).KeyguardClient(Config.keyguardEndpoint);
        const hasKeys = await client.hasKeys();
        if (hasKeys.success) {
            throw new Error('ACCOUNTS_LOST');
        }

        // If no keys exist, check for legacy accounts
        const hasLegacyAccounts = await client.hasLegacyAccounts();
        if (hasLegacyAccounts.success) {
            throw new Error('MIGRATION_REQUIRED');
        }

        return [];
    }

    public static async cashlinks(): Promise<PublicCashlink[]> {
        // Cashlinks are not stored in cookies on iOS/Safari, because they would take up too much space.
        // TODO: Use Storage Access API on iOS/Safari to access IndexedDB in the iframe.
        if (BrowserDetection.isIOS() || BrowserDetection.isSafari()) return [];

        const cashlinksEntries = await CashlinkStore.Instance.list();
        return cashlinksEntries.map((cashlink) => ({
            address: cashlink.address,
            message: cashlink.message,
            value: cashlink.value,
            status: cashlink.state,
            theme: cashlink.theme || Cashlink.DEFAULT_THEME,
        }));
    }

    public static async addBitcoinAddresses(
        state: State,
        request: AddBtcAddressesRequest,
    ): Promise<AddBtcAddressesResult> {
        // Validate chain
        const chain = request.chain;
        if (!chain || (chain !== 'internal' && chain !== 'external')) {
            throw new Error('Invalid chain');
        }

        // Validate firstIndex
        const firstIndex = request.firstIndex;
        if (typeof firstIndex !== 'number' || firstIndex < 0 || Math.round(firstIndex) !== firstIndex) {
            throw new Error('firstIndex must be a positive integer');
        }

        // Validate accountId
        if (!request.accountId || typeof request.accountId !== 'string') {
            throw new Error('accountId must be a string');
        }

        // Fetch WalletInfo
        let wallets: WalletInfoEntry[];
        if (BrowserDetection.isIOS() || BrowserDetection.isSafari()) {
            wallets = await CookieJar.eat();
        } else {
            wallets = await WalletStore.Instance.list();
        }
        const wallet = wallets.find((entry) => entry.id === request.accountId);
        if (!wallet) {
            throw new Error('Account not found');
        }

        if (wallet.type === WalletType.LEGACY) {
            throw new Error('Cannot add Bitcoin addresses to a legacy account');
        }

        if (!wallet.btcXPub) {
            throw new Error(ERROR_NO_XPUB);
        }

        await loadBitcoinJS();

        const xPubType = ['ypub', 'upub'].includes(wallet.btcXPub.substr(0, 4)) ? NESTED_SEGWIT : NATIVE_SEGWIT;

        const addresses = deriveAddressesFromXPub(
            wallet.btcXPub,
            [chain === 'external' ? EXTERNAL_INDEX : INTERNAL_INDEX],
            firstIndex,
            BTC_ACCOUNT_MAX_ALLOWED_ADDRESS_GAP,
            xPubType,
        ).map((addressInfo) => addressInfo.address);

        return {
            addresses,
        };
    }
}

IFrameApi.run();
