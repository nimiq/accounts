import { isMilliseconds, includesOrigin } from './Helpers';
import { State } from '@nimiq/rpc';
import {
    BasicRequest,
    CashlinkTheme,
    CheckoutRequest,
    CreateCashlinkRequest,
    ExportRequest,
    ManageCashlinkRequest,
    OnboardRequest,
    RenameRequest,
    RpcRequest,
    SignMessageRequest,
    SignTransactionRequest,
    SimpleRequest,
    Currency,
    PaymentType,
    RequestType,
    NimiqCheckoutRequest,
    MultiCurrencyCheckoutRequest,
} from '../../client/PublicRequestTypes';
import {
    ParsedBasicRequest,
    ParsedCheckoutRequest,
    ParsedCreateCashlinkRequest,
    ParsedExportRequest,
    ParsedManageCashlinkRequest,
    ParsedOnboardRequest,
    ParsedRenameRequest,
    ParsedRpcRequest,
    ParsedSignMessageRequest,
    ParsedSignTransactionRequest,
    ParsedSimpleRequest,
} from './RequestTypes';
import { ParsedNimiqDirectPaymentOptions } from './paymentOptions/NimiqPaymentOptions';
import { ParsedEtherDirectPaymentOptions } from './paymentOptions/EtherPaymentOptions';
import { ParsedBitcoinDirectPaymentOptions } from './paymentOptions/BitcoinPaymentOptions';
import { Utf8Tools } from '@nimiq/utils';
import Config from 'config';

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
                    sender: Nimiq.Address.fromString(signTransactionRequest.sender),
                    recipient: Nimiq.Address.fromString(signTransactionRequest.recipient),
                    recipientType: signTransactionRequest.recipientType || Nimiq.Account.Type.BASIC,
                    recipientLabel: signTransactionRequest.recipientLabel,
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

                let disableDisclaimer = !!checkoutRequest.disableDisclaimer;
                if (disableDisclaimer && !includesOrigin(Config.privilegedOrigins, state.origin)) {
                    // warn and continue
                    console.warn(`Origin ${state.origin} is not authorized to request disableDisclaimer.`);
                    disableDisclaimer = false;
                }

                if (!checkoutRequest.version || checkoutRequest.version === 1) {
                    if (typeof checkoutRequest.value !== 'number' || checkoutRequest.value <= 0) {
                        throw new Error('value must be a number >0');
                    }

                    return {
                        kind: RequestType.CHECKOUT,
                        version: 1,
                        appName: checkoutRequest.appName,
                        shopLogoUrl: checkoutRequest.shopLogoUrl,
                        time: Date.now(),
                        paymentOptions: [new ParsedNimiqDirectPaymentOptions({
                            currency: Currency.NIM,
                            type: PaymentType.DIRECT,
                            amount: checkoutRequest.value.toString(),
                            expires: 0, // unused for NimiqCheckoutRequests
                            protocolSpecific: {
                                extraData: checkoutRequest.extraData,
                                recipient: checkoutRequest.recipient,
                                recipientType: checkoutRequest.recipientType || Nimiq.Account.Type.BASIC,
                                sender: checkoutRequest.sender,
                                forceSender: !!checkoutRequest.forceSender,
                                fee: checkoutRequest.fee || 0,
                                flags: checkoutRequest.flags || Nimiq.Transaction.Flag.NONE,
                                validityDuration: checkoutRequest.validityDuration,
                            },
                        })],
                        disableDisclaimer,
                    } as ParsedCheckoutRequest;
                }

                if (checkoutRequest.version === 2) {
                    if ( // Check if the origin is allowed to make requests without a NIM payment option
                        !includesOrigin(Config.checkoutWithoutNimOrigins, state.origin)
                        && !checkoutRequest.paymentOptions.some((option) => option.currency === Currency.NIM)
                    ) {
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
                        if (checkoutRequest.paymentOptions.some((option) => option.currency !== Currency.NIM)) {
                            throw new Error('A callbackUrl: string is required for currencies other than NIM to ' +
                                'monitor payments.');
                        }
                        if (!checkoutRequest.paymentOptions.every((option) => !!option.protocolSpecific.recipient)) {
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
                        time: !checkoutRequest.time
                            ? Date.now()
                            : isMilliseconds(checkoutRequest.time)
                                ? checkoutRequest.time
                                : checkoutRequest.time * 1000,
                        fiatCurrency: checkoutRequest.fiatCurrency,
                        fiatAmount: checkoutRequest.fiatAmount,
                        paymentOptions: checkoutRequest.paymentOptions.map((option) => {
                            if (currencies.has(option.currency)) {
                                throw new Error('Only one paymentOption can be provided per cryptocurrency');
                            } else {
                                currencies.add(option.currency);
                            }
                            switch (option.type) {
                                case PaymentType.DIRECT:
                                    switch (option.currency) {
                                        case Currency.NIM:
                                            // Once extraData from MultiCurrencyCheckoutRequest is removed
                                            // the next few lines become obsolete.
                                            if (!option.protocolSpecific.extraData && checkoutRequest.extraData) {
                                                console.warn('Usage of MultiCurrencyCheckoutRequest.extraData is'
                                                    + ' deprecated. Use NimiqDirectPaymentOptions.protocolSpecific'
                                                    + '.extraData instead');

                                                option.protocolSpecific.extraData = checkoutRequest.extraData;
                                            }
                                            return new ParsedNimiqDirectPaymentOptions(option);
                                        case Currency.ETH:
                                            return new ParsedEtherDirectPaymentOptions(option);
                                        case Currency.BTC:
                                            return new ParsedBitcoinDirectPaymentOptions(option);
                                        default:
                                            throw new Error(`Currency ${(option as any).currency} not supported`);
                                    }
                                default:
                                    throw new Error(`PaymentType ${(option as any).type} not supported`);
                            }
                        }),
                        disableDisclaimer,
                    } as ParsedCheckoutRequest;
                }

                throw new Error('Invalid version: must be 1 or 2');
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
                        ? Nimiq.Address.fromString(signMessageRequest.signer)
                        : undefined,
                    message: signMessageRequest.message,
                } as ParsedSignMessageRequest;
            case RequestType.CREATE_CASHLINK:
                const createCashlinkRequest = request as CreateCashlinkRequest;
                const senderAddress = 'senderAddress' in createCashlinkRequest && !!createCashlinkRequest.senderAddress
                    ? Nimiq.Address.fromString(createCashlinkRequest.senderAddress)
                    : undefined;
                const senderBalance = 'senderBalance' in createCashlinkRequest
                    ? createCashlinkRequest.senderBalance
                    : undefined;
                if (senderBalance !== undefined && !Nimiq.NumberUtils.isUint64(senderBalance)) {
                    throw new Error('Invalid Cashlink senderBalance');
                }

                const value = createCashlinkRequest.value;
                if (value !== undefined && (!Nimiq.NumberUtils.isUint64(value) || value === 0)) {
                    throw new Error('Malformed Cashlink value');
                }

                let message = 'message' in createCashlinkRequest ? createCashlinkRequest.message : undefined;
                if (message !== undefined) {
                    if (typeof message !== 'string') {
                        throw new Error('Cashlink message must be a string');
                    }
                    const { result: truncated, didTruncate } = Utf8Tools.truncateToUtf8ByteLength(message, 255);
                    if (!('autoTruncateMessage' in createCashlinkRequest && createCashlinkRequest.autoTruncateMessage)
                        && didTruncate) {
                        throw new Error('Cashlink message must be shorter than 256 bytes or autoTruncateMessage must '
                            + 'be enabled.');
                    }
                    message = truncated;
                }

                const theme = createCashlinkRequest.theme || CashlinkTheme.UNSPECIFIED;
                if (!Object.values(CashlinkTheme).includes(theme) || !Nimiq.NumberUtils.isUint8(theme)) {
                    // Also checking whether theme is a valid Uint8 to catch ids that are potentially to high in the
                    // CashlinkTheme enum and to filter out values that are actually the enum keys that have been added
                    // by typescript for reverse mapping.
                    throw new Error('Invalid Cashlink theme');
                }

                const returnLink = !!createCashlinkRequest.returnLink;
                if (returnLink && !includesOrigin(Config.privilegedOrigins, state.origin)) {
                    throw new Error(`Origin ${state.origin} is not authorized to request returnLink.`);
                }
                const skipSharing = !!createCashlinkRequest.returnLink && !!createCashlinkRequest.skipSharing;

                return {
                    kind: RequestType.CREATE_CASHLINK,
                    appName: createCashlinkRequest.appName,
                    senderAddress,
                    senderBalance,
                    value,
                    message,
                    theme,
                    returnLink,
                    skipSharing,
                } as ParsedCreateCashlinkRequest;
            case RequestType.MANAGE_CASHLINK:
                const manageCashlinkRequest = request as ManageCashlinkRequest;
                return {
                    kind: RequestType.MANAGE_CASHLINK,
                    appName: manageCashlinkRequest.appName,
                    cashlinkAddress: Nimiq.Address.fromString(manageCashlinkRequest.cashlinkAddress),
                } as ParsedManageCashlinkRequest;
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
                    recipientLabel: signTransactionRequest.recipientLabel,
                    value: signTransactionRequest.value,
                    fee: signTransactionRequest.fee,
                    extraData: signTransactionRequest.data,
                    flags: signTransactionRequest.flags,
                    validityStartHeight: signTransactionRequest.validityStartHeight,
                } as SignTransactionRequest;
            case RequestType.CREATE_CASHLINK:
                const createCashlinkRequest = request as ParsedCreateCashlinkRequest;
                // Note that there is no need to export autoTruncateMessage as the message already got truncated
                return {
                    appName: createCashlinkRequest.appName,
                    senderAddress: createCashlinkRequest.senderAddress
                            ? createCashlinkRequest.senderAddress.toUserFriendlyAddress()
                            : undefined,
                    senderBalance: createCashlinkRequest.senderBalance,
                    value: createCashlinkRequest.value,
                    message: createCashlinkRequest.message,
                    theme: createCashlinkRequest.theme,
                    returnLink: createCashlinkRequest.returnLink,
                    skipSharing: createCashlinkRequest.skipSharing,
                } as CreateCashlinkRequest;
            case RequestType.MANAGE_CASHLINK:
                const manageCashlinkRequest = request as ParsedManageCashlinkRequest;
                return {
                    appName: manageCashlinkRequest.appName,
                    cashlinkAddress: manageCashlinkRequest.cashlinkAddress
                        ? manageCashlinkRequest.cashlinkAddress.toUserFriendlyAddress()
                        : undefined,
                } as ManageCashlinkRequest;
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
                            extraData: nimiqOptions.protocolSpecific.extraData,
                            flags: nimiqOptions.protocolSpecific.flags,
                            validityDuration: nimiqOptions.protocolSpecific.validityDuration,
                            disableDisclaimer: checkoutRequest.disableDisclaimer,
                        } as NimiqCheckoutRequest;
                    case 2:
                        return {
                            ...checkoutRequest,
                            paymentOptions: checkoutRequest.paymentOptions.map((option) => option.raw()),
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
