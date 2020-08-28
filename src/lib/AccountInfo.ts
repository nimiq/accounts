import { Address } from '../../client/PublicRequestTypes';
import AddressUtils from './AddressUtils';
import LabelingMachine from './LabelingMachine';

export class AccountInfo {
    public static fromObject(o: AccountInfoEntry): AccountInfo {
        return new AccountInfo(
            o.path,
            o.label,
            new Nimiq.Address(o.address),
            o.balance,
        );
    }

    public static objectToAddressType(o: AccountInfoEntry): Address {
        return {
            address: AddressUtils.toUserFriendlyAddress(o.address),
            label: o.label,
        };
    }

    public walletId?: string;
    public isBackedUp?: boolean; /* Used for pre-migration  */

    public constructor(
        public path: string,
        public label: string,
        public address: Nimiq.Address,
        public balance?: number,
    ) {}

    public get userFriendlyAddress(): string {
        return this.address.toUserFriendlyAddress();
    }

    public get defaultLabel(): string {
        return LabelingMachine.labelAddress(this.userFriendlyAddress);
    }

    public toObject(): AccountInfoEntry {
        return {
            path: this.path,
            label: this.label,
            address: new Uint8Array(this.address.serialize()),
            balance: this.balance,
        };
    }

    public toAddressType(): Address {
        return {
            address: this.userFriendlyAddress,
            label: this.label,
        };
    }
}

/*
 * Database Types
 */
export interface AccountInfoEntry {
    path: string;
    label: string;
    address: Uint8Array;
    balance?: number;
}
