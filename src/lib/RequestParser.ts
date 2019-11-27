import { isMilliseconds } from './Helpers';
import { State } from '@nimiq/rpc';
import {
    BasicRequest,
    SimpleRequest,
    OnboardRequest,
    SignTransactionRequest,
    CheckoutRequest,
    SignMessageRequest,
    RenameRequest,
    ExportRequest,
    RpcRequest,
    Currency,
    PaymentMethod,
    RequestType,
    NimiqCheckoutRequest,
    MultiCurrencyCheckoutRequest,
} from './PublicRequestTypes';
import {
    ParsedBasicRequest,
    ParsedSimpleRequest,
    ParsedOnboardRequest,
    ParsedSignTransactionRequest,
    ParsedCheckoutRequest,
    ParsedSignMessageRequest,
    ParsedRenameRequest,
    ParsedExportRequest,
    ParsedRpcRequest,
} from './RequestTypes';
import { ParsedNimiqDirectPaymentOptions } from './paymentOptions/NimiqPaymentOptions';
import { ParsedEtherDirectPaymentOptions } from './paymentOptions/EtherPaymentOptions';
import { ParsedBitcoinDirectPaymentOptions } from './paymentOptions/BitcoinPaymentOptions';
import { Utf8Tools } from '@nimiq/utils';

export class RequestParser {
    public static parse(
            request: RpcRequest,
            state: State,
            requestType: RequestType,
        ): ParsedRpcRequest | null {
        if (!request.appName) throw new Error('appName is required');

        switch (requestType) {
            case RequestType.SIGN_TRANSACTION:
                const signTransactionRequest = request as SignTransactionRequest;

                if (!signTransactionRequest.value) throw new Error('value is required');
                if (!signTransactionRequest.validityStartHeight) throw new Error('validityStartHeight is required');

                return {
                    kind: RequestType.SIGN_TRANSACTION,
                    appName: signTransactionRequest.appName,
                    sender: Nimiq.Address.fromUserFriendlyAddress(signTransactionRequest.sender),
                    recipient: Nimiq.Address.fromUserFriendlyAddress(signTransactionRequest.recipient),
                    recipientType: signTransactionRequest.recipientType || Nimiq.Account.Type.BASIC,
                    value: signTransactionRequest.value,
                    fee: signTransactionRequest.fee || 0,
                    data: typeof signTransactionRequest.extraData === 'string'
                        ? Utf8Tools.stringToUtf8ByteArray(signTransactionRequest.extraData)
                        : signTransactionRequest.extraData || new Uint8Array(0),
                    flags: signTransactionRequest.flags || Nimiq.Transaction.Flag.NONE,
                    validityStartHeight: signTransactionRequest.validityStartHeight,
                } as ParsedSignTransactionRequest;
            case RequestType.CHECKOUT:
                const checkoutRequest = request as CheckoutRequest;

                if (checkoutRequest.shopLogoUrl) {
                    let origin;
                    try {
                        origin = new URL(checkoutRequest.shopLogoUrl).origin;
                    } catch (err) {
                        throw new Error(`shopLogoUrl must be a valid URL: ${err}`);
                    }
                    if (origin !== state.origin) {
                        throw new Error(
                            'shopLogoUrl must have same origin as caller website. Image at ' +
                            checkoutRequest.shopLogoUrl +
                            ' is not on caller origin ' +
                            state.origin,
                        );
                    }
                }

                if (checkoutRequest.extraData !== undefined && typeof checkoutRequest.extraData !== 'string'
                    && !(checkoutRequest.extraData instanceof Uint8Array)) {
                    throw new Error('extraData must be a string or Uint8Array');
                }
                const data = typeof checkoutRequest.extraData === 'string'
                    ? Utf8Tools.stringToUtf8ByteArray(checkoutRequest.extraData)
                    : checkoutRequest.extraData || new Uint8Array(0);

                if (!checkoutRequest.version || checkoutRequest.version === 1) {
                    if (typeof checkoutRequest.value !== 'number' || checkoutRequest.value <= 0) {
                        throw new Error('value must be a number >0');
                    }

                    return {
                        kind: RequestType.CHECKOUT,
                        version: 1,
                        appName: checkoutRequest.appName,
                        shopLogoUrl: checkoutRequest.shopLogoUrl,
                        data,
                        time: Date.now(),
                        paymentOptions: [new ParsedNimiqDirectPaymentOptions({
                            currency: Currency.NIM,
                            type: PaymentMethod.DIRECT,
                            amount: checkoutRequest.value.toString(),
                            expires: 0, // unused for NimiqCheckoutRequests
                            protocolSpecific: {
                                recipient: checkoutRequest.recipient,
                                recipientType: checkoutRequest.recipientType || Nimiq.Account.Type.BASIC,
                                sender: checkoutRequest.sender,
                                forceSender: !!checkoutRequest.forceSender,
                                fee: checkoutRequest.fee || 0,
                                flags: checkoutRequest.flags || Nimiq.Transaction.Flag.NONE,
                                validityDuration: checkoutRequest.validityDuration,
                            },
                        }, data)],
                    } as ParsedCheckoutRequest;
                }

                if (checkoutRequest.version === 2) {
                    if (!checkoutRequest.paymentOptions.some((option) => option.currency === Currency.NIM)) {
                        throw new Error('CheckoutRequest must provide a NIM paymentOption.');
                    }
                    if (!checkoutRequest.shopLogoUrl) {
                        throw new Error('shopLogoUrl: string is required'); // shop logo non optional in version 2
                    }

                    try {
                        // Test whether the browser is able to parse the currency as an ISO 4217 currency code,
                        // see https://www.ecma-international.org/ecma-402/1.0/#sec-6.3.1
                        (0).toLocaleString('en-US', {
                            style: 'currency',
                            currency: checkoutRequest.fiatCurrency,
                        });
                    } catch (e) {
                        throw new Error(`Failed to parse currency ${checkoutRequest.fiatCurrency}. Is it a valid ` +
                            'ISO 4217 currency code?');
                    }

                    if (!checkoutRequest.fiatAmount
                        || typeof checkoutRequest.fiatAmount !== 'number'
                        || checkoutRequest.fiatAmount <= 0) {
                        throw new Error('fiatAmount must be a positive non-zero number');
                    }

                    if (!checkoutRequest.callbackUrl || typeof checkoutRequest.callbackUrl !== 'string') {
                        if (checkoutRequest.paymentOptions.some(
                            (option) => option.currency !== Currency.NIM,
                            )) {
                            throw new Error('A callbackUrl: string is required for currencies other than NIM to ' +
                                'monitor payments.');
                        }
                        if (!checkoutRequest.paymentOptions.every(
                                (option) => !!option.protocolSpecific.recipient,
                            )) {
                            throw new Error('A callbackUrl: string or all recipients must be provided');
                        }
                    } else {
                        let origin;
                        try {
                            origin = new URL(checkoutRequest.callbackUrl).origin;
                        } catch (err) {
                            throw new Error(`callbackUrl must be a valid URL: ${err}`);
                        }
                        if (origin !== state.origin) {
                            throw new Error('callbackUrl must have the same origin as caller Website. ' +
                                checkoutRequest.callbackUrl +
                                ' is not on caller origin ' +
                                state.origin,
                            );
                        }
                        if (!checkoutRequest.csrf || typeof checkoutRequest.csrf !== 'string') {
                            throw new Error('A CSRF token must be provided alongside the callbackUrl.');
                        }
                    }

                    if (checkoutRequest.time && typeof checkoutRequest.time !== 'number') {
                        throw new Error('time: number is required');
                    }

                    const currencies = new Set<Currency>();

                    return {
                        kind: RequestType.CHECKOUT,
                        version: 2,
                        appName: checkoutRequest.appName,
                        shopLogoUrl: checkoutRequest.shopLogoUrl,
                        callbackUrl: checkoutRequest.callbackUrl,
                        csrf: checkoutRequest.csrf,
                        data,
                        time: !checkoutRequest.time
                            ? Date.now()
                            : isMilliseconds(checkoutRequest.time)
                                ? checkoutRequest.time
                                : checkoutRequest.time * 1000,
                        fiatCurrency: checkoutRequest.fiatCurrency,
                        fiatAmount: checkoutRequest.fiatAmount,
                        paymentOptions: checkoutRequest.paymentOptions.map((option) => {
                            if (currencies.has(option.currency)) {
                                throw new Error('Each Currency can only have one paymentOption');
                            } else {
                                currencies.add(option.currency);
                            }
                            switch (option.type) {
                                case PaymentMethod.DIRECT:
                                    switch (option.currency) {
                                        case Currency.NIM:
                                            return new ParsedNimiqDirectPaymentOptions(option, data);
                                        case Currency.ETH:
                                            return new ParsedEtherDirectPaymentOptions(option);
                                        case Currency.BTC:
                                            return new ParsedBitcoinDirectPaymentOptions(option);
                                        default:
                                            throw new Error(`Currency ${(option as any).currency} not supported`);
                                    }
                                default:
                                    throw new Error(`PaymentMethod ${(option as any).type} not supported`);
                            }
                        }),
                    } as ParsedCheckoutRequest;
                }
            case RequestType.ONBOARD:
                const onboardRequest = request as OnboardRequest;
                return {
                    kind: requestType,
                    appName: onboardRequest.appName,
                    disableBack: !!onboardRequest.disableBack,
                } as ParsedOnboardRequest;
            case RequestType.SIGNUP:
            case RequestType.CHOOSE_ADDRESS:
            case RequestType.LOGIN:
            case RequestType.MIGRATE:
                return {
                    kind: requestType,
                    appName: request.appName,
                } as ParsedBasicRequest;
            case RequestType.CHANGE_PASSWORD:
            case RequestType.LOGOUT:
            case RequestType.ADD_ADDRESS:
                const simpleRequest = request as SimpleRequest;

                if (!simpleRequest.accountId) throw new Error('accountId is required');

                return {
                    kind: requestType,
                    appName: simpleRequest.appName,
                    walletId: simpleRequest.accountId,
                } as ParsedSimpleRequest;
            case RequestType.EXPORT:
                const exportRequest = request as ExportRequest;

                if (!exportRequest.accountId) throw new Error('accountId is required');

                return {
                    kind: RequestType.EXPORT,
                    appName: exportRequest.appName,
                    walletId: exportRequest.accountId,
                    fileOnly: exportRequest.fileOnly,
                    wordsOnly: exportRequest.wordsOnly,
                } as ParsedExportRequest;
            case RequestType.RENAME:
                const renameRequest = request as RenameRequest;

                if (!renameRequest.accountId) throw new Error('accountId is required');

                return {
                    kind: RequestType.RENAME,
                    appName: renameRequest.appName,
                    walletId: renameRequest.accountId,
                    address: renameRequest.address,
                } as ParsedRenameRequest;
            case RequestType.SIGN_MESSAGE:
                const signMessageRequest = request as SignMessageRequest;
                if (typeof signMessageRequest.message !== 'string'
                    && !(signMessageRequest.message instanceof Uint8Array)) {
                    throw new Error('message must be a string or Uint8Array');
                }
                return {
                    kind: RequestType.SIGN_MESSAGE,
                    appName: signMessageRequest.appName,
                    signer: signMessageRequest.signer
                            ? Nimiq.Address.fromUserFriendlyAddress(signMessageRequest.signer)
                            : undefined,
                    message: signMessageRequest.message,
                } as ParsedSignMessageRequest;
            default:
                return null;
        }
    }

    public static raw(request: ParsedRpcRequest)
        : RpcRequest | null {
        switch (request.kind) {
            case RequestType.SIGN_TRANSACTION:
                const signTransactionRequest = request as ParsedSignTransactionRequest;
                return {
                    appName: signTransactionRequest.appName,
                    sender: signTransactionRequest.sender.toUserFriendlyAddress(),
                    recipient: signTransactionRequest.recipient.toUserFriendlyAddress(),
                    recipientType: signTransactionRequest.recipientType,
                    value: signTransactionRequest.value,
                    fee: signTransactionRequest.fee,
                    extraData: signTransactionRequest.data,
                    flags: signTransactionRequest.flags,
                    validityStartHeight: signTransactionRequest.validityStartHeight,
                } as SignTransactionRequest;
            case RequestType.CHECKOUT:
                const checkoutRequest = request as ParsedCheckoutRequest;
                switch (checkoutRequest.version) {
                    case 1:
                        const nimiqOptions = checkoutRequest.paymentOptions[0] as ParsedNimiqDirectPaymentOptions;
                        return {
                            appName: checkoutRequest.appName,
                            version: 1,
                            shopLogoUrl: checkoutRequest.shopLogoUrl,
                            sender: nimiqOptions.protocolSpecific.sender
                                ? nimiqOptions.protocolSpecific.sender!.toUserFriendlyAddress()
                                : undefined,
                            forceSender: nimiqOptions.protocolSpecific.forceSender,
                            recipient: nimiqOptions.protocolSpecific.recipient
                                ? nimiqOptions.protocolSpecific.recipient!.toUserFriendlyAddress()
                                : undefined,
                            recipientType: nimiqOptions.protocolSpecific.recipientType,
                            value: nimiqOptions.amount,
                            fee: nimiqOptions.protocolSpecific.fee,
                            extraData: checkoutRequest.data,
                            flags: nimiqOptions.protocolSpecific.flags,
                            validityDuration: nimiqOptions.protocolSpecific.validityDuration,
                        } as NimiqCheckoutRequest;
                    case 2:
                        return {
                            appName: checkoutRequest.appName,
                            version: 2,
                            shopLogoUrl: checkoutRequest.shopLogoUrl,
                            extraData: checkoutRequest.data,
                            callbackUrl: checkoutRequest.callbackUrl,
                            csrf: checkoutRequest.csrf,
                            time: checkoutRequest.time,
                            fiatAmount: checkoutRequest.fiatAmount || undefined,
                            fiatCurrency: checkoutRequest.fiatCurrency || undefined,
                            paymentOptions: checkoutRequest.paymentOptions.map((option) => {
                                switch (option.type) {
                                    case PaymentMethod.DIRECT:
                                        return option.raw();
                                    default:
                                        throw new Error('paymentOption.type not supported');
                                }
                            }),
                        } as MultiCurrencyCheckoutRequest;
                    }
            case RequestType.ONBOARD:
                const onboardRequest = request as ParsedOnboardRequest;
                return {
                    appName: onboardRequest.appName,
                    disableBack: onboardRequest.disableBack,
                } as OnboardRequest;
            case RequestType.SIGNUP:
            case RequestType.CHOOSE_ADDRESS:
            case RequestType.LOGIN:
            case RequestType.MIGRATE:
                return {
                    appName: request.appName,
                } as BasicRequest;
            case RequestType.CHANGE_PASSWORD:
            case RequestType.LOGOUT:
            case RequestType.ADD_ADDRESS:
                const simpleRequest = request as ParsedSimpleRequest;
                return {
                    appName: simpleRequest.appName,
                    accountId: simpleRequest.walletId,
                } as SimpleRequest;
            case RequestType.EXPORT:
                const exportRequest = request as ParsedExportRequest;
                return {
                    appName: exportRequest.appName,
                    accountId: exportRequest.walletId,
                    fileOnly: exportRequest.fileOnly,
                    wordsOnly: exportRequest.wordsOnly,
                } as ExportRequest;
            case RequestType.RENAME:
                const renameRequest = request as ParsedRenameRequest;
                return {
                    appName: renameRequest.appName,
                    accountId: renameRequest.walletId,
                    address: renameRequest.address,
                } as RenameRequest;
            case RequestType.SIGN_MESSAGE:
                const signMessageRequest = request as ParsedSignMessageRequest;
                return {
                    appName: signMessageRequest.appName,
                    signer: signMessageRequest.signer ? signMessageRequest.signer.toUserFriendlyAddress() : undefined,
                    message: signMessageRequest.message,
                } as SignMessageRequest;
            default:
                return null;
        }
    }
}
