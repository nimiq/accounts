export enum ContractType {
    VESTING,
    HTLC,
}

export interface ContractInfo {
    address: Nimiq.Address;
    label: string;
    ownerPath: string;
    type: ContractType;
}
