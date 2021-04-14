import { NetworkClient } from '@nimiq/network-client';
import { KeyguardClient, SimpleResult as KeyguardSimpleResult } from '@nimiq/keyguard-client';
import { AccountInfo } from '@/lib/AccountInfo';
import { WalletStore } from '@/lib/WalletStore';
import { WalletInfo } from '@/lib/WalletInfo';
// TODO import only when needed
import LedgerApi, { Coin, getBip32Path, RequestTypeNimiq as LedgerApiRequestType } from '@nimiq/ledger-api';
import { ACCOUNT_BIP32_BASE_PATH_KEYGUARD, ACCOUNT_MAX_ALLOWED_ADDRESS_GAP } from '@/lib/Constants';
import Config from 'config';
import { ERROR_TRANSACTION_RECEIPTS, WalletType } from '../lib/Constants';
import {
    labelAddress,
    labelKeyguardAccount,
    labelLedgerAccount,
    labelLegacyAccount,
    labelVestingContract,
} from './LabelingMachine';
import { VestingContractInfo } from './ContractInfo';
import { BtcAddressInfo } from './bitcoin/BtcAddressInfo';
import { loadBitcoinJS } from './bitcoin/BitcoinJSLoader';
import { getElectrumClient } from './bitcoin/ElectrumClient';
import { Receipt as BtcReceipt } from '@nimiq/electrum-client';
import {
    EXTERNAL_INDEX,
    INTERNAL_INDEX,
    BTC_ACCOUNT_MAX_ALLOWED_ADDRESS_GAP,
    BTC_ACCOUNT_KEY_PATH,
    NESTED_SEGWIT,
    NATIVE_SEGWIT,
} from './bitcoin/BitcoinConstants';
import { deriveAddressesFromXPub, getBtcNetwork, publicKeyToPayment } from './bitcoin/BitcoinUtils';

export type BasicAccountInfo = {
    address: string,
    path: string,
};

export type WalletCollectionResultLedger = {
    walletInfo: WalletInfo,
    receiptsError?: Error, // if there is an incomplete result due to failed requestTxReceipts requests
    hasActivity: boolean, // whether the wallet has a transaction history or a balance or owns a contract
};
export type WalletCollectionResultKeyguard = WalletCollectionResultLedger & {
    releaseKey: (removeKey?: boolean) => Promise<KeyguardSimpleResult | void>,
};

const TEMPORARY_ACCOUNT_LABEL_KEYGUARD = '~~~TEMP~~~';

export default class WalletInfoCollector {
    public static async collectBip39WalletInfo(
        keyId: string,
        initialAccounts: BasicAccountInfo[],
        // tslint:disable-next-line:no-empty
        onUpdate: (walletInfo: WalletInfo, currentlyCheckedAccounts: BasicAccountInfo[]) => void = () => {},
        skipActivityCheck = false,
        bitcoinXPub?: string,
    ): Promise<WalletCollectionResultKeyguard> {
        return WalletInfoCollector._collectLedgerOrBip39WalletInfo(WalletType.BIP39, initialAccounts, onUpdate,
            skipActivityCheck, keyId, bitcoinXPub) as Promise<WalletCollectionResultKeyguard>;
    }

    public static async collectLedgerWalletInfo(
        initialAccounts: BasicAccountInfo[],
        // tslint:disable-next-line:no-empty
        onUpdate: (walletInfo: WalletInfo, currentlyCheckedAccounts: BasicAccountInfo[]) => void = () => {},
        skipActivityCheck = false,
    ): Promise<WalletCollectionResultLedger> {
        return WalletInfoCollector._collectLedgerOrBip39WalletInfo(WalletType.LEDGER, initialAccounts, onUpdate,
            skipActivityCheck);
    }

    public static async collectLegacyWalletInfo(
        keyId: string,
        singleAccount: BasicAccountInfo,
        // tslint:disable-next-line:no-empty
        onUpdate: (walletInfo: WalletInfo, currentlyCheckedAccounts: BasicAccountInfo[]) => void = () => {},
        skipActivityCheck = false,
    ): Promise<WalletCollectionResultKeyguard> {
        // Kick off loading dependencies
        WalletInfoCollector._initializeDependencies(WalletType.LEGACY);

        // Get or create the walletInfo instance
        const walletInfo = await WalletInfoCollector._getWalletInfoInstance(WalletType.LEGACY, keyId);
        const singleAccountAsArray = [singleAccount];

        WalletInfoCollector._addAccounts(walletInfo, singleAccountAsArray);
        onUpdate(walletInfo, singleAccountAsArray);

        const contracts = await WalletInfoCollector._addVestingContracts(walletInfo, singleAccount, onUpdate);
        let hasActivity = contracts.length > 0;

        if (!skipActivityCheck && !hasActivity) {
            const balances = await WalletInfoCollector._getBalances([singleAccount]);
            WalletInfoCollector._addAccounts(walletInfo, singleAccountAsArray, balances);
            onUpdate(walletInfo, []);
            hasActivity = balances.get(singleAccount.address)! > 0
                || (await WalletInfoCollector._networkInitializationPromise!
                    .then(() => NetworkClient.Instance.requestTransactionReceipts(singleAccount.address, 1)))
                    .length > 0;
        }

        return {
            walletInfo,
            hasActivity,
            releaseKey: async (removeKey?) => {
                if (!WalletInfoCollector._keyguardClient) {
                    if (removeKey) {
                        // make sure to create a keyguardClient to be able to remove the key
                        WalletInfoCollector._initializeKeyguardClient();
                    } else {
                        // Simply return as legacy keys don't neccessarily need to be released.
                        // Only a temporary flag in the keyguard session storage is left over by not releasing.
                        return;
                    }
                }
                return WalletInfoCollector._keyguardClient!.releaseKey(keyId, removeKey);
            },
        };
    }

    public static async detectBitcoinAddresses(xpub: string, startIndex = 0): Promise<{
        internal: BtcAddressInfo[],
        external: BtcAddressInfo[],
    }> {
        const [electrum] = await Promise.all([
            getElectrumClient(),
            loadBitcoinJS(),
        ]);

        const xPubType = ['ypub', 'upub'].includes(xpub.substr(0, 4)) ? NESTED_SEGWIT : NATIVE_SEGWIT;

        const network = getBtcNetwork(xPubType);
        const extendedKey = BitcoinJS.bip32.fromBase58(xpub, network);

        /**
         * According to https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki#account-discovery
         * wallets should only scan external addresses for activity, as internal addresses can only receive
         * transactions from external addresses of the same wallet anyway and will thus be discovered when
         * parsing the external tx history. Since we only check for receipts in this address detection step,
         * we cannot find out which internal addresses specifically have been used yet.
         * At the end of the detection, we will simply return the same number of internal addresses as we
         * return external ones, and the wallet can then find out which of those have been used by checking
         * the actual transactions against the internal addresses. The wallet can then derive additional
         * internal addresses via the iframe request if necessary.
         */

        const addresses: [BtcAddressInfo[], BtcAddressInfo[]] = [[], []];

        for (const INDEX of [EXTERNAL_INDEX, INTERNAL_INDEX]) {
            const baseKey = extendedKey.derive(INDEX);
            const basePath = `${BTC_ACCOUNT_KEY_PATH[xPubType][Config.bitcoinNetwork]}/${INDEX}`;

            let gap = 0;
            let i = startIndex;

            while (gap < BTC_ACCOUNT_MAX_ALLOWED_ADDRESS_GAP) {
                const pubKey = baseKey.derive(i).publicKey;

                const address = publicKeyToPayment(pubKey, xPubType).address;
                if (!address) throw new Error(`Cannot create external address for ${xpub} index ${i}`);

                // Check address balance
                const balances = await electrum.getBalance(address);
                const balance = balances.confirmed + balances.unconfirmed;

                // If no balance, then check tx activity
                const receipts = !balance
                    ? await electrum.getTransactionReceiptsByAddress(address)
                    : [] as BtcReceipt[];

                const used = balance > 0 || receipts.length > 0;

                addresses[INDEX].push(new BtcAddressInfo(
                    `${basePath}/${i}`,
                    address,
                    used,
                    balance,
                ));

                if (used) {
                    gap = 0;
                } else {
                    gap += 1;
                }

                i += 1;
            }
        }

        return {
            internal: addresses[INTERNAL_INDEX],
            external: addresses[EXTERNAL_INDEX],
        };
    }

    private static _keyguardClient?: KeyguardClient; // TODO avoid the need to create another KeyguardClient here
    private static _networkInitializationPromise?: Promise<void>;

    private static async _collectLedgerOrBip39WalletInfo(
        walletType: WalletType,
        initialAccounts: BasicAccountInfo[] = [],
        // tslint:disable-next-line:no-empty
        onUpdate: (walletInfo: WalletInfo, currentlyCheckedAccounts: BasicAccountInfo[]) => void,
        skipActivityCheck: boolean,
        keyId?: string,
        bitcoinXPub?: string,
    ): Promise<WalletCollectionResultKeyguard | WalletCollectionResultLedger> {
        if (walletType !== WalletType.LEDGER && walletType !== WalletType.BIP39) {
            throw new Error('Unsupported wallet type');
        }

        // Kick off loading dependencies
        WalletInfoCollector._initializeDependencies(walletType);

        if (!keyId && walletType === WalletType.LEDGER) {
            keyId = await LedgerApi.Nimiq.getWalletId();
        }

        // Kick off first round of account derivation
        let startIndex = 0;
        let derivedAccountsPromise = WalletInfoCollector._deriveAccounts(startIndex,
            ACCOUNT_MAX_ALLOWED_ADDRESS_GAP, walletType, keyId);

        try {
            await loadBitcoinJS();
            // Start BTC address detection
            const bitcoinAddresses: {
                internal: BtcAddressInfo[],
                external: BtcAddressInfo[],
            } = bitcoinXPub ? {
                external: deriveAddressesFromXPub(
                    bitcoinXPub,
                    [EXTERNAL_INDEX],
                    0,
                    BTC_ACCOUNT_MAX_ALLOWED_ADDRESS_GAP,
                ),
                internal: deriveAddressesFromXPub(
                    bitcoinXPub,
                    [INTERNAL_INDEX],
                    0,
                    BTC_ACCOUNT_MAX_ALLOWED_ADDRESS_GAP,
                ),
            } : {
                external: [],
                internal: [],
            };

            // Get or create the walletInfo instance and derive the first set of derived accounts
            const [walletInfo, firstSetOfDerivedAccounts] = await Promise.all([
                WalletInfoCollector._getWalletInfoInstance(walletType, keyId!),
                derivedAccountsPromise,
            ]);

            // Add initial accounts to the walletInfo
            if (initialAccounts.length > 0) {
                WalletInfoCollector._addAccounts(walletInfo, initialAccounts);
            }
            onUpdate(walletInfo, firstSetOfDerivedAccounts);

            // This path is only called for LEDGER or BIP39 accounts, but
            // BIP39 accounts cannot have vesting contracts because they
            // did not exist at mainnet launch.
            const contracts = walletType === WalletType.LEDGER
                ? await WalletInfoCollector._addVestingContracts(walletInfo, firstSetOfDerivedAccounts[0], onUpdate)
                : [];
            let hasActivity = contracts.length > 0;

            // Label Keyguard BIP39 accounts according to their first identicon background color
            if (walletType === WalletType.BIP39 && walletInfo.label === TEMPORARY_ACCOUNT_LABEL_KEYGUARD) {
                walletInfo.label = labelKeyguardAccount(firstSetOfDerivedAccounts[0].address);
            }

            let foundAccounts: BasicAccountInfo[];
            let receiptsError;
            do {
                const derivedAccounts = await derivedAccountsPromise;

                // already start deriving next accounts
                // By always advancing in groups of MAX_ALLOWED_GAP addresses per round, it often happens that more
                // addresses are derived and checked for activity than the BIP44 address gap limit
                // (https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki#address-gap-limit) stipulates,
                // because whenever an active address in a group of addresses is found, the next full group is also
                // derived. Thus the actual gap limit of this implementation is up to (2 x MAX_ALLOWED_GAP) - 1.
                // We argue that this is good UX for users, as potentially more of their active addresses are found,
                // even if they haven't strictly followed to the standard - at only a relatively small cost to the
                // network. For example, if the user adds the accounts derived with indices 0, 19, 39 to his wallet but
                // then only ends up using accounts 0 and 39, the account at index 19 will not be found anymore on
                // reimport. With the current implementation however, at least the account 39 would be found, while an
                // implementation strictly following the specification would stop the search at index 19.
                startIndex += ACCOUNT_MAX_ALLOWED_ADDRESS_GAP;
                derivedAccountsPromise = WalletInfoCollector._deriveAccounts(startIndex,
                    ACCOUNT_MAX_ALLOWED_ADDRESS_GAP, walletType, keyId);

                // Already add addresses that are in the initialAccounts
                foundAccounts = derivedAccounts.filter((derived) =>
                    initialAccounts.some((initial) => initial.address === derived.address));
                let accountsToCheck = skipActivityCheck || hasActivity
                    ? derivedAccounts.filter((derived) =>
                        !initialAccounts.some((initial) => initial.address === derived.address))
                    : derivedAccounts;

                const balances = await WalletInfoCollector._getBalances(accountsToCheck);
                for (const account of accountsToCheck) {
                    const balance = balances.get(account.address);
                    if (balance !== undefined && balance !== 0) {
                        foundAccounts.push(account);
                        hasActivity = true;
                    }
                }

                // for accounts with balance 0 check if there are transactions
                accountsToCheck = skipActivityCheck || hasActivity
                    ? accountsToCheck.filter((account) =>
                        !foundAccounts.some((foundAccount) => foundAccount.address === account.address))
                    : accountsToCheck; // did not find any activity, have to check all accounts
                await Promise.all(
                    accountsToCheck.map(async (account) => {
                        try {
                            await WalletInfoCollector._networkInitializationPromise;
                            const receipts = await NetworkClient.Instance
                                .requestTransactionReceipts(account.address, 1);
                            if (receipts.length > 0) {
                                foundAccounts.push(account);
                                hasActivity = true;
                            }
                        } catch (error) {
                            if (!error.message.startsWith(ERROR_TRANSACTION_RECEIPTS)) {
                                throw error;
                            }
                            receiptsError = error;
                            console.debug(error);
                        }
                    }),
                );

                if (foundAccounts.length > 0) {
                    WalletInfoCollector._addAccounts(walletInfo, foundAccounts, balances);
                    onUpdate(walletInfo, await derivedAccountsPromise);
                }
            } while (foundAccounts.length > 0);

            const releaseKey = walletType === WalletType.BIP39
                ? (removeKey?: boolean) => WalletInfoCollector._keyguardClient!.releaseKey(keyId!, removeKey)
                : undefined;

            // Note that for Bitcoin we don't catch sync errors as receiptErrors which are only to be handled optionally
            // but throw instead as for Bitcoin it is important to complete a full sync to avoid address re-use.
            walletInfo.btcXPub = bitcoinXPub;
            walletInfo.btcAddresses = bitcoinAddresses;
            hasActivity = hasActivity || bitcoinAddresses.external.some((btcAddressInfo) => btcAddressInfo.used);

            return {
                walletInfo,
                receiptsError,
                releaseKey,
                hasActivity,
            };
        } finally {
            // cancel derivation of addresses that we don't need anymore if we're finished or an exception occurred
            if (walletType === WalletType.LEDGER) {
                derivedAccountsPromise.catch(() => undefined); // to avoid uncaught promise rejection on cancel
                LedgerApi.disconnect(
                    /* cancelRequest */ true,
                    /* requestTypesToDisconnect */ [
                        LedgerApiRequestType.GET_WALLET_ID,
                        LedgerApiRequestType.DERIVE_ADDRESSES,
                    ],
                );
            }
        }
    }

    private static _initializeDependencies(walletType: WalletType): void {
        WalletInfoCollector._networkInitializationPromise = WalletInfoCollector._networkInitializationPromise
            || (NetworkClient.hasInstance()
                    ? NetworkClient.Instance.init() // initialize in case it's not initialized yet
                    : NetworkClient.createInstance(Config.networkEndpoint).init()
            );
        WalletInfoCollector._networkInitializationPromise
            .catch(() => delete WalletInfoCollector._networkInitializationPromise);
        if (walletType === WalletType.BIP39) this._initializeKeyguardClient();
    }

    private static _initializeKeyguardClient() {
        WalletInfoCollector._keyguardClient = WalletInfoCollector._keyguardClient
            || new KeyguardClient(Config.keyguardEndpoint);
    }

    private static async _getWalletInfoInstance(walletType: WalletType, keyId: string): Promise<WalletInfo> {
        const walletId = await WalletStore.Instance.deriveId(keyId);

        const existingWalletInfo = await WalletStore.Instance.get(walletId);
        if (existingWalletInfo) {
            existingWalletInfo.keyMissing = false;
            return existingWalletInfo;
        }

        const label = walletType === WalletType.LEGACY
            ? labelLegacyAccount()
            : walletType === WalletType.BIP39
                ? TEMPORARY_ACCOUNT_LABEL_KEYGUARD
                : labelLedgerAccount();
        return new WalletInfo(
            walletId,
            keyId,
            label,
            new Map<string, AccountInfo>(),
            [],
            walletType,
            false,
        );
    }

    private static async _deriveAccounts(startIndex: number, count: number, walletType: WalletType, keyId?: string)
        : Promise<BasicAccountInfo[]> {
        switch (walletType) {
            case WalletType.LEGACY:
                throw new Error('Legacy Wallets can not derive accounts.');
            case WalletType.BIP39:
                if (!keyId) throw new Error('keyId required for Keyguard account derivation.');
                return WalletInfoCollector._deriveKeyguardAccounts(startIndex, count, keyId);
            case WalletType.LEDGER:
                return WalletInfoCollector._deriveLedgerAccounts(startIndex, count);
            default:
                throw new Error('Unsupported walletType.');
        }
    }

    private static async _deriveKeyguardAccounts(startIndex: number, count: number, keyId: string)
        : Promise<BasicAccountInfo[]> {
        const pathsToDerive = [];
        for (let index = startIndex; index < startIndex + count; ++index) {
            pathsToDerive.push(`${ACCOUNT_BIP32_BASE_PATH_KEYGUARD}${index}'`);
        }
        const derivedAddresses = await WalletInfoCollector._keyguardClient!.deriveAddresses(keyId, pathsToDerive);
        const userFriendlyAddresses = derivedAddresses.map((derivedAddress) =>
            new Nimiq.Address(derivedAddress.address).toUserFriendlyAddress());
        const accounts = [];
        for (let i = 0; i < pathsToDerive.length; ++i) {
            accounts.push({
                path: pathsToDerive[i],
                address: userFriendlyAddresses[i],
            });
        }
        return accounts;
    }

    private static async _deriveLedgerAccounts(startIndex: number, count: number): Promise<BasicAccountInfo[]> {
        const pathsToDerive = [];
        for (let index = startIndex; index < startIndex + count; ++index) {
            pathsToDerive.push(getBip32Path({
                coin: Coin.NIMIQ,
                addressIndex: index,
            }));
        }
        return (await LedgerApi.Nimiq.deriveAddresses(pathsToDerive)).map((address) => ({
            path: address.keyPath,
            address: address.address,
        }));
    }

    private static async _getBalances(accounts: BasicAccountInfo[]): Promise<Map<string, number>> {
        const userFriendlyAddresses = accounts.map((account) => account.address);
        await WalletInfoCollector._networkInitializationPromise;
        const balances = await NetworkClient.Instance.getBalance(userFriendlyAddresses);
        for (const [address, balance] of balances) {
            balances.set(address, Nimiq.Policy.coinsToSatoshis(balance));
        }
        return balances;
    }

    private static _addAccounts(
        walletInfo: WalletInfo,
        newAccounts: BasicAccountInfo[],
        balances?: Map<string, number>,
    ): void {
        for (const newAccount of newAccounts) {
            const existingAccountInfo = walletInfo.accounts.get(newAccount.address);
            const balance = balances ? balances.get(newAccount.address) : undefined;
            const accountInfo = existingAccountInfo || new AccountInfo(
                newAccount.path,
                labelAddress(newAccount.address),
                Nimiq.Address.fromString(newAccount.address),
            );
            if (balance !== undefined) accountInfo.balance = balance;
            walletInfo.accounts.set(newAccount.address, accountInfo);
        }
    }

    private static async _addVestingContracts(
        walletInfo: WalletInfo,
        potentialOwner: BasicAccountInfo,
        onUpdate: (walletInfo: WalletInfo, currentlyCheckedAccounts: BasicAccountInfo[]) => void,
    ): Promise<VestingContractInfo[]> {
        if (walletInfo.type !== WalletType.LEGACY && walletInfo.type !== WalletType.LEDGER) {
            // Only legacy or a first Ledger addresses can be owners of genesis vesting contracts
            return [];
        }

        await WalletInfoCollector._networkInitializationPromise;
        const genesisVestingContracts = (await NetworkClient.Instance.getGenesisVestingContracts())
            .map((contract) => new VestingContractInfo(
                labelVestingContract(),
                Nimiq.Address.fromString(contract.address),
                Nimiq.Address.fromString(contract.owner),
                contract.start,
                Nimiq.Policy.coinsToSatoshis(contract.stepAmount),
                contract.stepBlocks,
                Nimiq.Policy.coinsToSatoshis(contract.totalAmount),
            ));

        const potentialVestingOwnerAddress = Nimiq.Address.fromString(potentialOwner.address);
        const contracts = genesisVestingContracts
            .filter((contract) => contract.owner.equals(potentialVestingOwnerAddress));

        for (const newContract of contracts) {
            const existingContract = walletInfo.findContractByAddress(newContract.address);
            if (!existingContract) {
                walletInfo.contracts.push(newContract);
            }
        }

        if (contracts.length > 0) {
            // make sure the vesting owner is added to the account too
            WalletInfoCollector._addAccounts(walletInfo, [potentialOwner]);
            onUpdate(walletInfo, []);
        }

        return contracts;
    }
}
