import { AccountInfo, AccountInfoEntry } from './AccountInfo';
import {
    ContractInfo,
    ContractInfoEntry,
    ContractInfoHelper,
} from './ContractInfo';
import { Account } from '../../client/PublicRequestTypes';
import LabelingMachine from './LabelingMachine';

export enum WalletType {
    LEGACY = 1,
    BIP39 = 2,
    LEDGER = 3,
}

export class WalletInfo {
    public static fromObject(o: WalletInfoEntry): WalletInfo {
        const accounts = new Map<string, AccountInfo>();
        o.accounts.forEach((accountInfoEntry, userFriendlyAddress) => {
            accounts.set(userFriendlyAddress, AccountInfo.fromObject(accountInfoEntry));
        });
        const contracts = o.contracts.map((contract) => ContractInfoHelper.fromObject(contract));
        return new WalletInfo(o.id, o.keyId, o.label, accounts, contracts, o.type,
            o.keyMissing, o.fileExported, o.wordsExported);
    }

    public static objectToAccountType(o: WalletInfoEntry): Account {
        return {
            accountId: o.id,
            label: o.label,
            type: o.type,
            fileExported: o.fileExported,
            wordsExported: o.wordsExported,
            addresses: Array.from(o.accounts.values()).map((address) => AccountInfo.objectToAddressType(address)),
            contracts: o.contracts.map((contract) => ContractInfoHelper.objectToContractType(contract)),
        };
    }

    public constructor(
        public id: string,
        public keyId: string,
        public label: string,
        public accounts: Map</*address*/ string, AccountInfo>,
        public contracts: ContractInfo[],
        public type: WalletType,
        public keyMissing: boolean = false,
        public fileExported: boolean = false,
        public wordsExported: boolean = false,
    ) {}

    public get defaultLabel(): string {
        return LabelingMachine.labelAccount(this.accounts.keys().next().value);
    }

    public get labelForKeyguard(): string | undefined {
        return this.type !== WalletType.LEGACY ? this.label : undefined;
    }

    public findContractByAddress(address: Nimiq.Address): ContractInfo | undefined {
        return this.contracts.find((contract) => contract.address.equals(address));
    }

    public findContractsByOwner(address: Nimiq.Address): ContractInfo[] {
        return this.contracts.filter((contract) => {
            switch (contract.type) {
                case Nimiq.Account.Type.VESTING: return contract.owner.equals(address);
                case Nimiq.Account.Type.HTLC:
                    return contract.sender.equals(address)
                        || contract.recipient.equals(address);
                default: return false;
            }
        });
    }

    public findSignerForAddress(address: Nimiq.Address): AccountInfo | null {
        const addressInfo: AccountInfo | undefined = this.accounts.get(address.toUserFriendlyAddress());
        if (addressInfo) return addressInfo; // regular address
        // address belongs to a contract
        const contract = this.findContractByAddress(address);
        if (!contract) return null;
        if (contract.type !== Nimiq.Account.Type.VESTING) {
            throw new Error('Currently only Vesting contracts are supported');
        }
        return this.accounts.get(contract.owner.toUserFriendlyAddress()) || null;
    }

    public setContract(updatedContract: ContractInfo) {
        const index = this.contracts.findIndex((contract) => contract.address.equals(updatedContract.address));
        if (index < 0) {
            // Is new contract
            this.contracts.push(updatedContract);
            return;
        }

        this.contracts.splice(index, 1, updatedContract);
    }

    public toObject(): WalletInfoEntry {
        const accountEntries = new Map<string, AccountInfoEntry>();
        this.accounts.forEach((accountInfo, userFriendlyAddress) => {
            accountEntries.set(userFriendlyAddress, accountInfo.toObject());
        });
        const contractEntries = this.contracts.map((contract) => contract.toObject());
        return {
            id: this.id,
            keyId: this.keyId,
            label: this.label,
            accounts: accountEntries,
            contracts: contractEntries,
            type: this.type,
            keyMissing: this.keyMissing,
            fileExported: this.fileExported,
            wordsExported: this.wordsExported,
        };
    }

    public toAccountType(): Account {
        return {
            accountId: this.id,
            label: this.label,
            type: this.type,
            fileExported: this.fileExported,
            wordsExported: this.wordsExported,
            addresses: Array.from(this.accounts.values()).map((address) => address.toAddressType()),
            contracts: this.contracts.map((contract) => contract.toContractType()),
        };
    }
}

/*
 * Database Types
 */
export interface WalletInfoEntry {
    id: string;
    keyId: string;
    label: string;
    accounts: Map</*address*/ string, AccountInfoEntry>;
    contracts: ContractInfoEntry[];
    type: WalletType;
    keyMissing: boolean;
    fileExported: boolean;
    wordsExported: boolean;
}
