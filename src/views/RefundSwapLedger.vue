<template>
    <div v-if="state !== State.NONE" class="container">
        <SmallPage>
            <LedgerUi
                @information-shown="ledgerInstructionsShown = true"
                @no-information-shown="ledgerInstructionsShown = false"
            />
            <transition name="transition-fade">
                <StatusScreen v-if="state === State.SYNCING_FAILED || !ledgerInstructionsShown"
                    :state="statusScreenState"
                    :title="statusScreenTitle"
                    :status="statusScreenStatus"
                    :message="statusScreenMessage"
                    :mainAction="statusScreenAction"
                    @main-action="_statusScreenActionHandler"
                />
            </transition>
        </SmallPage>

        <GlobalClose :hidden="!isGlobalCloseShown" />
    </div>
</template>

<script lang="ts">
import { Component } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { SmallPage } from '@nimiq/vue-components';
import RefundSwap from './RefundSwap.vue';
import StatusScreen from '../components/StatusScreen.vue';
import GlobalClose from '../components/GlobalClose.vue';
import LedgerUi from '../components/LedgerUi.vue';
import Network from '../components/Network.vue';
import LedgerApi, { getBip32Path, parseBip32Path, Coin } from '@nimiq/ledger-api';
import { SwapAsset } from '@nimiq/fastspot-api';
import Config from 'config';
import {
    RequestType,
    RpcResult,
    SignTransactionRequest,
    SignBtcTransactionRequest,
    SignedBtcTransaction,
} from '../lib/PublicRequestTypes';
import {
    ParsedRefundSwapRequest,
    ParsedSignTransactionRequest,
    ParsedSignBtcTransactionRequest,
} from '../lib/RequestTypes';
import { RequestParser } from '../lib/RequestParser';
import staticStore, { Static } from '../lib/StaticStore';
import { WalletInfo } from '../lib/WalletInfo';
import { BTC_NETWORK_TEST } from '../lib/bitcoin/BitcoinConstants';
import { loadBitcoinJS } from '../lib/bitcoin/BitcoinJSLoader';
import { decodeBtcScript } from '../lib/HtlcUtils';

// Import only types to avoid bundling of KeyguardClient in Ledger request if not required.
// (But note that currently, the KeyguardClient is still always bundled in the RpcApi).
type KeyguardSignNimTransactionRequest = import('@nimiq/keyguard-client').SignTransactionRequest;
type KeyguardSignBtcTransactionRequest = import('@nimiq/keyguard-client').SignBtcTransactionRequest;

const ProxyExtraData = {
    // HTLC Proxy Funding, abbreviated as 'HPFD', mapped to values outside of basic ascii range
    FUND:  new Uint8Array([0, ...('HPFD'.split('').map((c) => c.charCodeAt(0) + 63))]),
    // HTLC Proxy Redeeming, abbreviated as 'HPRD', mapped to values outside of basic ascii range
    REDEEM: new Uint8Array([0, ...('HPRD'.split('').map((c) => c.charCodeAt(0) + 63))]),
};

@Component({components: {StatusScreen, SmallPage, GlobalClose, LedgerUi}})
export default class RefundSwapLedger extends RefundSwap {
    @Static protected request!: ParsedRefundSwapRequest | ParsedSignTransactionRequest
        | ParsedSignBtcTransactionRequest;
    @Static protected sideResult?: RpcResult | Error;
    @Getter private findWalletByAddress!: (address: string, includeContracts: boolean) => WalletInfo | undefined;
    private ledgerInstructionsShown = false;

    protected async created() {
        if (this.request.kind === RequestType.REFUND_SWAP) {
            // first entry point into the flow is handled by the parent class which then calls _signTransaction
            return;
        }

        // After returning from transaction signing side request

        if (!this.sideResult) {
            this.$rpc.reject(new Error('Unexpected: transaction signing did not return a side result'));
            return;
        } else if (this.sideResult instanceof Error) {
            this.$rpc.reject(this.sideResult);
            return;
        }

        if (this.request.kind === RequestType.SIGN_TRANSACTION) {
            // Nimiq transaction

            this.state = this.State.SYNCING;

            const request = this.request as ParsedSignTransactionRequest;
            const { sender: senderInfo, recipient, value, fee, data, validityStartHeight } = request;
            const sender = senderInfo instanceof Nimiq.Address ? senderInfo : senderInfo.address;
            // existence guaranteed as already checked previously in RefundSwap
            const ledgerAccount = this.findWalletByAddress(recipient.toUserFriendlyAddress(), true)!;
            const { addressIndex: ledgerAddressIndex } = parseBip32Path(
                ledgerAccount.findSignerForAddress(recipient)!.path,
            );

            const network = new Network();
            network.getNetworkClient(); // init network

            // For Ledgers, the HTLC is currently signed by a proxy address, see SetupSwapLedger
            const proxyKeyPath = getBip32Path({
                coin: Coin.NIMIQ,
                accountIndex: 2 ** 31 - 1, // max index allowed by bip32
                addressIndex: 2 ** 31 - 1 - ledgerAddressIndex, // use a distinct proxy per address for improved privacy
            });
            const pubKeyAsEntropy = await LedgerApi.Nimiq.getPublicKey(proxyKeyPath, ledgerAccount.keyId);
            const proxyKey = Nimiq.KeyPair.derive(new Nimiq.PrivateKey(pubKeyAsEntropy.serialize()));
            const proxyAddress = proxyKey.publicKey.toAddress();

            let transaction: Nimiq.Transaction;

            if (sender.equals(proxyAddress)) {
                // Redeem funds from proxy.

                transaction = await network.createTx({
                    signerPubKey: proxyKey.publicKey,
                    sender,
                    recipient,
                    value,
                    fee,
                    validityStartHeight,
                    data: ProxyExtraData.REDEEM,
                });

                transaction.proof = Nimiq.SignatureProof.singleSig(
                    proxyKey.publicKey,
                    Nimiq.Signature.create(
                        proxyKey.privateKey,
                        proxyKey.publicKey,
                        transaction.serializeContent(),
                    ),
                ).serialize();
            } else {
                // Redeem funds from htlc.
                // Htlc redeem tx currently has to be signed by the proxy but doesn't have to forward funds through it.

                transaction = await network.createTx({
                    signerPubKey: proxyKey.publicKey,
                    sender,
                    senderType: Nimiq.Account.Type.HTLC,
                    recipient,
                    value,
                    fee,
                    validityStartHeight,
                    data,
                });

                // create htlc timeout resolve signature proof
                const proof = new Nimiq.SerialBuffer(1 + Nimiq.SignatureProof.SINGLE_SIG_SIZE);
                // FIXME: Use constant when HTLC is part of CoreJS web-offline build
                proof.writeUint8(3 /* Nimiq.HashedTimeLockedContract.ProofType.TIMEOUT_RESOLVE */);
                Nimiq.SignatureProof.singleSig(
                    proxyKey.publicKey,
                    Nimiq.Signature.create(
                        proxyKey.privateKey,
                        proxyKey.publicKey,
                        transaction.serializeContent(),
                    ),
                ).serialize(proof);
                transaction.proof = proof;
            }

            this.$rpc.resolve(await network.makeSignTransactionResult(transaction));
        } else if (this.request.kind === RequestType.SIGN_BTC_TRANSACTION) {
            // Bitcoin transaction

            if (!('serializedTx' in this.sideResult && !!this.sideResult.serializedTx)) {
                this.$rpc.reject(new Error('Unexpected: Bitcoin transaction not signed'));
                return;
            }

            await loadBitcoinJS(); // normally it's already loaded at this point, if user didn't reload the page.
            const signedBitcoinTransaction = BitcoinJS.Transaction.fromHex(this.sideResult.serializedTx);

            // set htlc witness for redeeming the BTC htlc

            const htlcInput = signedBitcoinTransaction.ins[0];
            // get signature and signer pub key from default witness generated by ledgerjs (see @ledgerhq/hw-app-btc
            // createTransaction.js creation of the witness towards the end of createTransaction)
            const [inputSignature, signerPubKey] = htlcInput.witness;

            const witnessBytes = BitcoinJS.script.fromASM([
                inputSignature.toString('hex'),
                signerPubKey.toString('hex'),
                'OP_0', // OP_0 (false) activates the refund branch in the HTLC script
                (this.request as ParsedSignBtcTransactionRequest).inputs[0].witnessScript,
            ].join(' '));

            const witnessStack = BitcoinJS.script.toStack(witnessBytes);
            signedBitcoinTransaction.setWitness(0, witnessStack);

            const result: SignedBtcTransaction = {
                serializedTx: signedBitcoinTransaction.toHex(),
                hash: signedBitcoinTransaction.getId(),
            };

            this.$rpc.resolve(result);
        } else {
            this.$rpc.reject(new Error(`Unexpected request type ${this.request.kind}`));
        }
    }

    protected async _signTransaction(request: KeyguardSignNimTransactionRequest | KeyguardSignBtcTransactionRequest) {
        // forward to SignTransactionLedger or SignBtcTransactionLedger
        if ('sender' in request) {
            // Nimiq request
            const { keyId, sender, recipient, recipientLabel, value, fee, validityStartHeight, data } = request;
            const senderAddress = new Nimiq.Address(sender);

            // For Ledgers, the HTLC is currently created by a proxy address, see SetupSwapLedger, which also needs to
            // sign the refund transaction. Let the user just sign an unused dummy transaction for ux consistency.
            const signTransactionRequest: SignTransactionRequest = {
                appName: request.appName,
                sender: senderAddress.toUserFriendlyAddress(),
                recipient: new Nimiq.Address(recipient).toUserFriendlyAddress(),
                recipientLabel,
                value,
                fee,
                extraData: data,
                validityStartHeight,
            };
            const parsedSignTransactionRequest = RequestParser.parse(
                signTransactionRequest,
                staticStore.rpcState!,
                RequestType.SIGN_TRANSACTION,
            ) as ParsedSignTransactionRequest;

            // Sign the dummy transaction from an unused keyPath which does not actually hold funds.
            // We use the highest bip32 nimiq path here; but note that the signing address is different from the proxy
            // account even if the paths coincide as the proxy account is derived from the public key. Note that in the
            // case of a coinciding path, this signed tx should not be exposed to not expose the public key.
            parsedSignTransactionRequest.sender = {
                address: senderAddress,
                label: 'Swap HTLC',
                // type: Nimiq.Account.Type.HTLC, // Ledgers currently can not sign actual htlc transactions
                signerKeyId: keyId,
                signerKeyPath: getBip32Path({ coin: Coin.NIMIQ, accountIndex: 2 ** 31 - 1, addressIndex: 2 ** 31 - 1 }),
            };

            // redirect to SignTransactionLedger
            staticStore.request = parsedSignTransactionRequest;
            staticStore.originalRouteName = `${RequestType.REFUND_SWAP}-ledger`;
            this.$router.replace({ name: `${RequestType.SIGN_TRANSACTION}-ledger` });
        } else {
            // Bitcoin request
            const { walletId: accountId } = this.request as ParsedRefundSwapRequest;
            const { appName, inputs: [htlcInput], recipientOutput: output } = request;

            this.state = this.State.SYNCING;
            await loadBitcoinJS();
            // note that buffer is marked as external module in vue.config.js and internally, the buffer bundled with
            // BitcoinJS is used, therefore we retrieve it after having BitcoinJS loaded.
            // TODO change this when we don't prebuild BitcoinJS anymore
            const Buffer = await import('buffer').then((module) => module.Buffer);
            const bitcoinNetwork = Config.bitcoinNetwork === BTC_NETWORK_TEST
                ? BitcoinJS.networks.testnet
                : BitcoinJS.networks.bitcoin;
            const htlcAddress = BitcoinJS.address.fromOutputScript(
                Buffer.from(Nimiq.BufferUtils.fromAny(htlcInput.outputScript)),
                bitcoinNetwork,
            );

            // The timeoutTimestamp we parse from the BTC HTLC script is forwarded one hour
            // (because the timeout in the script itself is set back one hour, because the BTC
            // network only accepts locktimes that are at least one hour old). So we need to
            // remove this added hour before using it as the transaction's locktime.
            const { timeoutTimestamp } = await decodeBtcScript(htlcInput.witnessScript!);
            const locktime = timeoutTimestamp - (60 * 60) + 1;
            const sequence = 0xfffffffe; // Signal to use locktime, but do not opt into replace-by-fee

            const signBtcTransactionRequest: SignBtcTransactionRequest = {
                appName,
                accountId,
                inputs: [{
                    ...htlcInput, // also includes the witnessScript
                    sequence,
                    address: htlcAddress,
                }],
                output,
                locktime,
            };
            const parsedSignBtcTransactionRequest = RequestParser.parse(
                signBtcTransactionRequest,
                staticStore.rpcState!,
                RequestType.SIGN_BTC_TRANSACTION,
            ) as ParsedSignBtcTransactionRequest;
            parsedSignBtcTransactionRequest.inputs[0].keyPath = htlcInput.keyPath;

            // Redirect to SignBtcTransactionLedger
            staticStore.request = parsedSignBtcTransactionRequest;
            staticStore.originalRouteName = `${RequestType.REFUND_SWAP}-ledger`;
            this.$router.replace({ name: `${RequestType.SIGN_BTC_TRANSACTION}-ledger` });
        }
    }

    protected get statusScreenTitle() {
        if (this.state !== this.State.SYNCING) return super.statusScreenTitle;
        return this.$t('Syncing') as string;
    }

    protected get statusScreenStatus() {
        if (this.state !== this.State.SYNCING) return super.statusScreenStatus;
        return this.$t('Syncing with {currency} network...', { currency: this._currencyName }) as string;
    }

    protected get statusScreenMessage() {
        if (this.state !== this.State.SYNCING_FAILED) return super.statusScreenMessage;
        return this.$t('Syncing with {currency} network failed: {error}', {
            currency: this._currencyName,
            error: this.error,
        }) as string;
    }

    protected get isGlobalCloseShown() {
        return this.request.kind === RequestType.REFUND_SWAP // before having signed
            || this.state === this.State.SYNCING_FAILED;
    }

    private get _currencyName() {
        switch (this.request.kind) {
            case RequestType.SIGN_TRANSACTION: return 'Nimiq';
            case RequestType.SIGN_BTC_TRANSACTION: return 'Bitcoin';
            case RequestType.REFUND_SWAP:
                const { refund: { type: currency } } = this.request as ParsedRefundSwapRequest;
                switch (currency) {
                    case SwapAsset.NIM: return 'Nimiq';
                    case SwapAsset.BTC: return 'Bitcoin';
                    default: // fall through
                }
            default:
                throw new Error('Failed to determine request currency');
        }
    }
}
</script>

<style scoped>
    .small-page {
        position: relative;
    }

    .small-page > * {
        position: absolute;
        top: 0;
    }
</style>
