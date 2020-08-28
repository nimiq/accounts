import bigInt from 'big-integer';
import { EtherSpecifics, EtherDirectPaymentOptions } from '../../../client/PublicPaymentOptions';
import { Currency, PaymentType } from '../../../client/PublicRequestTypes';
import { ParsedPaymentOptions } from './ParsedPaymentOptions';
import { toNonScientificNumberString, FormattableNumber } from '@nimiq/utils';

export type ParsedEtherSpecifics = Pick<EtherSpecifics, 'recipient'> & {
    gasLimit?: number;
    gasPrice?: bigInt.BigInteger;
};

export class ParsedEtherDirectPaymentOptions extends ParsedPaymentOptions<Currency.ETH, PaymentType.DIRECT> {
    public amount: bigInt.BigInteger;

    public constructor(options: EtherDirectPaymentOptions) {
        super(options);
        this.amount = bigInt(options.amount); // note that bigInt resolves scientific notation like 2e3 automatically

        let gasLimit: number | undefined;
        if (options.protocolSpecific.gasLimit !== undefined) {
            if (!this.isNonNegativeInteger(options.protocolSpecific.gasLimit)) {
                throw new Error('If provided, gasLimit must be a non-negative integer');
            }
            gasLimit = parseInt(toNonScientificNumberString(options.protocolSpecific.gasLimit), 10);
        }

        let gasPrice: bigInt.BigInteger | undefined;
        if (options.protocolSpecific.gasPrice !== undefined) {
            if (!this.isNonNegativeInteger(options.protocolSpecific.gasPrice)) {
                throw new Error('If provided, gasPrice must be a non-negative integer');
            }
            gasPrice = bigInt(options.protocolSpecific.gasPrice);
        }

        if (options.protocolSpecific.recipient && typeof options.protocolSpecific.recipient !== 'string') {
            // TODO add eth address validation here?
            throw new Error('If a recipient is provided it must be of type string');
        }

        this.protocolSpecific = {
            gasLimit,
            gasPrice,
            recipient: options.protocolSpecific.recipient,
        };
    }

    public get currency(): Currency.ETH {
        return Currency.ETH;
    }

    public get type(): PaymentType.DIRECT {
        return PaymentType.DIRECT;
    }

    public get decimals(): number {
        return 18;
    }

    public get total(): bigInt.BigInteger {
        return this.amount.add(this.fee);
    }

    public get fee(): bigInt.BigInteger {
        return this.protocolSpecific.gasPrice!.times(this.protocolSpecific.gasLimit!) || bigInt(0);
    }

    public get feeString(): string {
        if (this.protocolSpecific.gasPrice) {
            const fee = new FormattableNumber(this.protocolSpecific.gasPrice)
                .moveDecimalSeparator(-9).toString({ maxDecimals: 2 });
            return fee !== '0' ? `Apply a gas price of at least ${fee} gwei.` : '';
        }
        return '';
    }

    public fiatFee(fiatAmount: number): number {
        if (this.fee.isZero()) {
            return 0;
        }

        if (!this.amount || !fiatAmount) {
            throw new Error('amount and fiatAmount must be provided');
        }

        const decimalMatch = toNonScientificNumberString(fiatAmount).match(/(?:\D)(\d+)$/);
        const decimalCount = decimalMatch ? decimalMatch[1].length : 0;
        const conversionFactor = 10 ** decimalCount; // convert amount to smallest unit for bigint calculations
        return this.fee
            .times(bigInt(Math.round(fiatAmount * conversionFactor)))
            .divide(this.amount) // integer division loss of precision here.
            .valueOf() / conversionFactor;
    }

    public raw(): EtherDirectPaymentOptions {
        return {
            currency: this.currency,
            type: this.type,
            expires: this.expires,
            amount: this.amount.toString(),
            vendorMarkup: this.vendorMarkup,
            protocolSpecific: {
                gasLimit: this.protocolSpecific.gasLimit,
                gasPrice: this.protocolSpecific.gasPrice
                    ? this.protocolSpecific.gasPrice.toString()
                    : undefined,
                recipient: this.protocolSpecific.recipient,
            },
        };
    }
}
