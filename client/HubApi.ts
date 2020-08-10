import {
    PopupRequestBehavior,
    IFrameRequestBehavior,
    RequestBehavior,
    RedirectRequestBehavior,
    BehaviorType,
} from './RequestBehavior';
import { RedirectRpcClient } from '@nimiq/rpc';
import {
    RequestType,
    BasicRequest,
    SimpleRequest,
    OnboardRequest,
    CheckoutRequest,
    SignTransactionRequest,
    RenameRequest,
    SignMessageRequest,
    ExportRequest,
    ResultByRequestType,
    Account,
    Address,
    SignedTransaction,
    SimpleResult,
    ExportResult,
    SignedMessage,
    CreateCashlinkRequest,
    ManageCashlinkRequest,
    Cashlink,
    CashlinkState,
    CashlinkTheme,
    Currency,
    PaymentType,
    PaymentState,
} from './PublicRequestTypes';

export default class HubApi<DB extends BehaviorType = BehaviorType.POPUP> { // DB: Default Behavior
    // Expose request behaviors and enums. Not exporting them via regular exports to avoid that users of the umd build
    // have to use bundle['default'] to access the default export.
    public static readonly RequestType = RequestType;
    public static readonly RedirectRequestBehavior = RedirectRequestBehavior;
    public static readonly PopupRequestBehavior = PopupRequestBehavior;
    public static readonly CashlinkState = CashlinkState;
    public static readonly CashlinkTheme = CashlinkTheme;
    public static readonly Currency = Currency;
    public static readonly PaymentType = PaymentType;
    public static readonly PaymentState = PaymentState;
    public static readonly MSG_PREFIX = '\x16Nimiq Signed Message:\n';

    /** @deprecated */
    public static get PaymentMethod() {
        console.warn('PaymentMethod has been renamed to PaymentType. Access via HubApi.PaymentMethod will soon '
            + 'get disabled. Use HubApi.PaymentType instead.');
        return PaymentType;
    }

    private static get DEFAULT_ENDPOINT() {
        const originArray = location.origin.split('.');
        originArray.shift();
        const tld = originArray.join('.');

        switch (tld) {
            case 'nimiq.com':
                return 'https://hub.nimiq.com';
            case 'nimiq-testnet.com':
                return 'https://hub.nimiq-testnet.com';
            default:
                return 'http://localhost:8080';
        }
    }

    private readonly _endpoint: string;
    private readonly _defaultBehavior: RequestBehavior<DB>;
    private readonly _checkoutDefaultBehavior: RequestBehavior<DB>;
    private readonly _iframeBehavior: IFrameRequestBehavior;
    private readonly _redirectClient: RedirectRpcClient;

    constructor(endpoint: string = HubApi.DEFAULT_ENDPOINT, defaultBehavior?: RequestBehavior<DB>) {
        this._endpoint = endpoint;
        this._defaultBehavior = defaultBehavior || new PopupRequestBehavior(
            `left=${window.innerWidth / 2 - 400},top=75,width=800,height=850,location=yes,dependent=yes`) as any;
        // If no default behavior specified, use a default behavior with increased window height for checkout.
        this._checkoutDefaultBehavior = defaultBehavior || new PopupRequestBehavior(
            `left=${window.innerWidth / 2 - 400},top=50,width=800,height=895,location=yes,dependent=yes`) as any;
        this._iframeBehavior = new IFrameRequestBehavior();

        // Check for RPC results in the URL
        this._redirectClient = new RedirectRpcClient('', RequestBehavior.getAllowedOrigin(this._endpoint));
    }

    public checkRedirectResponse() {
        return this._redirectClient.init();
    }

    public on<T extends RequestType>(
        command: T,
        resolve: (result: ResultByRequestType<T>, state: any) => void,
        reject?: (error: Error, state: any) => void,
    ) {
        this._redirectClient.onResponse(command,
            // State is always an object containing at least the __command property
            (result: ResultByRequestType<T>, rpcId, state) => resolve(result, state),
            (error: Error, rpcId, state) => {
                if (!reject) return;
                reject(error, state);
            },
        );
    }

    /**
     * Public API
     */

    public createCashlink<B extends BehaviorType = DB>(
        request: Promise<CreateCashlinkRequest> | CreateCashlinkRequest,
        requestBehavior: RequestBehavior<B> = this._defaultBehavior as any,
    ): Promise<B extends BehaviorType.REDIRECT ? void : Cashlink> {
        return this._request(requestBehavior, RequestType.CREATE_CASHLINK, [request]);
    }

    public manageCashlink<B extends BehaviorType = DB>(
        request: Promise<ManageCashlinkRequest> | ManageCashlinkRequest,
        requestBehavior: RequestBehavior<B> = this._defaultBehavior as any,
    ): Promise<B extends BehaviorType.REDIRECT ? void : Cashlink> {
        return this._request(requestBehavior, RequestType.MANAGE_CASHLINK, [request]);
    }

    public checkout<R extends CheckoutRequest, B extends BehaviorType = DB>(
        request: Promise<R> | R,
        requestBehavior: RequestBehavior<B> = this._checkoutDefaultBehavior as any,
    ): Promise<B extends BehaviorType.REDIRECT
        ? void
        : R extends { version: 2 }
            ? SimpleResult | SignedTransaction
            : SignedTransaction
    > {
        return this._request(requestBehavior, RequestType.CHECKOUT, [request]) as any;
    }

    public chooseAddress<B extends BehaviorType = DB>(
        request: Promise<BasicRequest> | BasicRequest,
        requestBehavior: RequestBehavior<B> = this._defaultBehavior as any,
    ): Promise<B extends BehaviorType.REDIRECT ? void : Address> {
        return this._request(requestBehavior, RequestType.CHOOSE_ADDRESS, [request]);
    }

    public signTransaction<B extends BehaviorType = DB>(
        request: Promise<SignTransactionRequest> | SignTransactionRequest,
        requestBehavior: RequestBehavior<B> = this._defaultBehavior as any,
    ): Promise<B extends BehaviorType.REDIRECT ? void : SignedTransaction> {
        return this._request(requestBehavior, RequestType.SIGN_TRANSACTION, [request]);
    }

    public signMessage<B extends BehaviorType = DB>(
        request: Promise<SignMessageRequest> | SignMessageRequest,
        requestBehavior: RequestBehavior<B> = this._defaultBehavior as any,
    ): Promise<B extends BehaviorType.REDIRECT ? void : SignedMessage> {
        return this._request(requestBehavior, RequestType.SIGN_MESSAGE, [request]);
    }

    /**
     * Account Management
     *
     * Only accessible from Nimiq domains.
     */

    public onboard<B extends BehaviorType = DB>(
        request: Promise<OnboardRequest> | OnboardRequest,
        requestBehavior: RequestBehavior<B> = this._defaultBehavior as any,
    ): Promise<B extends BehaviorType.REDIRECT ? void : Account[]> {
        return this._request(requestBehavior, RequestType.ONBOARD, [request]);
    }

    public signup<B extends BehaviorType = DB>(
        request: Promise<BasicRequest> | BasicRequest,
        requestBehavior: RequestBehavior<B> = this._defaultBehavior as any,
    ): Promise<B extends BehaviorType.REDIRECT ? void : Account[]> {
        return this._request(requestBehavior, RequestType.SIGNUP, [request]);
    }

    public login<B extends BehaviorType = DB>(
        request: Promise<BasicRequest> | BasicRequest,
        requestBehavior: RequestBehavior<B> = this._defaultBehavior as any,
    ): Promise<B extends BehaviorType.REDIRECT ? void : Account[]> {
        return this._request(requestBehavior, RequestType.LOGIN, [request]);
    }

    public logout<B extends BehaviorType = DB>(
        request: Promise<SimpleRequest> | SimpleRequest,
        requestBehavior: RequestBehavior<B> = this._defaultBehavior as any,
    ): Promise<B extends BehaviorType.REDIRECT ? void : SimpleResult> {
        return this._request(requestBehavior, RequestType.LOGOUT, [request]);
    }

    public export<B extends BehaviorType = DB>(
        request: Promise<ExportRequest> | ExportRequest,
        requestBehavior: RequestBehavior<B> = this._defaultBehavior as any,
    ): Promise<B extends BehaviorType.REDIRECT ? void : ExportResult> {
        return this._request(requestBehavior, RequestType.EXPORT, [request]);
    }

    public changePassword<B extends BehaviorType = DB>(
        request: Promise<SimpleRequest> | SimpleRequest,
        requestBehavior: RequestBehavior<B> = this._defaultBehavior as any,
    ): Promise<B extends BehaviorType.REDIRECT ? void : SimpleResult> {
        return this._request(requestBehavior, RequestType.CHANGE_PASSWORD, [request]);
    }

    public addAddress<B extends BehaviorType = DB>(
        request: Promise<SimpleRequest> | SimpleRequest,
        requestBehavior: RequestBehavior<B> = this._defaultBehavior as any,
    ): Promise<B extends BehaviorType.REDIRECT ? void : Address> {
        return this._request(requestBehavior, RequestType.ADD_ADDRESS, [request]);
    }

    public rename<B extends BehaviorType = DB>(
        request: Promise<RenameRequest> | RenameRequest,
        requestBehavior: RequestBehavior<B> = this._defaultBehavior as any,
    ): Promise<B extends BehaviorType.REDIRECT ? void : Account> {
        return this._request(requestBehavior, RequestType.RENAME, [request]);
    }

    public migrate<B extends BehaviorType = DB>(
        requestBehavior: RequestBehavior<B> = this._defaultBehavior as any,
    ): Promise<B extends BehaviorType.REDIRECT ? void : Account[]> {
        return this._request(requestBehavior, RequestType.MIGRATE, [{ appName: 'Account list' }]);
    }

    /**
     * Only accessible in iframe from Nimiq domains.
     */
    public list<B extends BehaviorType = DB>(
        requestBehavior: RequestBehavior<B> = this._iframeBehavior as any,
    ): Promise<B extends BehaviorType.REDIRECT ? void : Account[]> {
        return this._request(requestBehavior, RequestType.LIST, []);
    }

    /**
     * Only accessible in iframe from Nimiq domains.
     */
    public cashlinks<B extends BehaviorType = DB>(
        requestBehavior: RequestBehavior<B> = this._iframeBehavior as any,
    ): Promise<B extends BehaviorType.REDIRECT ? void : Cashlink[]> {
        return this._request(requestBehavior, RequestType.LIST_CASHLINKS, []);
    }

    // END API

    /* PRIVATE METHODS */

    private _request<R extends RequestType, BT extends BehaviorType>(
        behavior: RequestBehavior<BT>,
        command: R,
        args: Iterable<PromiseLike<any> | any>,
    ) {
        return behavior.request<R>(this._endpoint, command, args);
    }
}
