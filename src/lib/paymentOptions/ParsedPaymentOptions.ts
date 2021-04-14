import type { BigInteger } from 'big-integer'; // imports only the type without bundling
import { FormattableNumber, toNonScientificNumberString } from '@nimiq/utils';
import { isMilliseconds } from '../Helpers';
import {
    Currency,
    PaymentType,
    PaymentOptionsForCurrencyAndType,
} from '../PublicRequestTypes';
import {
    ParsedPaymentOptionsForCurrencyAndType,
    ParsedProtocolSpecificsForCurrency,
} from '../RequestTypes';

export interface ParsedPaymentOptions<C extends Currency, T extends PaymentType> {
    protocolSpecific: ParsedProtocolSpecificsForCurrency<C>;
    amount: number | BigInteger;
    vendorMarkup?: number;
    expires?: number;
    constructor: ParsedPaymentOptionsForCurrencyAndType<C, T>;
    new(options: PaymentOptionsForCurrencyAndType<C, T>, allowUndefinedFees?: boolean):
        ParsedPaymentOptionsForCurrencyAndType<C, T>;
}

export abstract class ParsedPaymentOptions<C extends Currency, T extends PaymentType>
implements ParsedPaymentOptions<C, T> {
    protected constructor(options: PaymentOptionsForCurrencyAndType<C, T>) {
        // @ts-ignore: Accessing abstract properties currency and type
        if (options.currency !== this.currency || options.type !== this.type) {
            throw new Error(`Cannot parse given options as ${this.constructor.name}.`);
        }
        if (!this.isNonNegativeInteger(options.amount)) {
            throw new Error('Amount must be a non-negative integer');
        }
        if (options.vendorMarkup !== undefined
            && (typeof options.vendorMarkup !== 'number'
                || !Number.isFinite(options.vendorMarkup)
                || options.vendorMarkup <= -1)
        ) {
            throw new Error('If provided, vendorMarkup must be a finite number > -1');
        }
        this.vendorMarkup = options.vendorMarkup;
        this.expires = typeof options.expires === 'number'
            ? isMilliseconds(options.expires)
                ? options.expires
                : options.expires * 1000
            : undefined;
    }

    public abstract get currency(): C;
    public abstract get type(): T;
    public abstract get decimals(): number;

    public get baseUnitAmount(): string {
        return new FormattableNumber(this.amount).moveDecimalSeparator(-this.decimals).toString();
    }

    public update<P extends ParsedPaymentOptions<C, T>>(
        this: P,
        options: PaymentOptionsForCurrencyAndType<C, T>,
        ...additionalArgs: any[]
    ) {
        // Parse to check validity. Do not enforce calculation of fees to not update them if they were undefined.
        const parsedOptions = new this.constructor(options as any, /* allowUndefinedFees */ true);
        this.amount = parsedOptions.amount; // amount must exist on all parsed options
        this.vendorMarkup = parsedOptions.vendorMarkup !== undefined ? parsedOptions.vendorMarkup : this.vendorMarkup;
        this.expires = parsedOptions.expires || this.expires;
        for (const key of
            Object.keys(parsedOptions.protocolSpecific) as Array<keyof typeof parsedOptions.protocolSpecific>) {
            if (parsedOptions.protocolSpecific[key] === undefined) continue;
            this.protocolSpecific[key] = parsedOptions.protocolSpecific[key];
        }
    }

    public abstract raw(): PaymentOptionsForCurrencyAndType<C, T>;

    protected isNonNegativeInteger(value: string | number | bigint | BigInteger) {
        try {
            return /^\d+$/.test(toNonScientificNumberString(value));
        } catch (e) {
            return false;
        }
    }
}
