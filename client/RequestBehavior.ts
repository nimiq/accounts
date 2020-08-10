import { PostMessageRpcClient, RedirectRpcClient } from '@nimiq/rpc';
import { ResultByRequestType, RequestType } from './PublicRequestTypes';

export abstract class RequestBehavior<B extends BehaviorType> {
    public static getAllowedOrigin(endpoint: string) {
        const url = new URL(endpoint);
        return url.origin;
    }

    private readonly _type: B;

    constructor(type: B) {
        this._type = type;
    }

    public async request<R extends RequestType>(
        endpoint: string,
        command: R,
        args: Iterable<PromiseLike<any> | any>,
    ): Promise<B extends BehaviorType.REDIRECT ? void : ResultByRequestType<R>> {
        throw new Error('Not implemented');
    }
}

export enum BehaviorType {
    REDIRECT,
    POPUP,
    IFRAME,
}

export class RedirectRequestBehavior extends RequestBehavior<BehaviorType.REDIRECT> {
    public static withLocalState(localState: any) {
        return new RedirectRequestBehavior(undefined, localState);
    }

    private readonly _returnUrl: string;
    private readonly _localState: any;

    constructor(returnUrl?: string, localState?: any) {
        super(BehaviorType.REDIRECT);
        const location = window.location;
        this._returnUrl = returnUrl || `${location.origin}${location.pathname}`;
        this._localState = localState || {};

        // Reject local state with reserved property.
        if (typeof this._localState.__command !== 'undefined') {
            throw new Error('Invalid localState: Property \'__command\' is reserved');
        }
    }

    public async request<R extends RequestType>(
        endpoint: string,
        command: R,
        args: Iterable<PromiseLike<any> | any>,
    ): Promise<void> {
        const origin = RequestBehavior.getAllowedOrigin(endpoint);

        const client = new RedirectRpcClient(endpoint, origin);
        await client.init();

        const state: object = Object.assign({}, this._localState, { __command: command });
        client.callAndSaveLocalState(this._returnUrl, state, command, true, ...(await Promise.all(args)));
    }
}

export class PopupRequestBehavior extends RequestBehavior<BehaviorType.POPUP> {
    private static DEFAULT_FEATURES = '';
    private static DEFAULT_OPTIONS = {
        overlay: true,
    };
    private _popupFeatures: typeof PopupRequestBehavior.DEFAULT_FEATURES;
    private _options: typeof PopupRequestBehavior.DEFAULT_OPTIONS;

    constructor(
        popupFeatures = PopupRequestBehavior.DEFAULT_FEATURES,
        options?: typeof PopupRequestBehavior.DEFAULT_OPTIONS,
    ) {
        super(BehaviorType.POPUP);
        this._popupFeatures = popupFeatures;
        this._options = {
            ...PopupRequestBehavior.DEFAULT_OPTIONS,
            ...options,
        };
    }

    public async request<R extends RequestType>(
        endpoint: string,
        command: R,
        args: Iterable<PromiseLike<any> | any>,
    ): Promise<ResultByRequestType<R>> {
        const origin = RequestBehavior.getAllowedOrigin(endpoint);

        const popup = this.createPopup(endpoint);

        // Add page overlay
        const $overlay = this.appendOverlay(popup);

        const client = new PostMessageRpcClient(popup, origin);

        try {
            await client.init();
            return await client.call(command, ...(await Promise.all(args)));
        } catch (e) {
            throw e;
        } finally {
            // Remove page overlay
            this.removeOverlay($overlay);

            client.close();
            popup.close();
        }
    }

    public createPopup(url: string) {
        const popup = window.open(url, 'NimiqAccounts', this._popupFeatures);
        if (!popup) {
            throw new Error('Failed to open popup');
        }
        return popup;
    }

    private appendOverlay(popup: Window): HTMLDivElement | null {
        if (!this._options.overlay) return null;

        // Define DOM-method abstractions to allow better minification
        const createElement = document.createElement.bind(document);
        const createTextNode = document.createTextNode.bind(document);
        const appendChild = (node: Node, child: Node) => node.appendChild(child);

        // Overlay background
        const overlay = createElement('div');
        overlay.id = 'nimiq-hub-overlay';
        const overlayStyle = overlay.style;
        overlayStyle.position = 'fixed';
        overlayStyle.top = '0';
        overlayStyle.right = '0';
        overlayStyle.bottom = '0';
        overlayStyle.left = '0';
        overlayStyle.background = 'rgba(31, 35, 72, 0.8)';
        overlayStyle.display = 'flex';
        overlayStyle.flexDirection = 'column';
        overlayStyle.alignItems = 'center';
        overlayStyle.justifyContent = 'space-between';
        overlayStyle.cursor = 'pointer';
        overlayStyle.color = 'white';
        overlayStyle.textAlign = 'center';
        overlayStyle.opacity = '0';
        overlayStyle.transition = 'opacity 0.6s ease';
        overlayStyle.zIndex = '99999';
        overlay.addEventListener('click', () => popup.focus());

        // Top flex spacer
        appendChild(overlay, createElement('div'));

        // Explainer text
        const text = createElement('div');
        const textStyle = text.style;
        appendChild(text, createTextNode('A popup has been opened,'));
        appendChild(text, createElement('br'));
        appendChild(text, createTextNode('click anywhere to bring it back to the front.'));
        // tslint:disable-next-line max-line-length
        textStyle.fontFamily = 'Muli, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif';
        textStyle.fontSize = '24px';
        textStyle.fontWeight = '600';
        textStyle.lineHeight = '40px';
        appendChild(overlay, text);

        // Logo
        const logo = createElement('img');
        // tslint:disable-next-line max-line-length
        logo.src = 'data:image/svg+xml,<svg width="135" height="32" viewBox="0 0 135 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M35.6 14.5l-7.5-13A3 3 0 0025.5 0h-15a3 3 0 00-2.6 1.5l-7.5 13a3 3 0 000 3l7.5 13a3 3 0 002.6 1.5h15a3 3 0 002.6-1.5l7.5-13a3 3 0 000-3z" fill="url(%23hub-overlay-nimiq-logo)"/><path d="M62.25 6.5h3.26v19H63L52.75 12.25V25.5H49.5v-19H52l10.25 13.25V6.5zM72 25.5v-19h3.5v19H72zM97.75 6.5h2.75v19h-3V13.75L92.37 25.5h-2.25L85 13.75V25.5h-3v-19h2.75l6.5 14.88 6.5-14.88zM107 25.5v-19h3.5v19H107zM133.88 21.17a7.91 7.91 0 01-4.01 3.8c.16.38.94 1.44 1.52 2.05.59.6 1.2 1.23 1.98 1.86L131 30.75a15.91 15.91 0 01-4.45-5.02l-.8.02c-1.94 0-3.55-.4-4.95-1.18a7.79 7.79 0 01-3.2-3.4 11.68 11.68 0 01-1.1-5.17c0-2.03.37-3.69 1.12-5.17a7.9 7.9 0 013.2-3.4 9.8 9.8 0 014.93-1.18c1.9 0 3.55.4 4.94 1.18a7.79 7.79 0 013.2 3.4 11.23 11.23 0 011.1 5.17c0 2.03-.44 3.83-1.11 5.17zm-12.37.01a5.21 5.21 0 004.24 1.82 5.2 5.2 0 004.23-1.82c1.01-1.21 1.52-2.92 1.52-5.18 0-2.24-.5-4-1.52-5.2a5.23 5.23 0 00-4.23-1.8c-1.82 0-3.23.6-4.24 1.79-1 1.2-1.51 2.95-1.51 5.21s.5 3.97 1.51 5.18z" fill="white"/><defs><radialGradient id="hub-overlay-nimiq-logo" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(-35.9969 0 0 -32 36 32)"><stop stop-color="%23EC991C"/><stop offset="1" stop-color="%23E9B213"/></radialGradient></defs></svg>';
        logo.style.marginBottom = '56px';
        appendChild(overlay, logo);

        // Close button
        const button = createElement('div');
        const buttonStyle = button.style;
        button.innerHTML = '&times;';
        buttonStyle.position = 'absolute';
        buttonStyle.top = '8px';
        buttonStyle.right = '8px';
        buttonStyle.fontSize = '24px';
        buttonStyle.lineHeight = '32px';
        buttonStyle.fontWeight = '600';
        buttonStyle.width = '32px';
        buttonStyle.height = '32px';
        buttonStyle.opacity = '0.8';
        button.addEventListener('click', () => popup.close());
        appendChild(overlay, button);

        // The 100ms delay is not just because the DOM element needs to be rendered before it
        // can be animated, but also because it actually feels better when there is a short
        // delay between the opening popup and the background fading.
        setTimeout(() => overlay.style.opacity = '1', 100);

        return appendChild(document.body, overlay) as HTMLDivElement;
    }

    private removeOverlay($overlay: HTMLDivElement | null): void {
        if (!$overlay) return;

        $overlay.style.opacity = '0';
        setTimeout(() => document.body.removeChild($overlay), 400);
    }
}

export class IFrameRequestBehavior extends RequestBehavior<BehaviorType.IFRAME> {
    private static IFRAME_PATH_SUFFIX = '/iframe.html';

    private _iframe: HTMLIFrameElement | null;
    private _client: PostMessageRpcClient | null;

    constructor() {
        super(BehaviorType.IFRAME);
        this._iframe = null;
        this._client = null;
    }

    public async request<R extends RequestType>(
        endpoint: string,
        command: R,
        args: Iterable<PromiseLike<any> | any>,
    ): Promise<ResultByRequestType<R>> {
        if (this._iframe && this._iframe.src !== `${endpoint}${IFrameRequestBehavior.IFRAME_PATH_SUFFIX}`) {
            throw new Error('Hub iframe is already opened with another endpoint');
        }

        const origin = RequestBehavior.getAllowedOrigin(endpoint);

        if (!this._iframe) {
            this._iframe = await this.createIFrame(endpoint);
        }
        if (!this._iframe.contentWindow) {
            throw new Error(`IFrame contentWindow is ${typeof this._iframe.contentWindow}`);
        }

        if (!this._client) {
            this._client = new PostMessageRpcClient(this._iframe.contentWindow, origin);
            await this._client.init();
        }

        return await this._client.call(command, ...(await Promise.all(args)));
    }

    public async createIFrame(endpoint: string): Promise<HTMLIFrameElement> {
        return new Promise((resolve, reject) => {
            const $iframe = document.createElement('iframe');
            $iframe.name = 'NimiqAccountsIFrame';
            $iframe.style.display = 'none';
            document.body.appendChild($iframe);
            $iframe.src = `${endpoint}${IFrameRequestBehavior.IFRAME_PATH_SUFFIX}`;
            $iframe.onload = () => resolve($iframe);
            $iframe.onerror = reject;
        }) as Promise<HTMLIFrameElement>;
    }
}
