import { WalletInfoEntry, WalletType } from './WalletInfo';
import { AccountInfoEntry } from './AccountInfo';
import { ContractInfo, ContractType } from './ContractInfo';
import { WalletStore } from './WalletStore';
import { Utf8Tools } from '@nimiq/utils';

//              0       8       16      24      32      40      48      56     63
const BASE64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+-";
const BASE64_LOOKUP = new Map<string, number>();
BASE64.split('').forEach((character, value) => BASE64_LOOKUP.set(character, value));

export class CookieJar {

    static encodeString(string: string, buffer: Nimiq.SerialBuffer) {
        const bytes = Utf8Tools.stringToUtf8ByteArray(string);
        buffer.writeVarUint(bytes.length);
        buffer.write(bytes);
    }

    static decodeString(buffer: Nimiq.SerialBuffer): string {
        const size = buffer.readVarUint();
        return Utf8Tools.utf8ByteArrayToString(buffer.read(size));
    }

    static decodeElements(buffer: Nimiq.SerialBuffer) {
        return new Array(buffer.readUint8()).fill(undefined);
    }

    static base64Encode(buffer: Uint8Array): string {
        const chunks: number[] = [];
        for (let index = 0; index < buffer.length; index += 3) {
            // extract 4x 6 bit chunks from 3 bytes of data
            const data = [ buffer[index], buffer[index + 1] || 0, buffer[index + 2] || 0 ];
            chunks.push(...
                [(data[0] & 0xfc) >> 2,
                ((data[0] & 0x03) << 4) | ((data[1] & 0xf0) >> 4),
                ((data[1] & 0x0f) << 2) | ((data[2] & 0xc0) >> 6),
                (data[2] & 0x3f)]);
        }
        return chunks.map(bitChunk => BASE64[bitChunk]).join('');
    }

    static base64Decode(data: string, pad = 0): Uint8Array {
        if (data.length % 4 != 0) throw new Error(`Data is ${data.length} bytes. Can only compress multiples of 4 (Base 64 > 6 bits > chunks of 24bit = 4 characters for 3 bytes)`);
        const bytes: number[] = [];
        const values = <number[]>data.split('').map(character => BASE64_LOOKUP.get(character));
        for (let index = 0; index < values.length; index += 4) {
            // extract 4x 6 bit chunks from 3 bytes of data
            // base64       AAAAAA BBBBBB CCCCCC DDDDDD
            // bits of byte 111111 112222 222233 333333
            bytes.push(...
                [(values[index] << 2) | ((values[index + 1] & 0x30) >> 4),
                ((values[index + 1] & 0x0f) << 4) | ((values[index + 2] & 0x3c) >> 2),
                ((values[index + 2] & 0x03) << 6) | values[index + 3]]);
        }
        return new Uint8Array(pad ? bytes.slice(0, pad) : bytes);
    }

    static encodeNumber(number: number | undefined, buffer: Nimiq.SerialBuffer) {
        // TODO could be base 64, not much saving though
        // return number.toString(36);
        const isNumber = number !== undefined && Number.isInteger(number);
        buffer.writeUint8(isNumber ? 0 : 1);
        if (isNumber) {
            buffer.writeVarUint(number || 0);
        }
    }

    static decodeNumber(buffer: Nimiq.SerialBuffer): number | undefined {
        // try { return parseInt(number, 36) } catch (e) { return 0 };
        // return parseInt(number, 36);
        return (buffer.readUint8() == 1) ? buffer.readVarUint() : undefined;
    }

    static encodeAddress(address: Uint8Array, buffer: Nimiq.SerialBuffer) {
        //return this.base64Encode(address, true);
        buffer.write(address);
    }

    static decodeAddress(buffer: Nimiq.SerialBuffer): Uint8Array {
        return buffer.read(20);
    }

    static encodePath(path: string, buffer: Nimiq.SerialBuffer) {
        // "m/44'/242'/0'/0'" > var length, restricted character set
        // TODO m/ == constant?
        // > path.split("'/") > 4xFF
        buffer.writeVarLengthString(path);
    }

    static decodePath(buffer: Nimiq.SerialBuffer): string {
        return buffer.readVarLengthString();
    }

    static encodeId(hex: string, buffer: Nimiq.SerialBuffer) {
        // example "1ee3d926a49c"
        if (hex.length != 12) throw new Error(`not a valid ID ${hex}`);
        buffer.writeVarUint(parseInt(hex, 16));
    }
    static decodeId(buffer: Nimiq.SerialBuffer): string {
        return buffer.readVarUint().toString(16);
    }

    static encodeAccount(account: AccountInfoEntry, buffer: Nimiq.SerialBuffer) {
        this.encodeAddress(account.address, buffer);
        this.encodePath(account.path, buffer);
        this.encodeString(account.label, buffer);
        this.encodeNumber(account.balance, buffer);
    }

    static decodeAccount(buffer: Nimiq.SerialBuffer): AccountInfoEntry {
        return {
            address: this.decodeAddress(buffer),
            path: this.decodePath(buffer),
            label: this.decodeString(buffer),
            balance: this.decodeNumber(buffer),
        };
    }

    static encodeAccounts(accountsMap: Map</*address*/ string, AccountInfoEntry>, buffer: Nimiq.SerialBuffer) {
        const accounts = Array.from(accountsMap.values());
        buffer.writeUint8(accounts.length);
        accounts.forEach(account => this.encodeAccount(account, buffer));
    }

    static decodeAccounts(buffer: Nimiq.SerialBuffer): Map</*address*/ string, AccountInfoEntry> {
        const accountsMap = new Map</*address*/ string, AccountInfoEntry>();
        this.decodeElements(buffer)
            .map(x => this.decodeAccount(buffer))
            .forEach(account => {
                const address = new Nimiq.Address(account.address).toUserFriendlyAddress();
                accountsMap.set(address, account);
            });

        return accountsMap;
    }

    static encodeContractType(type: ContractType, buffer: Nimiq.SerialBuffer) {
        buffer.writeUint8(type.valueOf());
    }

    static decodeContractType(buffer: Nimiq.SerialBuffer): ContractType {
        return <ContractType> buffer.readUint8();
    }

    static encodeContract(contract: ContractInfo, buffer: Nimiq.SerialBuffer) {
        this.encodeAddress(contract.address, buffer);
        this.encodeContractType(contract.type, buffer);
        this.encodeString(contract.label, buffer);
    }

    static decodeContract(buffer: Nimiq.SerialBuffer): ContractInfo {
        return {
            address: this.decodeAddress(buffer),
            type: this.decodeContractType(buffer),
            label: this.decodeString(buffer),
            ownerPath: this.decodePath(buffer),
        }
    }

    static encodeContracts(contracts: ContractInfo[], buffer: Nimiq.SerialBuffer) {
        buffer.writeUint8(contracts.length);
        contracts.forEach(contract => this.encodeContract(contract, buffer));
    }

    static decodeContracts(buffer: Nimiq.SerialBuffer): ContractInfo[] {
        return this.decodeElements(buffer).map(x => this.decodeContract(buffer));
    }

    static encodeType(type: WalletType, buffer: Nimiq.SerialBuffer) {
        buffer.writeUint8(type.valueOf());
    }

    static decodeType(buffer: Nimiq.SerialBuffer): WalletType {
        return <WalletType> buffer.readUint8();
    }

    static encodeWallet(wallet: WalletInfoEntry, buffer: Nimiq.SerialBuffer) {
        this.encodeId(wallet.id, buffer);
        this.encodeType(wallet.type, buffer);
        this.encodeString(wallet.label, buffer);
        this.encodeAccounts(wallet.accounts, buffer);
        this.encodeContracts(wallet.contracts, buffer);
    }

    static decodeWallet(buffer: Nimiq.SerialBuffer): WalletInfoEntry {
        return {
            id: this.decodeId(buffer),
            type: this.decodeType(buffer),
            label: this.decodeString(buffer),
            accounts: this.decodeAccounts(buffer),
            contracts: this.decodeContracts(buffer),
        }
    }

    public static encodeWallets(wallets: WalletInfoEntry[]): Uint8Array  {
        const buffer = new Nimiq.SerialBuffer(3.5*1024); // 4 kB max
        buffer.writeUint8(wallets.length);
        wallets.forEach(wallet => this.encodeWallet(wallet, buffer))
        return Uint8Array.from(buffer.subarray(0, buffer.writePos));
    }

    public static decodeWallets(data: Uint8Array): WalletInfoEntry[] {
        const buffer = new Nimiq.SerialBuffer(data);
        return this.decodeElements(buffer).map(x => this.decodeWallet(buffer));
    }

    public static fill(wallets: WalletInfoEntry[]) {
        const buffer = this.encodeWallets(wallets);
        document.cookie = this.base64Encode(buffer);
    }

    public static eat(): WalletInfoEntry[] {
        const buffer = this.base64Decode(document.cookie);
        return this.decodeWallets(buffer);
    }

}