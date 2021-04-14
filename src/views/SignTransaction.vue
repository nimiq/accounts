<template></template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { ParsedSignTransactionRequest } from '../lib/RequestTypes';
import KeyguardClient from '@nimiq/keyguard-client';
import staticStore, { Static } from '../lib/StaticStore';
import { WalletInfo } from '../lib/WalletInfo';
import { Getter } from 'vuex-class';

@Component
export default class SignTransaction extends Vue {
    @Static private request!: ParsedSignTransactionRequest;
    @Getter private findWalletByAddress!: (address: string, includeContracts: boolean) => WalletInfo | undefined;

    public async created() {
        // Forward user through Hub to Keyguard

        let senderAddress: Nimiq.Address;
        let senderLabel: string | undefined;
        let senderType: Nimiq.Account.Type | undefined;
        let keyId: string;
        let keyPath: string;
        let keyLabel: string | undefined;

        if (this.request.sender instanceof Nimiq.Address) {
            // existence checked in RpcApi
            const senderAccount = this.findWalletByAddress(this.request.sender.toUserFriendlyAddress(), true)!;
            const senderContract = senderAccount.findContractByAddress(this.request.sender);
            const signer = senderAccount.findSignerForAddress(this.request.sender)!;

            senderAddress = this.request.sender;
            senderLabel = (senderContract || signer).label;
            senderType = senderContract ? senderContract.type : Nimiq.Account.Type.BASIC;
            keyId = senderAccount.keyId;
            keyPath = signer.path;
            keyLabel = senderAccount.labelForKeyguard;
        } else {
            ({
                address: senderAddress,
                label: senderLabel,
                type: senderType,
                signerKeyId: keyId,
                signerKeyPath: keyPath,
                walletLabel: keyLabel,
            } = this.request.sender);
        }

        const request: KeyguardClient.SignTransactionRequest = {
            layout: 'standard',
            appName: this.request.appName,

            keyId,
            keyPath,
            keyLabel,

            sender: senderAddress.serialize(),
            senderLabel,
            senderType: senderType || Nimiq.Account.Type.BASIC,
            recipient: this.request.recipient.serialize(),
            recipientType: this.request.recipientType,
            recipientLabel: this.request.recipientLabel,
            value: this.request.value,
            fee: this.request.fee,
            validityStartHeight: this.request.validityStartHeight,
            data: this.request.data,
            flags: this.request.flags,
        };

        staticStore.keyguardRequest = request;

        const client = this.$rpc.createKeyguardClient(true);
        client.signTransaction(request);
    }
}
</script>
