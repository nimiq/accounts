import bigInt from 'big-integer';
import { Currency, PaymentMethod, PaymentOptions } from '../PublicRequestTypes';
import { ParsedPaymentOptions } from '../RequestTypes';
import { toNonScientificNumberString } from '@nimiq/utils';

export interface EtherProtocolSpecific {
    gasLimit?: number | string;
    gasPrice?: string;
    recipient?: string;
}

export type ParsedEtherProtocolSpecific = Omit<EtherProtocolSpecific, 'gasLimit' | 'gasPrice'> & {
    gasLimit?: number;
    gasPrice?: bigInt.BigInteger;
};

export type EtherDirectPaymentOptions = PaymentOptions<Currency.ETH, PaymentMethod.DIRECT>;

export class ParsedEtherDirectPaymentOptions extends ParsedPaymentOptions<Currency.ETH, PaymentMethod.DIRECT> {
    public amount: bigInt.BigInteger;

    public constructor(options: EtherDirectPaymentOptions) {
        super(options);
        this.amount = bigInt(options.amount); // note that bigInt resolves scientific notation like 2e3 automatically

        let gasLimit: number | undefined;
        if (options.protocolSpecific.gasLimit !== undefined) {
            if (!this.isNonNegativeInteger(options.protocolSpecific.gasLimit)) {
                throw new Error('If provided, gasLimit must be a non-negative integer');
            }
            gasLimit = Number.parseInt(toNonScientificNumberString(options.protocolSpecific.gasLimit), 10);
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

    public get type(): PaymentMethod.DIRECT {
        return PaymentMethod.DIRECT;
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

    public fiatFee(fiatAmount: number): number {
        if (!this.amount || !fiatAmount) {
            throw new Error('amount and fiatAmount must be provided');
        }

        if (this.fee.isZero()) {
            return 0;
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
