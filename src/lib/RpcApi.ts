import { RpcServer, State as RpcState, ResponseStatus } from '@nimiq/rpc';
import { BrowserDetection } from '@nimiq/utils';
import { RootState } from '@/store';
import { Store } from 'vuex';
import Router from 'vue-router';
import { ParsedSimpleRequest, RequestType } from './RequestTypes';
import { RequestParser } from './RequestParser';
import { RpcRequest, RpcResult } from './PublicRequestTypes';
import { KeyguardCommand, KeyguardClient } from '@nimiq/keyguard-client';
import { keyguardResponseRouter } from '@/router';
import { StaticStore } from '@/lib/StaticStore';
import { WalletStore } from './WalletStore';
import { WalletType } from '@/lib/WalletInfo';
import CookieJar from '@/lib/CookieJar';
import { Raven } from 'vue-raven'; // Sentry.io SDK
import { ERROR_CANCELED } from './Constants';
import Config from 'config';

export default class RpcApi {
    private _server: RpcServer;
    private _store: Store<RootState>;
    private _staticStore: StaticStore;
    private _router: Router;
    private _keyguardClient: KeyguardClient;

    constructor(store: Store<RootState>, staticStore: StaticStore, router: Router) {
        this._store = store;
        this._staticStore = staticStore;
        this._router = router;
        this._server = new RpcServer('*');
        this._keyguardClient = new KeyguardClient(Config.keyguardEndpoint);

        this._registerAccountsApis([
            RequestType.SIGN_TRANSACTION,
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
    }

    public start() {
        this._server.init();
        this._keyguardClient.init().catch(console.error); // TODO: Provide better error handling here
    }

    public createKeyguardClient() {
        const localState = this._exportState();
        const client = new KeyguardClient(Config.keyguardEndpoint, window.location.origin, localState);
        return client;
    }

    public routerPush(routeName: string) {
        const query = this._parseUrlParams(window.location.search);
        this._router.push({name: routeName, query});
    }

    public routerReplace(routeName: string) {
        const query = this._parseUrlParams(window.location.search);
        this._router.replace({name: routeName, query});
    }

    public resolve(result: RpcResult) {
        this._reply(ResponseStatus.OK, result);
    }

    public reject(error: Error) {
        const ignoredErrors = [ ERROR_CANCELED, 'Request aborted' ];
        if (ignoredErrors.indexOf(error.message) < 0) {
            if (window.location.origin === 'https://accounts.nimiq-testnet.com') {
                Raven.captureException(error);
            }
        }

        this._reply(ResponseStatus.ERROR, error);
    }

    private async _reply(status: ResponseStatus, result: RpcResult | Error) {
        // Update cookies for iOS
        if (BrowserDetection.isIOS() || BrowserDetection.isSafari()) {
            const wallets = await WalletStore.Instance.list();
            CookieJar.fill(wallets);
        }

        // Check for originalRouteName in StaticStore and route there
        if (this._staticStore.originalRouteName && (!(result instanceof Error) || result.message !== ERROR_CANCELED)) {
            this._staticStore.sideResult = result;
            this._store.commit('setKeyguardResult', null);

            // Recreate original URL with original query parameters
            const rpcState = this._staticStore.rpcState!;
            const redirectUrlParams = rpcState.toRequestUrl('rpc://').substring('rpc://'.length);

            const query = this._parseUrlParams(redirectUrlParams);
            this._router.push({ name: this._staticStore.originalRouteName, query });
            delete this._staticStore.originalRouteName;
            return;
        }

        this._staticStore.rpcState!.reply(status, result);
    }

    private _exportState(): any {
        return {
            rpcState: this._staticStore.rpcState ? this._staticStore.rpcState.toJSON() : undefined,
            request: this._staticStore.request ? RequestParser.raw(this._staticStore.request) : undefined,
            kind: this._staticStore.request ? this._staticStore.request.kind : undefined,
            keyguardRequest: this._staticStore.keyguardRequest,
            originalRouteName: this._staticStore.originalRouteName,
        };
    }

    private _registerAccountsApis(requestTypes: RequestType[]) {
        for (const requestType of requestTypes) {
            // Server listener
            this._server.onRequest(requestType, async (state, arg: RpcRequest) => {
                let request;
                this._staticStore.rpcState = state;
                try {
                    request = RequestParser.parse(arg, state, requestType) || undefined;
                    this._staticStore.request = request;
                } catch (error) {
                    state.reply(ResponseStatus.ERROR, error);
                    return;
                }

                this._store.commit('setIncomingRequest', {
                    hasRpcState: !!this._staticStore.rpcState,
                    hasRequest: !!this._staticStore.request,
                });

                if (location.pathname !== '/') {
                    // Don't jump back to request's initial view on reload when navigated to a subsequent view.
                    // E.g. if the user switches from Checkout to Import, don't jump back to Checkout on reload.
                    return;
                }

                let account;
                if (request && 'walletId' in request) {
                    account = await WalletStore.Instance.get((request as ParsedSimpleRequest).walletId);
                }

                if (account && account.type === WalletType.LEDGER
                    && this._router.getMatchedComponents({ name: `${requestType}-ledger` }).length > 0) {
                    this.routerReplace(`${requestType}-ledger`);
                } else {
                    this.routerReplace(requestType);
                }
            });
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

        this._staticStore.rpcState = rpcState;
        this._staticStore.request = request || undefined;
        this._staticStore.keyguardRequest = keyguardRequest;
        this._staticStore.originalRouteName = originalRouteName;

        this._store.commit('setIncomingRequest', {
            hasRpcState: !!this._staticStore.rpcState,
            hasRequest: !!this._staticStore.request,
        });
    }

    private _registerKeyguardApis(commands: KeyguardCommand[]) {
        for (const command of commands) {
            // Server listener
            this._keyguardClient.on(command, (result, state) => {
                // Recover state
                this._recoverState(state);

                // Set result
                this._store.commit('setKeyguardResult', result);

                // To enable the keyguardResponseRouter to decide correctly to which route it should direct
                // when returning from the Keyguard's sign-transaction request, the original request kind that
                // was given to the AccountsManager is passed here and the keyguardResponseRouter is turned
                // from an object into a function instead.
                this.routerReplace(keyguardResponseRouter(command, this._staticStore.request!.kind).resolve);
            }, (error, state?: any) => {
                // Recover state
                this._recoverState(state);

                if (error.message === ERROR_CANCELED) {
                    this._staticStore.rpcState!.reply(ResponseStatus.ERROR, error);
                    return;
                }

                // Set result
                this._store.commit('setKeyguardResult', error);

                this.routerReplace(keyguardResponseRouter(command, this._staticStore.request!.kind).reject);
            });
        }
    }
}
