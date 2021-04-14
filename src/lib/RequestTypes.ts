import type { Currency, PaymentType, RequestType, CashlinkTheme } from './PublicRequestTypes';
import type { ParsedPaymentOptions } from './paymentOptions/ParsedPaymentOptions';
import type { ParsedNimiqSpecifics, ParsedNimiqDirectPaymentOptions } from './paymentOptions/NimiqPaymentOptions';
import type { ParsedEtherSpecifics, ParsedEtherDirectPaymentOptions } from './paymentOptions/EtherPaymentOptions';
import type { ParsedBitcoinSpecifics, ParsedBitcoinDirectPaymentOptions } from './paymentOptions/BitcoinPaymentOptions';
import type { SwapAsset } from '@nimiq/fastspot-api';

export interface ParsedBasicRequest {
    kind: RequestType;
    appName: string;
}

export interface ParsedSimpleRequest extends ParsedBasicRequest {
    walletId: string;
}

export interface ParsedOnboardRequest extends ParsedBasicRequest {
    disableBack: boolean;
}

export interface ParsedChooseAddressRequest extends ParsedBasicRequest {
    returnBtcAddress: boolean;
    minBalance: number;
    disableContracts: boolean;
    disableLegacyAccounts: boolean;
    disableBip39Accounts: boolean;
    disableLedgerAccounts: boolean;
}

export interface ParsedSignTransactionRequest extends ParsedBasicRequest {
    // The sender object is currently only for internal use in RefundSwapLedger and can not be set in public request.
    // Note that the object does not get exported to the history state in RpcApi and therefore does not survive reloads.
    // However, the RefundSwapLedger handler is built in a way that it starts over on reloads to avoid the problem.
    sender: Nimiq.Address | {
        address: Nimiq.Address,
        label?: string,
        walletLabel?: string,
        type?: Nimiq.Account.Type,
        signerKeyId: string,
        signerKeyPath: string,
    };
    recipient: Nimiq.Address;
    recipientType: Nimiq.Account.Type;
    recipientLabel?: string;
    value: number;
    fee: number;
    data: Uint8Array;
    flags: number;
    validityStartHeight: number; // FIXME To be made optional when hub has its own network
}

export type ParsedProtocolSpecificsForCurrency<C extends Currency> =
    C extends Currency.NIM ? ParsedNimiqSpecifics
    : C extends Currency.BTC ? ParsedBitcoinSpecifics
    : C extends Currency.ETH ? ParsedEtherSpecifics
    : undefined;

export type AvailableParsedPaymentOptions = ParsedNimiqDirectPaymentOptions
                                          | ParsedEtherDirectPaymentOptions
                                          | ParsedBitcoinDirectPaymentOptions;

export type ParsedPaymentOptionsForCurrencyAndType<C extends Currency, T extends PaymentType> =
    T extends PaymentType.DIRECT ?
        C extends Currency.NIM ? ParsedNimiqDirectPaymentOptions
        : C extends Currency.BTC ? ParsedBitcoinDirectPaymentOptions
        : C extends Currency.ETH ? ParsedEtherDirectPaymentOptions
        : ParsedPaymentOptions<C, T>
    : ParsedPaymentOptions<C, T>;

export interface ParsedCheckoutRequest extends ParsedBasicRequest {
    version: number;
    shopLogoUrl?: string;
    callbackUrl?: string;
    csrf?: string;
    time: number;
    fiatCurrency?: string;
    fiatAmount?: number;
    paymentOptions: AvailableParsedPaymentOptions[];
    disableDisclaimer: boolean;
}

export interface ParsedSignMessageRequest extends ParsedBasicRequest {
    signer?: Nimiq.Address;
    message: string | Uint8Array;
}

export interface ParsedRenameRequest extends ParsedSimpleRequest {
    address?: string;
}

export interface ParsedExportRequest extends ParsedSimpleRequest {
    fileOnly?: boolean;
    wordsOnly?: boolean;
}

export interface ParsedCreateCashlinkRequest extends ParsedBasicRequest {
    senderAddress?: Nimiq.Address;
    senderBalance?: number;
    value?: number;
    message?: string;
    theme: CashlinkTheme;
    returnLink: boolean;
    skipSharing: boolean;
}

export interface ParsedManageCashlinkRequest extends ParsedBasicRequest {
    cashlinkAddress: Nimiq.Address;
}

/**
 * Bitcoin
 */

export interface ParsedSignBtcTransactionRequest extends ParsedSimpleRequest {
    inputs: Array<{
        address: string,
        transactionHash: string,
        outputIndex: number,
        outputScript: string, // hex
        witnessScript?: string, // Custom witness script for p2wsh input. hex.
        value: number,
        sequence?: number,
        // Currently only for internal use in RefundSwapLedger. Can not be set in public request.
        // Note that the keyPath gets lost on re-parsing in RequestParser and therefore does not survive reloads.
        // However, the RefundSwapLedger handler is built in a way that it starts over on reloads to avoid the problem.
        keyPath?: string,
    }>;
    output: {
        address: string,
        value: number,
        label?: string,
    };
    changeOutput?: {
        address: string,
        value: number,
    };
    locktime?: number;
}

export interface ParsedAddBtcAddressesRequest extends ParsedSimpleRequest {
    chain: 'internal' | 'external';
    firstIndex: number;
}

/**
 * Swap
 */

export interface ParsedSetupSwapRequest extends ParsedSimpleRequest {
    swapId: string;

    fund: {
        type: SwapAsset.NIM,
        sender: Nimiq.Address,
        value: number, // Luna
        fee: number, // Luna
        // extraData: Uint8Array, // HTLC data
        validityStartHeight: number,
    } | {
        type: SwapAsset.BTC,
        inputs: Array<{
            address: string,
            transactionHash: string,
            outputIndex: number,
            outputScript: string,
            value: number, // Sats
            sequence?: number,
        }>;
        output: {
            // address: string, // HTLC address
            value: number, // Sats
        };
        changeOutput?: {
            address: string,
            value: number, // Sats
        };
        locktime?: number,
        // htlcScript: Uint8Array,
        refundAddress: string,
    } | {
        type: SwapAsset.EUR,
        value: number, // Eurocents
        fee: number, // Eurocents
        bankLabel?: string,
    };

    redeem: {
        type: SwapAsset.NIM,
        // sender: Nimiq.Address, // HTLC address
        recipient: Nimiq.Address, // My address, must be redeem address of HTLC
        value: number, // Luna
        fee: number, // Luna
        extraData?: Uint8Array,
        validityStartHeight: number,
        // htlcData: Uint8Array,
    } | {
        type: SwapAsset.BTC,
        input: {
            // transactionHash: string,
            // outputIndex: number,
            // outputScript: string,
            value: number, // Sats
            // witnessScript: string,
        };
        output: {
            address: string, // My address, must be redeem address of HTLC
            value: number, // Sats
        };
    };

    // Data needed for display
    layout: 'standard' | 'slider';
    fiatCurrency: string;
    fundingFiatRate: number;
    redeemingFiatRate: number;
    serviceFundingFee: number; // Luna or Sats, depending which one gets funded
    serviceRedeemingFee: number; // Luna or Sats, depending which one gets redeemed
    serviceSwapFee: number; // Luna or Sats, depending which one gets funded
    nimiqAddresses?: Array<{
        address: string,
        balance: number, // Luna
    }>;
    bitcoinAccount?: {
        balance: number, // Sats
    };
}

export interface ParsedRefundSwapRequest extends ParsedSimpleRequest {
    refund: {
        type: SwapAsset.NIM;
        sender: Nimiq.Address; // HTLC address
        recipient: Nimiq.Address; // My address, must be refund address of HTLC
        value: number; // Luna
        fee: number; // Luna
        extraData?: Uint8Array;
        validityStartHeight: number;
    } | {
        type: SwapAsset.BTC;
        input: {
            transactionHash: string,
            outputIndex: number,
            outputScript: string,
            value: number, // Sats
            witnessScript: string,
        };
        output: {
            address: string, // My address
            value: number, // Sats
        };
        refundAddress: string; // My address, must be refund address of HTLC
    };
}

// Discriminated Unions
export type ParsedRpcRequest = ParsedSignTransactionRequest
                             | ParsedCreateCashlinkRequest
                             | ParsedManageCashlinkRequest
                             | ParsedCheckoutRequest
                             | ParsedBasicRequest
                             | ParsedSimpleRequest
                             | ParsedOnboardRequest
                             | ParsedRenameRequest
                             | ParsedSignMessageRequest
                             | ParsedExportRequest
                             | ParsedSignBtcTransactionRequest
                             | ParsedAddBtcAddressesRequest
                             | ParsedSetupSwapRequest
                             | ParsedRefundSwapRequest;
