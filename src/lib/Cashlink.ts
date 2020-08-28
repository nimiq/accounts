import { Utf8Tools } from '@nimiq/utils';
import { DetailedPlainTransaction, NetworkClient } from '@nimiq/network-client';
import { loadNimiq } from './Helpers';
import { CashlinkState, CashlinkTheme } from '../../client/PublicRequestTypes';

export const CashlinkExtraData = {
    FUNDING:  new Uint8Array([0, 130, 128, 146, 135]), // 'CASH'.split('').map(c => c.charCodeAt(0) + 63)
    CLAIMING: new Uint8Array([0, 139, 136, 141, 138]), // 'LINK'.split('').map(c => c.charCodeAt(0) + 63)
};

export interface CashlinkEntry {
    address: string;
    keyPair: Uint8Array;
    value: number;
    fee?: number;
    message: string;
    state: CashlinkState;
    timestamp: number;
    theme?: CashlinkTheme;
    contactName?: string; /** unused for now */
}

class Cashlink {
    get value() {
        return this._value || 0;
    }

    set value(value: number) {
        if (this._value && (this._immutable || this.state !== CashlinkState.UNCHARGED)) {
            throw new Error('Cannot set value, Cashlink is immutable');
        }
        if (!Nimiq.NumberUtils.isUint64(value) || value === 0) throw new Error('Malformed Cashlink value');
        this._value = value;
    }

    set fee(fee: number) {
        if (this.state === CashlinkState.CLAIMED) {
            console.warn('Setting a fee will typically have no effect anymore as Cashlink is already claimed');
        }
        this._fee = fee;
    }

    get fee() {
        return this._fee || 0;
    }

    get message() {
        return Utf8Tools.utf8ByteArrayToString(this._messageBytes);
    }

    set message(message: string) {
        if (this._messageBytes.byteLength && (this._immutable || this.state !== CashlinkState.UNCHARGED)) {
            throw new Error('Cannot set message, Cashlink is immutable');
        }
        const messageBytes = Utf8Tools.stringToUtf8ByteArray(message);
        if (!Nimiq.NumberUtils.isUint8(messageBytes.byteLength)) throw new Error('Cashlink message is too long');
        this._messageBytes = messageBytes;
    }

    get theme() {
        return this._theme || Cashlink.DEFAULT_THEME;
    }

    set theme(theme: CashlinkTheme) {
        if (this._theme && (this._immutable || this.state !== CashlinkState.UNCHARGED)) {
            throw new Error('Cannot set theme, Cashlink is immutable');
        }
        if (!Object.values(CashlinkTheme).includes(theme) || !Nimiq.NumberUtils.isUint8(theme)) {
            throw new Error('Unsupported theme');
        }
        this._theme = theme;
    }

    get hasEncodedTheme() {
        return !!this._theme;
    }

    set networkClient(client: NetworkClient) {
        this._networkClientResolver(client);
    }

    public static async create(): Promise<Cashlink> {
        await loadNimiq();
        const keyPair = Nimiq.KeyPair.derive(Nimiq.PrivateKey.generate());
        return new Cashlink(keyPair, keyPair.publicKey.toAddress());
    }

    public static async parse(str: string): Promise<Cashlink | null> {
        if (!str) return null;
        try {
            str = str.replace(/~/g, '').replace(/=*$/, (match) => new Array(match.length).fill('.').join(''));
            const buf = Nimiq.BufferUtils.fromBase64Url(str);
            await loadNimiq();
            const keyPair = Nimiq.KeyPair.derive(Nimiq.PrivateKey.unserialize(buf));
            const value = buf.readUint64();
            let message: string;
            if (buf.readPos === buf.byteLength) {
                message = '';
            } else {
                const messageLength = buf.readUint8();
                const messageBytes = buf.read(messageLength);
                message = Utf8Tools.utf8ByteArrayToString(messageBytes);
            }
            let theme: CashlinkTheme | undefined;
            if (buf.readPos < buf.byteLength) {
                theme = buf.readUint8();
            }

            return new Cashlink(
                keyPair,
                keyPair.publicKey.toAddress(),
                value,
                undefined, // fee
                message,
                CashlinkState.UNKNOWN,
                theme,
            );
        } catch (e) {
            console.error('Error parsing Cashlink:', e);
            return null;
        }
    }

    public static fromObject(object: CashlinkEntry): Cashlink {
        return new Cashlink(
            Nimiq.KeyPair.unserialize(new Nimiq.SerialBuffer(object.keyPair)),
            Nimiq.Address.fromString(object.address),
            object.value,
            object.fee,
            object.message,
            object.state,
            object.theme,
            // @ts-ignore `timestamp` was called `date` before and was live in the mainnet.
            object.timestamp || object.date,
            object.contactName,
        );
    }

    /**
     * Cashlink balance in luna
     */
    public balance: number | null = null;
    public state: CashlinkState;

    private _getNetwork: () => Promise<NetworkClient>;
    private _networkClientResolver!: (client: NetworkClient) => void;
    private _immutable: boolean;
    private _eventListeners: {[type: string]: Array<(data: any) => void>} = {};
    private _messageBytes: Uint8Array = new Uint8Array(0);
    private _value: number | null = null;
    private _fee: number | null = null;
    private _theme: CashlinkTheme = CashlinkTheme.UNSPECIFIED; // note that UNSPECIFIED equals to 0 and is thus falsy
    private _knownTransactions: DetailedPlainTransaction[] = [];

    constructor(
        public keyPair: Nimiq.KeyPair,
        public address: Nimiq.Address,
        value?: number,
        fee?: number,
        message?: string,
        state: CashlinkState = CashlinkState.UNCHARGED,
        theme?: CashlinkTheme,
        public timestamp: number = Math.floor(Date.now() / 1000),
        public contactName?: string, /** unused for now */
    ) {
        const networkPromise = new Promise<NetworkClient>((resolve) => {
            // Safe resolver function for when the network client gets assigned
            this._networkClientResolver = resolve;
        });
        this._getNetwork = () => networkPromise;

        if (value) this.value = value;
        if (fee) this.fee = fee;
        if (message) this.message = message;
        if (theme) this.theme = theme;
        this.state = state;

        this._immutable = !!(value || message || theme);

        this._getNetwork().then((network: NetworkClient) => {
            const userFriendlyAddress = this.address.toUserFriendlyAddress();

            // When not yet established, the balance will be updated by the nano-api as soon
            // as we have consensus, because subscribing (below) triggers a balance check.
            if (network.consensusState === 'established') {
                network.getBalance(userFriendlyAddress).then(this._onBalancesChanged.bind(this));
            }

            // Only listen for 'received' and 'mined' events, because 'relayed' events trigger a
            // balance change in the nano-api, too, which triggers the state detection already.
            network.on(NetworkClient.Events.TRANSACTION_PENDING, this._onTransactionReceivedOrMined.bind(this));
            network.on(NetworkClient.Events.TRANSACTION_MINED, this._onTransactionReceivedOrMined.bind(this));
            network.on(NetworkClient.Events.BALANCES_CHANGED, this._onBalancesChanged.bind(this));

            // Triggers a BALANCES_CHANGED event if this is the first time this address is subscribed
            network.subscribe(userFriendlyAddress);
        });

        // Run initial state detection (awaits consensus in detectState())
        this.detectState();
    }

    public async detectState() {
        await this._awaitConsensus();

        const balance = await this._awaitBalance();
        const pendingTransactions = [
            ...(await this._getNetwork()).pendingTransactions,
            ...(await this._getNetwork()).relayedTransactions,
        ];

        const address = this.address.toUserFriendlyAddress();

        const pendingFundingTx = pendingTransactions.find(
            (tx) => tx.recipient === address);
        const pendingClaimingTx = pendingTransactions.find(
            (tx) => tx.sender === address);

        // Only exit if the cashlink is CLAIMED and not currently funded or being funded.
        if (this.state === CashlinkState.CLAIMED && !balance && !pendingFundingTx) return;

        const knownTransactionReceipts = new Map(this._knownTransactions.map((tx) => [tx.hash, tx.blockHash!]));

        const transactionHistory = await (await this._getNetwork()).requestTransactionHistory(
            address,
            knownTransactionReceipts,
        );
        this._knownTransactions = this._knownTransactions.concat(transactionHistory.newTransactions);

        let newState: CashlinkState = this.state;

        const knownFundingTx = this._knownTransactions.find(
            (tx) => tx.recipient === address);
        const knownClaimingTx = this._knownTransactions.find(
            (tx) => tx.sender === address);

        switch (this.state) {
            case CashlinkState.UNKNOWN:
                if (!pendingFundingTx && !knownFundingTx) {
                    newState = CashlinkState.UNCHARGED;
                    break;
                }
            case CashlinkState.UNCHARGED:
                if (pendingFundingTx) {
                    newState = CashlinkState.CHARGING;
                }
            case CashlinkState.CHARGING:
                if (!balance && !pendingFundingTx) {
                    // Handle expired/replaced funding tx
                    newState = CashlinkState.UNCHARGED;
                    // Not break;ing here, because we need to see if the cashlink is already CLAIMED.
                }
                if (knownFundingTx) {
                    newState = CashlinkState.UNCLAIMED;
                } else break; // If no known transactions are found, no further checks are necessary
            case CashlinkState.UNCLAIMED:
                if (pendingClaimingTx) {
                    newState = CashlinkState.CLAIMING;
                }
            case CashlinkState.CLAIMING:
                if (balance) {
                    // Handle recharged/reused cashlink
                    if (!pendingClaimingTx) newState = CashlinkState.UNCLAIMED;
                    break; // If a balance is detected on the cashlink, it cannot be in CLAIMED state.
                }
                if (knownClaimingTx) {
                    newState = CashlinkState.CLAIMED;
                }
            case CashlinkState.CLAIMED:
                // Detect cashlink re-use and chain rebranches
                if (pendingFundingTx) newState = CashlinkState.CHARGING;
                if (balance) newState = CashlinkState.UNCLAIMED;
                if (pendingClaimingTx) newState = CashlinkState.CLAIMING;
        }

        if (newState !== this.state) this._updateState(newState);
    }

    public toObject(includeOptional: boolean = true): CashlinkEntry {
        const result: CashlinkEntry = {
            keyPair: new Uint8Array(this.keyPair.serialize()),
            address: this.address.toUserFriendlyAddress(),
            value: this.value,
            message: this.message,
            state: this.state,
            theme: this._theme,
            timestamp: this.timestamp,
        };
        if (includeOptional) {
            result.fee = this.fee;
            result.contactName = this.contactName;
        }
        return result;
    }

    public render() {
        const buf = new Nimiq.SerialBuffer(
            /*key*/ this.keyPair.privateKey.serializedSize +
            /*value*/ 8 +
            /*message length*/ (this._messageBytes.byteLength || this._theme ? 1 : 0) +
            /*message*/ this._messageBytes.byteLength +
            /*theme*/ (this._theme ? 1 : 0),
        );

        this.keyPair.privateKey.serialize(buf);
        buf.writeUint64(this.value);
        if (this._messageBytes.byteLength || this._theme) {
            buf.writeUint8(this._messageBytes.byteLength);
            buf.write(this._messageBytes);
        }
        if (this._theme) {
            buf.writeUint8(this._theme);
        }

        let result = Nimiq.BufferUtils.toBase64Url(buf);
        // replace trailing . by = because of URL parsing issues on iPhone.
        result = result.replace(/\./g, '=');
        // iPhone also has a problem to parse long words with more then 300 chars in a URL in WhatsApp
        // (and possibly others). Therefore we break the words by adding a ~ every 256 characters in long words.
        result = result.replace(/[A-Za-z0-9_]{257,}/g, (match) => match.replace(/.{256}/g, '$&~'));

        return result;
    }

    public getFundingDetails(): {
        layout: 'cashlink',
        recipient: Nimiq.Address,
        value: number,
        fee: number,
        data: Uint8Array,
        cashlinkMessage: string,
    } {
        return {
            layout: 'cashlink',
            recipient: this.address,
            value: this.value,
            fee: this.fee,
            data: CashlinkExtraData.FUNDING,
            cashlinkMessage: this.message,
        };
    }

    public async claim(
        recipientAddress: string,
        recipientType: Nimiq.Account.Type = Nimiq.Account.Type.BASIC,
        fee: number = this.fee,
    ): Promise<void> {
        if (this.state >= CashlinkState.CLAIMING) {
            throw new Error('Cannot claim, Cashlink has already been claimed');
        }

        await loadNimiq();

        // Only claim the amount specified in the cashlink (or the cashlink balance, if smaller)
        const balance = Math.min(this.value, await this._awaitBalance());
        if (!balance) {
            throw new Error('Cannot claim, there is no balance in this link');
        }
        const recipient = Nimiq.Address.fromString(recipientAddress);
        const transaction = new Nimiq.ExtendedTransaction(this.address, Nimiq.Account.Type.BASIC,
            recipient, recipientType, balance - fee, fee, await this._getBlockchainHeight(),
            Nimiq.Transaction.Flag.NONE, CashlinkExtraData.CLAIMING);

        const keyPair = this.keyPair;
        const signature = Nimiq.Signature.create(keyPair.privateKey, keyPair.publicKey, transaction.serializeContent());
        const proof = Nimiq.SignatureProof.singleSig(keyPair.publicKey, signature).serialize();

        transaction.proof = proof;

        return this._sendTransaction(transaction);
    }

    public on(type: Cashlink.Events, callback: (data: any) => void): void {
        if (!(type in this._eventListeners)) {
            this._eventListeners[type] = [];
        }
        this._eventListeners[type].push(callback);
    }

    public off(type: Cashlink.Events, callback: (data: any) => void): void {
        if (!(type in this._eventListeners)) {
            return;
        }
        const index = this._eventListeners[type].indexOf(callback);
        if (index === -1) {
            return;
        }
        this._eventListeners[type].splice(index, 1);
    }

    public fire(type: Cashlink.Events, arg: any): void {
        if (!(type in this._eventListeners)) {
            return;
        }
        this._eventListeners[type].forEach((callback) => callback(arg));
    }

    private async _awaitConsensus(): Promise<void> {
        if ((await this._getNetwork()).consensusState === 'established') return;
        return new Promise(async (resolve) => {
            const handler = async () => {
                (await this._getNetwork()).off(NetworkClient.Events.CONSENSUS_ESTABLISHED, handler);
                resolve();
            };
            (await this._getNetwork()).on(NetworkClient.Events.CONSENSUS_ESTABLISHED, handler);
        });
    }

    private async _awaitBalance(): Promise<number> {
        if (this.balance !== null) return this.balance;
        return new Promise(async (resolve) => {
            const handler = async (balance: number) => {
                this.off(Cashlink.Events.BALANCE_CHANGE, handler);
                resolve(balance);
            };
            this.on(Cashlink.Events.BALANCE_CHANGE, handler);
        });
    }

    private async _sendTransaction(transaction: Nimiq.Transaction): Promise<void> {
        await this._awaitConsensus();
        try {
            const proof = Nimiq.SignatureProof.unserialize(new Nimiq.SerialBuffer(transaction.proof));
            await (await this._getNetwork()).relayTransaction({
                sender: transaction.sender.toUserFriendlyAddress(),
                senderPubKey: proof.publicKey.serialize(),
                recipient: transaction.recipient.toUserFriendlyAddress(),
                value: Nimiq.Policy.lunasToCoins(transaction.value),
                fee: Nimiq.Policy.lunasToCoins(transaction.fee),
                validityStartHeight: transaction.validityStartHeight,
                signature: proof.signature.serialize(),
                extraData: transaction.data,
            });
        } catch (e) {
            console.error(e);
            throw new Error('Failed to forward transaction to the network');
        }
    }

    private async _getBlockchainHeight(): Promise<number> {
        await this._awaitConsensus();
        return (await this._getNetwork()).headInfo.height;
    }

    private async _onTransactionReceivedOrMined(transaction: DetailedPlainTransaction): Promise<void> {
        if (transaction.recipient === this.address.toUserFriendlyAddress()
            || transaction.sender === this.address.toUserFriendlyAddress()) {
            // Always run state detection when a transaction comes in
            // or an incoming or outgoing transaction was mined, as those
            // events likely signal a state change of the cashlink.
            this.detectState();
        }
    }

    private _onBalancesChanged(balances: Map<string, number>) {
        const address = this.address.toUserFriendlyAddress();

        if (!balances.has(address)) return;

        this.balance = Nimiq.Policy.coinsToLunas(balances.get(address)!);
        this.fire(Cashlink.Events.BALANCE_CHANGE, this.balance);
        // Always run state detection when the balance changes,
        // to catch state changes even when the transaction events
        // have not been recognized (can happen when an incoming
        // transaction gets mined before it's pending state is
        // broadcasted to this client).
        this.detectState();
    }

    private _updateState(state: CashlinkState) {
        this.state = state;
        this.fire(Cashlink.Events.STATE_CHANGE, this.state);
    }
}

namespace Cashlink {
    export enum Events {
        BALANCE_CHANGE = 'balance-change',
        STATE_CHANGE = 'state-change',
    }

    // To be updated with the seasons.
    export const DEFAULT_THEME = Date.now() < new Date('Tue, 13 Apr 2020 23:59:00 GMT-12').valueOf()
        ? CashlinkTheme.EASTER
        : CashlinkTheme.STANDARD;
}

export default Cashlink;
