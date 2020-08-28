import { ResponseStatus, RpcServer, State as RpcState } from '@nimiq/rpc';
import { BrowserDetection } from '@nimiq/utils';
import { RootState } from '@/store';
import { Store } from 'vuex';
import Router, { Route } from 'vue-router';
import {
    ParsedCheckoutRequest,
    ParsedSignMessageRequest,
    ParsedSignTransactionRequest,
    ParsedSimpleRequest,
} from './RequestTypes';
import { RequestParser } from './RequestParser';
import { Currency, RequestType, RpcRequest, RpcResult } from '../../client/PublicRequestTypes';
import { ParsedNimiqDirectPaymentOptions } from './paymentOptions/NimiqPaymentOptions';
import {
    KeyguardClient,
    KeyguardCommand,
    Errors as KeyguardErrors,
    ObjectType,
    ResultByCommand,
} from '@nimiq/keyguard-client';
import { keyguardResponseRouter, REQUEST_ERROR } from '@/router';
import { StaticStore } from '@/lib/StaticStore';
import { WalletStore } from './WalletStore';
import { WalletType } from '@/lib/WalletInfo';
import Cashlink from '@/lib/Cashlink';
import CookieJar from '@/lib/CookieJar';
import { captureException } from '@sentry/browser';
import { ERROR_CANCELED } from './Constants';
import { includesOrigin } from '@/lib/Helpers';
import Config from 'config';
import { setHistoryStorage, getHistoryStorage } from '@/lib/Helpers';

export default class RpcApi {
    private static get HISTORY_KEY_RPC_STATE() {
        return 'rpc-api-exported-state';
    }

    private _server: RpcServer;
    private _store: Store<RootState>;
    private _staticStore: StaticStore;
    private _router: Router;
    private _keyguardClient: KeyguardClient;

    private _3rdPartyRequestWhitelist: RequestType[] = [
        RequestType.CHECKOUT,
        RequestType.SIGN_TRANSACTION,
        RequestType.SIGN_MESSAGE,
        RequestType.CHOOSE_ADDRESS,
        RequestType.CREATE_CASHLINK,
        RequestType.MANAGE_CASHLINK,
    ];

    constructor(store: Store<RootState>, staticStore: StaticStore, router: Router) {
        this._store = store;
        this._staticStore = staticStore;
        this._router = router;
        this._server = new RpcServer('*');
        this._keyguardClient = new KeyguardClient(Config.keyguardEndpoint);

        // On reload recover any state exported to the current history entry. Note that if we came back from the
        // Keyguard by history back navigation and rejectOnBack was enabled for the request, the state provided to
        // _keyguardErrorHandler will overwrite the state here.
        if (getHistoryStorage(RpcApi.HISTORY_KEY_RPC_STATE)) {
            this._recoverState(getHistoryStorage(RpcApi.HISTORY_KEY_RPC_STATE));
        }

        this._registerHubApis([
            RequestType.SIGN_TRANSACTION,
            RequestType.CREATE_CASHLINK,
            RequestType.MANAGE_CASHLINK,
            RequestType.CHECKOUT,
            RequestType.ONBOARD,
            RequestType.SIGNUP,
            RequestType.LOGIN,
            RequestType.EXPORT,
            RequestType.CHANGE_PASSWORD,
            RequestType.LOGOUT,
            RequestType.ADD_ADDRESS,
            RequestType.RENAME,
            RequestType.SIGN_MESSAGE,
            RequestType.MIGRATE,
            RequestType.CHOOSE_ADDRESS,
        ]);
        this._registerKeyguardApis([
            KeyguardCommand.SIGN_TRANSACTION,
            KeyguardCommand.CREATE,
            KeyguardCommand.IMPORT,
            KeyguardCommand.EXPORT,
            KeyguardCommand.CHANGE_PASSWORD,
            KeyguardCommand.REMOVE,
            KeyguardCommand.DERIVE_ADDRESS,
            KeyguardCommand.SIGN_MESSAGE,
        ]);

        this._router.beforeEach((to: Route, from: Route, next: (arg?: string | false | Route) => void) => {
            // There is an intial redirect from '/' to '/' which does not need to be handled at all.
            if (to.name === REQUEST_ERROR || (to.path === '/' && from.path === '/')) {
                next();
                return;
            }

            // If the navigation call already contains an rpcId, do not replace it.
            if ( to.query.rpcId ) {
                next();
                return;
            }

            const rpcId = from.query.rpcId || this._parseUrlParams(window.location.search).rpcId;
            // In case no rpcId can be found, the request is not functional and needs to be rejected.
            if (!rpcId) {
                this.reject(new Error('UNEXPECTED: RpcId not present'));
                next(false);
                return;
            }

            next({
                ...to,
                query: {
                    ...to.query,
                    rpcId,
                },
            });
        });

        this._router.afterEach((to: Route, from: Route) => {
            // There is an intial redirect from '/' to '/' which does not need to be handled at all.
            if (to.path === '/' && from.path === '/') {
                return;
            }
            // If we have an rpcState, export the entire state to the newly pushed history entry
            // to be available on reload.
            // This is potentially redundand to the above condition but added as a precaution,
            // especially considering the no-request case a few lines down within RpcApi.start().
            if (this._staticStore.rpcState) {
                // A small timeout is needed, since Vue does push the new history state only after the afterEach
                // hooks are executed, thus overwriting any state set in these hooks.
                window.setTimeout(() => setHistoryStorage(RpcApi.HISTORY_KEY_RPC_STATE, this._exportState()), 10);
            }
        });
    }

    public start() {
        this._keyguardClient.init().catch(console.error); // TODO: Provide better error handling here
        if (this._store.state.keyguardResult) return;

        // If there is no request:
        // If no opener is set and there is a previous history entry and there is no data passed in the URL,
        // redirect to Safe. Otherwise, show error page.
        const onClientTimeout = () => {
            if (window.opener === null && window.history.length > 1 && !window.location.hash) {
                location.href = Config.redirectTarget;
            } else {
                this._router.replace({name: REQUEST_ERROR});
            }
        };
        this._server.init(onClientTimeout);
    }

    public createKeyguardClient(handleHistoryBack?: boolean) {
        const localState = this._exportState();
        const client = new KeyguardClient(
            Config.keyguardEndpoint,
            window.location.origin,
            localState,
            undefined, // preserveRequests: keep default behavior, which is true for redirects but false for postMessage
            handleHistoryBack,
        );
        if (!handleHistoryBack) {
            // The Keyguard client rejects on history back only if handleHistoryBack is activated. If the Keyguard does
            // not reject it also does not provide us the localState to recover. For this case, we encode it manually in
            // the history, to retrieve it from there.
            setHistoryStorage(RpcApi.HISTORY_KEY_RPC_STATE, this._exportState());
        }
        return client;
    }

    public resolve(result: RpcResult) {
        this._reply(ResponseStatus.OK, result);
    }

    public reject(error: Error) {
        const ignoredErrorTypes = [ KeyguardErrors.Types.INVALID_REQUEST.toString() ];
        const ignoredErrors = [ ERROR_CANCELED, 'Request aborted', 'WalletId not found', 'Address not found' ];
        if (ignoredErrorTypes.indexOf(error.name) < 0 && ignoredErrors.indexOf(error.message) < 0) {
            if (Config.reportToSentry) {
                console.debug('Request:', JSON.stringify(this._staticStore.request));
                captureException(error);
            }
        }

        this._reply(ResponseStatus.ERROR, error);
    }

    public get keyguardClient(): KeyguardClient {
        return this._keyguardClient;
    }

    private async _reply(status: ResponseStatus, result: RpcResult | Error) {
        // Update cookies for iOS
        if (BrowserDetection.isIOS() || BrowserDetection.isSafari()) {
            const wallets = await WalletStore.Instance.list();
            CookieJar.fill(wallets);
        }

        // Check for originalRouteName in StaticStore and route there
        const originalRoute = this._staticStore.originalRouteName;
        if (originalRoute && (!(result instanceof Error) || result.message !== ERROR_CANCELED)) {
            this._staticStore.sideResult = result;
            this._store.commit('setKeyguardResult', null);

            // Recreate original URL with original query parameters
            const rpcState = this._staticStore.rpcState!;
            const query = { rpcId: rpcState.id.toString() };
            delete this._staticStore.originalRouteName;
            this._router.push({name: originalRoute, query});
            return;
        }

        this._staticStore.rpcState!.reply(status, result);
    }

    private _exportState(): any {
        return {
            rpcState: this._staticStore.rpcState!.toJSON(),
            request: this._staticStore.request ? RequestParser.raw(this._staticStore.request) : undefined,
            kind: this._staticStore.request ? this._staticStore.request.kind : undefined,
            keyguardRequest: this._staticStore.keyguardRequest,
            originalRouteName: this._staticStore.originalRouteName,
            cashlink: this._staticStore.cashlink ? this._staticStore.cashlink.toObject() : undefined,
        };
    }

    private _registerHubApis(requestTypes: RequestType[]) {
        for (const requestType of requestTypes) {
            // Server listener
            this._server.onRequest(requestType, (state, arg) => this._hubApiHandler(requestType, state, arg));
        }
    }

    private async _hubApiHandler(requestType: RequestType, state: RpcState, arg: RpcRequest) {
        let request;

        if ( // Check that a non-whitelisted request comes from a privileged origin
            !this._3rdPartyRequestWhitelist.includes(requestType)
            && !includesOrigin(Config.privilegedOrigins, state.origin)
        ) {
            state.reply(ResponseStatus.ERROR, new Error(`${state.origin} is unauthorized to call ${requestType}`));
            return;
        }

        this._staticStore.rpcState = state;
        try {
            request = RequestParser.parse(arg, state, requestType) || undefined;
            this._staticStore.request = request;
        } catch (error) {
            this.reject(error);
            return;
        }

        const wallets = await WalletStore.Instance.list();
        if (!wallets.length) {
            const hasLegacyAccounts = (await this._keyguardClient.hasLegacyAccounts()).success;
            if (hasLegacyAccounts) {
                // Keyguard has legacy accounts, redirect to migration
                if (requestType !== RequestType.MIGRATE) {
                    this._staticStore.originalRouteName = requestType;
                }
                this._router.replace({name: RequestType.MIGRATE});
                this._startRoute();
                return;
            }
        }

        let account;
        // Simply testing if the property exists (with `'walletId' in request`) is not enough,
        // as `undefined` also counts as existing.
        if (request) {
            let accountRequired: boolean | undefined;
            let errorMsg = 'Address not found'; // Error message for all cases but the first
            if ((request as ParsedSimpleRequest).walletId) {
                accountRequired = true;
                account = await WalletStore.Instance.get((request as ParsedSimpleRequest).walletId);
                if (!account) errorMsg = 'WalletId not found';
            } else if (requestType === RequestType.SIGN_TRANSACTION) {
                accountRequired = true;
                const address = (request as ParsedSignTransactionRequest).sender;
                account = this._store.getters.findWalletByAddress(address.toUserFriendlyAddress(), true);
            } else if (requestType === RequestType.SIGN_MESSAGE) {
                accountRequired = false; // Sign message allows user to select an account
                const address = (request as ParsedSignMessageRequest).signer;
                if (address) {
                    account = this._store.getters.findWalletByAddress(address.toUserFriendlyAddress(), false);
                }
            } else if (requestType === RequestType.CHECKOUT) {
                const checkoutRequest = request as ParsedCheckoutRequest;
                // forceSender only applies to NIM-only checkouts.
                if (checkoutRequest.paymentOptions.length === 1
                    && checkoutRequest.paymentOptions[0].currency === Currency.NIM) {

                    /**
                     * Later on can potentially be ParsedNimiqOasisPaymentOptions.
                     * If it will contain the forceSender flag as well it should not be an issue.
                     */
                    const protocolSpecific =
                        (checkoutRequest.paymentOptions[0] as ParsedNimiqDirectPaymentOptions).protocolSpecific;

                    accountRequired = protocolSpecific.forceSender;
                    if (protocolSpecific.sender) {
                        account = this._store.getters.findWalletByAddress(
                            protocolSpecific.sender.toUserFriendlyAddress(),
                            true,
                        );
                    }
                }
            }
            if (accountRequired && !account) {
                this.reject(new Error(errorMsg));
                return;
            }
        }

        this._startRoute();

        if (location.pathname !== '/') {
            // Don't jump back to request's initial view on reload when navigated to a subsequent view.
            // E.g. if the user switches from Checkout to Import, don't jump back to Checkout on reload.
            return;
        }

        if (account && account.type === WalletType.LEDGER
            && this._router.getMatchedComponents({ name: `${requestType}-ledger` }).length > 0) {
            this._router.replace({name: `${requestType}-ledger`});
        } else {
            this._router.replace({name: requestType});
        }
    }

    private _parseUrlParams(query: string) {
        const params: {[key: string]: string} = {};
        if (!query) return params;
        const keyValues = query.substr(1).replace(/\+/g, ' ').split('&')
            .map((keyValueString) => keyValueString.split('='));

        for (const keyValue of keyValues) {
            // @ts-ignore Property 'decodeURIComponent' does not exist on type 'Window'
            params[keyValue[0]] = window.decodeURIComponent(keyValue[1]);
        }

        return params;
    }

    private _recoverState(storedState: any) {
        const rpcState = RpcState.fromJSON(storedState.rpcState);
        const request = RequestParser.parse(storedState.request, rpcState, storedState.kind);
        const keyguardRequest = storedState.keyguardRequest;
        const originalRouteName = storedState.originalRouteName;
        const cashlink = storedState.cashlink ? Cashlink.fromObject(storedState.cashlink) : undefined;

        this._staticStore.rpcState = rpcState;
        this._staticStore.request = request || undefined;
        this._staticStore.keyguardRequest = keyguardRequest;
        this._staticStore.originalRouteName = originalRouteName;
        this._staticStore.cashlink = cashlink;
    }

    private _registerKeyguardApis(commands: KeyguardCommand[]) {
        for (const command of commands) {
            // Server listener
            this._keyguardClient.on(command,
                (result, state) => this._keyguardSuccessHandler(command, result, state),
                (error, state) => this._keyguardErrorHandler(command, error, state),
            );
        }
    }

    private _keyguardSuccessHandler<C extends KeyguardCommand>(
        command: C,
        result: ResultByCommand<C>,
        state?: ObjectType | null,
    ) {
        // Recover state
        this._recoverState(state);

        // Set result
        this._store.commit('setKeyguardResult', result);

        // To enable the keyguardResponseRouter to decide correctly to which route it should direct
        // when returning from the Keyguard's sign-transaction request, the original request kind that
        // was given to the Hub is passed here and the keyguardResponseRouter is turned
        // from an object into a function instead.
        this._router.replace({name: keyguardResponseRouter(command, this._staticStore.request!.kind).resolve});

        this._startRoute();
    }

    private _keyguardErrorHandler(command: KeyguardCommand, error: Error, state: any) {
        // Recover state
        this._recoverState(state);

        // Set result
        this._store.commit('setKeyguardResult', error);

        if (error.message === KeyguardErrors.Messages.CANCELED) {
            this.reject(error);
            return;
        }

        if (error.message === 'Request aborted') {
            /*
             * In case the window is a popup and the recovered state is the one with which the popup was
             * initialized (has a source), then reject it. The popup will be closed as a result.
             * If not, there was another history entry in between, where a history.back() will navigate to,
             * not closing the popup in the process.
             */
            if (this._staticStore.rpcState!.source && window.opener) {
                this.reject(error);
            } else {
                window.history.back();
            }
            return;
        }

        this._startRoute();

        if (error.message === KeyguardErrors.Messages.EXPIRED) {
            // Don't reject but navigate to checkout to display the expiration warning there.
            this._router.replace({ name: RequestType.CHECKOUT });
            return;
        }

        this._router.replace({name: keyguardResponseRouter(command, this._staticStore.request!.kind).reject});
    }

    private _startRoute() {
        this._store.commit('setRequestLoaded', !!(this._staticStore.rpcState && this._staticStore.request));
    }
}
