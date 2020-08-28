import { Currency, PaymentType, PaymentOptionsForCurrencyAndType, PaymentState } from '../../client/PublicRequestTypes';
import { isMilliseconds } from './Helpers';

export interface GetStateResponse {
    time: number;
    payment_accepted: boolean;
    payment_state: PaymentState;
}

export default class CheckoutServerApi {
    public static async fetchTime(endPoint: string, csrfToken: string): Promise<number> {
        const value = await CheckoutServerApi.getState(endPoint, csrfToken);
        return value.time;
    }

    public static async fetchPaymentOption<C extends Currency, T extends PaymentType>(
        endPoint: string,
        currency: C,
        type: T,
        csrfToken: string,
    ): Promise<PaymentOptionsForCurrencyAndType<C, T>> {
        let fetchedData: any;

        if (history.state[currency]) {
            // Retrieve the data from state if already fetched
            fetchedData = history.state[currency];
        } else {
            const requestData = new URLSearchParams();
            requestData.append('currency', currency);
            requestData.append('command', 'set_currency');
            fetchedData = await CheckoutServerApi._fetchData(endPoint, requestData, csrfToken);

            // Store in state in case this fetch gets repeated (also after reload and history.back)
            history.replaceState({
                ...history.state,
                [currency]: fetchedData,
            }, '');
        }

        if (currency !== fetchedData.currency || type !== fetchedData.type) {
            throw new Error('Unexpected: fetch did not return the correct currency/type combination');
        }

        return fetchedData;
    }

    public static async getState(
        endPoint: string,
        csrfToken: string,
    ): Promise<GetStateResponse> {
        if (CheckoutServerApi._getStatePromise) return CheckoutServerApi._getStatePromise;

        const data = new URLSearchParams();
        data.append('command', 'get_state');

        CheckoutServerApi._getStatePromise = CheckoutServerApi._fetchData(endPoint, data, csrfToken).then(
            (value) => {
                // Clear cached request after 3 seconds
                window.setTimeout(() => CheckoutServerApi._getStatePromise = null, 3000);

                value.time = isMilliseconds(value.time) ? value.time : value.time * 1000;
                return value;
            },
            (e) => {
                CheckoutServerApi._getStatePromise = null;
                return Promise.reject(e);
            },
        );

        return CheckoutServerApi._getStatePromise;
    }

    private static _getStatePromise: Promise<GetStateResponse> | null = null;

    private static async _fetchData(endPoint: string, requestData: URLSearchParams, csrfToken: string): Promise<any> {
        requestData.append('csrf', csrfToken);
        const headers = new Headers();
        const init: RequestInit = {
            method: 'POST',
            headers,
            body: requestData,
            mode: 'cors',
            cache: 'default',
            credentials: 'include',
        };

        let fetchResponse;
        try {
            // First we try to send the request with 'credentials: include', which includes cookies
            // and auth headers in cross-origin requests, but in turn requires the server to set
            // the 'Access-Control-Allow-Credentials: true' header.
            const fetchRequest = new Request(endPoint, init);
            fetchResponse = await fetch(fetchRequest);
        } catch (err) {
            // If the previous request with included credentials fails, we try again with the
            // credentials omitted (default for cross-origin requests). Some implementations might
            // not have the header set, because they don't require cookies or auth headers for
            // authenticating the webhook.
            delete init.credentials;
            const fetchRequest = new Request(endPoint, init);
            fetchResponse = await fetch(fetchRequest);
        }

        if (!fetchResponse.ok) {
            if (process.env.NODE_ENV === 'development'
                || document.referrer === 'https://hub.nimiq-testnet.com/demos.html') {
                // Use fake data in local development or deployed testnet hub demo page if we have no checkout server
                console.warn('Using dummy data instead of actual checkout server.');
                return this._generateDummyData(requestData);
            }
            let errorMsg = '';
            try {
                errorMsg = (await fetchResponse.json()).error;
            } catch (error) {
                // Ignore
            }
            throw new Error(`Callback Error: ${fetchResponse.status} - ${errorMsg || fetchResponse.statusText}`);
        }

        const fetchedData = await fetchResponse.json();
        if (fetchedData.error) {
            throw new Error(fetchedData.error);
        }

        return fetchedData;
    }

    private static _generateDummyData(requestData: URLSearchParams) {
        if (requestData.get('command') === 'get_state') {
            return {
                time: Date.now(),

                // Change these to true and PAID for simulating a successfull payment
                payment_accepted: false,
                payment_state: PaymentState.NOT_FOUND,
            };
        } else if (requestData.get('command') === 'set_currency') {
            const now = Date.now();
            const options = [
                {
                    currency: Currency.BTC,
                    type: PaymentType.DIRECT,
                    amount: '.0002e8',
                    vendorMarkup: -.05,
                    expires: now + 15 * 60000, // 15 minutes
                    protocolSpecific: {
                        feePerByte: 2, // 2 sat per byte
                        recipient: '17w6ar5SqXFGr786WjGHB8xyu48eujHaBe', // Unicef
                    },
                },
                {
                    currency: Currency.NIM,
                    type: PaymentType.DIRECT,
                    amount: '1e5',
                    expires: now + 15 * 60000, // 15 minutes
                    protocolSpecific: {
                        fee: 50000,
                        recipient: 'NQ09 VF5Y 1PKV MRM4 5LE1 55KV P6R2 GXYJ XYQF', // Nimiq foundation
                    },
                },
                {
                    currency: Currency.ETH,
                    type: PaymentType.DIRECT,
                    amount: '.0023e18',
                    vendorMarkup: .03,
                    expires: now + 15 * 60000, // 15 minutes
                    protocolSpecific: {
                        gasLimit: 21000,
                        gasPrice: '3e9',
                        recipient: '0xa4725d6477644286b354288b51122a808389be83', // the water project
                    },
                },
            ];
            const requestedOption = options.find((option) => option.currency === requestData.get('currency'));
            return {
                time: now,
                ...requestedOption,
            };
        }
    }
}
