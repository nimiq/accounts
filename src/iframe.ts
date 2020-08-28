import { RpcServer } from '@nimiq/rpc';
import { BrowserDetection } from '@nimiq/utils';
import { WalletStore } from '@/lib/WalletStore';
import { WalletInfoEntry, WalletInfo } from '@/lib/WalletInfo';
import CookieJar from '@/lib/CookieJar';
import Config from 'config';
import { Account, Cashlink as PublicCashlink, RequestType } from '../client/PublicRequestTypes';
import Cashlink from './lib/Cashlink';
import { CashlinkStore } from './lib/CashlinkStore';

class IFrameApi {
    public static run() {
        const rpcServer = new RpcServer(Config.privilegedOrigins);

        // Register handlers
        rpcServer.onRequest(RequestType.LIST, IFrameApi.list);
        rpcServer.onRequest(RequestType.LIST_CASHLINKS, IFrameApi.cashlinks);

        rpcServer.init();
    }

    public static async list(): Promise<Account[]> {
        let wallets: WalletInfoEntry[];
        if (BrowserDetection.isIOS() || BrowserDetection.isSafari()) {
            wallets = await CookieJar.eat();
        } else {
            wallets = await WalletStore.Instance.list();
        }
        if (wallets.length > 0) {
            return wallets
                .filter((wallet) => !wallet.keyMissing)
                .map((wallet) => WalletInfo.objectToAccountType(wallet));
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
}

IFrameApi.run();
