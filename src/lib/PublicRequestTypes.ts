import { WalletType } from './WalletInfo';
import { RequestType } from './RequestTypes';

export interface BasicRequest {
    appName: string;
    disableBack?: boolean;
}

export interface SimpleRequest extends BasicRequest {
    accountId: string;
}

export interface SimpleResult {
    success: true;
}

export interface SignTransactionRequest extends BasicRequest {
    sender: string;
    recipient: string;
    recipientType?: Nimiq.Account.Type;
    value: number;
    fee?: number;
    extraData?: Uint8Array | string;
    flags?: number;
    validityStartHeight: number; // FIXME To be made optional when hub has its own network
}

export interface CheckoutRequest extends BasicRequest {
    shopLogoUrl?: string;
    sender?: string;
    forceSender?: boolean;
    recipient: string;
    recipientType?: Nimiq.Account.Type;
    value: number;
    fee?: number;
    extraData?: Uint8Array | string;
    flags?: number;
    validityDuration?: number;
}

export interface SignedTransaction {
    serializedTx: string; // HEX
    hash: string; // HEX

    raw: {
        signerPublicKey: Uint8Array;
        signature: Uint8Array;

        sender: string; // Userfriendly address
        senderType: Nimiq.Account.Type;
        recipient: string; // Userfriendly address
        recipientType: Nimiq.Account.Type;
        value: number; // Luna
        fee: number; // Luna
        validityStartHeight: number;
        extraData: Uint8Array;
        flags: number;
        networkId: number;
    };
}

export interface SignMessageRequest extends BasicRequest {
    signer?: string;
    message: string | Uint8Array;
}

export interface SignedMessage {
    signer: string; // Userfriendly address
    signerPublicKey: Uint8Array;
    signature: Uint8Array;
}

export interface Address {
    address: string; // Userfriendly address
    label: string;
}

export interface VestingContract {
    type: Nimiq.Account.Type.VESTING;
    address: string; // Userfriendly address
    label: string;

    owner: string; // Userfriendly address
    start: number;
    stepAmount: number;
    stepBlocks: number;
    totalAmount: number;
}

export interface HashedTimeLockedContract {
    type: Nimiq.Account.Type.HTLC;
    address: string; // Userfriendly address
    label: string;

    sender: string;  // Userfriendly address
    recipient: string;  // Userfriendly address
    hashRoot: string; // HEX
    hashCount: number;
    timeout: number;
    totalAmount: number;
}

export type Contract = VestingContract | HashedTimeLockedContract;

export interface Account {
    accountId: string;
    label: string;
    type: WalletType;
    fileExported: boolean;
    wordsExported: boolean;
    addresses: Address[];
    contracts: Contract[];
}

export interface ExportRequest extends SimpleRequest {
    fileOnly?: boolean;
    wordsOnly?: boolean;
}

export interface ExportResult {
    fileExported: boolean;
    wordsExported: boolean;
}

export interface RenameRequest extends SimpleRequest {
    address?: string; // Userfriendly address
}

export type RpcRequest = SignTransactionRequest
                       | CheckoutRequest
                       | BasicRequest
                       | SimpleRequest
                       | RenameRequest
                       | SignMessageRequest
                       | ExportRequest;

export type RpcResult = SignedTransaction
                      | Account
                      | Account[]
                      | SimpleResult
                      | Address
                      | SignedMessage
                      | ExportResult;

export type ResultByRequestType<T> =
    T extends RequestType.RENAME ? Account :
    T extends RequestType.ONBOARD | RequestType.SIGNUP | RequestType.LOGIN
            | RequestType.MIGRATE | RequestType.LIST ? Account[] :
    T extends RequestType.CHOOSE_ADDRESS | RequestType.ADD_ADDRESS ? Address :
    T extends RequestType.SIGN_TRANSACTION | RequestType.CHECKOUT ? SignedTransaction :
    T extends RequestType.SIGN_MESSAGE ? SignedMessage :
    T extends RequestType.LOGOUT | RequestType.CHANGE_PASSWORD ? SimpleResult :
    T extends RequestType.EXPORT ? ExportResult : never;
