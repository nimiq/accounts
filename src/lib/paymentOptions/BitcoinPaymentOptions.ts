import { BitcoinSpecifics, BitcoinDirectPaymentOptions } from '../../../client/PublicPaymentOptions';
import { Currency, PaymentType } from '../../../client/PublicRequestTypes';
import { ParsedPaymentOptions } from './ParsedPaymentOptions';
import { toNonScientificNumberString } from '@nimiq/utils';

export type ParsedBitcoinSpecifics = Pick<BitcoinSpecifics, 'recipient'> & {
    fee?: number;
    feePerByte?: number;
};

export class ParsedBitcoinDirectPaymentOptions extends ParsedPaymentOptions<Currency.BTC, PaymentType.DIRECT> {
    public amount: number;

    public constructor(options: BitcoinDirectPaymentOptions) {
        super(options);
        this.amount = parseInt(toNonScientificNumberString(options.amount), 10);

        let feePerByte: number | undefined;
        if (options.protocolSpecific.feePerByte !== undefined) {
            try {
                feePerByte = parseFloat(toNonScientificNumberString(options.protocolSpecific.feePerByte));
            } catch (e) {
                throw new Error('If provided, feePerByte must be a valid number');
            }
        }

        let fee: number | undefined;
        if (options.protocolSpecific.fee !== undefined) {
            if (!this.isNonNegativeInteger(options.protocolSpecific.fee)) {
                throw new Error('If provided, fee must be a non-negative integer');
            }
            fee = parseInt(toNonScientificNumberString(options.protocolSpecific.fee), 10);
        }

        if (feePerByte === undefined && fee !== undefined) {
            throw new Error('If fee is provided, feePerByte must be provided too. The reasoning behind this is that ' +
                'the actual transaction speed depends on feePerByte rather than on fee. Therefore the feePerByte' +
                'that the fee was calculated from should be provided.');
        } else if (feePerByte !== undefined && fee === undefined) {
            // estimate the fee from feePerByte
            fee = feePerByte * 250; // 250 is the estimated size for a standard tx with two inputs and one output
        }

        if (options.protocolSpecific.recipient && typeof options.protocolSpecific.recipient !== 'string') {
            // TODO add btc address validation here?
            throw new Error('If a recipient is provided it must be a string');
        }

        this.protocolSpecific = {
            fee,
            feePerByte,
            recipient: options.protocolSpecific.recipient,
        };
    }

    public get currency(): Currency.BTC {
        return Currency.BTC;
    }

    public get type(): PaymentType.DIRECT {
        return PaymentType.DIRECT;
    }

    public get decimals(): number {
        return 8;
    }

    public get total(): number {
        return (this.amount + this.fee);
    }

    public get fee(): number {
        return this.protocolSpecific.fee || 0;
    }

    public get feeString(): string {
        if (this.protocolSpecific.feePerByte) {
            const fee = Math.ceil((this.protocolSpecific.feePerByte) * 100) / 100;
            return fee !== 0 ? `Apply a network fee of at least ${fee} sat/byte.` : '';
        }
        return '';
    }

    public fiatFee(fiatAmount: number): number {
        if (!this.amount || !fiatAmount) {
            throw new Error('amount and fiatAmount must be provided');
        }
        if (!this.fee) {
            return 0;
        }
        return this.fee * fiatAmount / this.amount;
    }

    public raw(): BitcoinDirectPaymentOptions {
        return {
            currency: this.currency,
            type: this.type,
            expires: this.expires,
            amount: this.amount.toString(),
            vendorMarkup: this.vendorMarkup,
            protocolSpecific: this.protocolSpecific,
        };
    }
}
