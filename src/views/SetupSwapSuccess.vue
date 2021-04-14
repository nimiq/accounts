<script lang="ts">
import { Component } from 'vue-property-decorator';
import { State, Getter } from 'vuex-class';
import { PlainOutput, TransactionDetails as BtcTransactionDetails } from '@nimiq/electrum-client';
import { SmallPage } from '@nimiq/vue-components';
import BitcoinSyncBaseView from './BitcoinSyncBaseView.vue';
import {
    init as initFastspotApi,
    SwapAsset,
    PreSwap,
    Swap,
    confirmSwap,
    getSwap,
    NimHtlcDetails,
    BtcHtlcDetails,
    Contract,
} from '@nimiq/fastspot-api';
import StatusScreen from '../components/StatusScreen.vue';
import GlobalClose from '../components/GlobalClose.vue';
import Network from '../components/Network.vue';
import { SetupSwapResult, SignedBtcTransaction } from '../lib/PublicRequestTypes';
import { Static } from '../lib/StaticStore';
import { ParsedSetupSwapRequest } from '../lib/RequestTypes';
import Config from 'config';
import { loadNimiq } from '../lib/Helpers';
import { decodeNimHtlcData, decodeBtcScript } from '../lib/HtlcUtils';
import { loadBitcoinJS } from '../lib/bitcoin/BitcoinJSLoader';
import { getElectrumClient } from '../lib/bitcoin/ElectrumClient';
import { WalletInfo } from '../lib/WalletInfo';

// Import only types to avoid bundling of KeyguardClient in Ledger request if not required.
// (But note that currently, the KeyguardClient is still always bundled in the RpcApi).
type KeyguardSimpleResult = import('@nimiq/keyguard-client').SimpleResult;
type KeyguardSignSwapTransactionsRequest = import('@nimiq/keyguard-client').SignSwapTransactionsRequest;
export type SwapHtlcInfo = Pick<KeyguardSignSwapTransactionsRequest, 'fund' | 'redeem'>;

@Component({components: {SmallPage, StatusScreen, GlobalClose}}) // including components used in parent class
export default class SetupSwapSuccess extends BitcoinSyncBaseView {
    protected get State() {
        return {
            ...super.State,
            FETCHING_SWAP_DATA: 'fetching-swap-data',
            FETCHING_SWAP_DATA_FAILED: 'fetching-swap-data-failed',
            SIGNING_TRANSACTIONS: 'signing-transactions',
        };
    }

    @Getter protected findWallet!: (id: string) => WalletInfo | undefined;
    @Static protected request!: ParsedSetupSwapRequest;
    protected nimiqNetwork: Network = new Network();
    protected _isDestroyed: boolean = false;
    @State private keyguardResult?: KeyguardSimpleResult;

    protected async mounted() {
        Promise.all([
            // if nimiq is involved, preload nimiq cryptography used in createTx, makeSignTransactionResult
            this.request.fund.type === SwapAsset.NIM || this.request.redeem.type === SwapAsset.NIM ? loadNimiq() : null,
            // if BTC is involved preload BitcoinJS
            this.request.fund.type === SwapAsset.BTC || this.request.redeem.type === SwapAsset.BTC
                ? loadBitcoinJS() : null,
            // if we need to fetch the tx from the network, preload the electrum client
            this.request.redeem.type === SwapAsset.BTC ? getElectrumClient() : null,
        ]).catch(() => void 0);

        // use mounted instead of created to ensure that SetupSwapLedger has the chance to run its created hook before.
        if (!await this._shouldConfirmSwap()) {
            return; // keep potential error message displayed
        }

        // Confirm swap to Fastspot and get contract details
        this.state = this.State.FETCHING_SWAP_DATA;
        initFastspotApi(Config.fastspot.apiEndpoint, Config.fastspot.apiKey);

        let refundAddress = '';
        switch (this.request.fund.type) {
            case SwapAsset.NIM:
                refundAddress = this.request.fund.sender.toUserFriendlyAddress();
                break;
            case SwapAsset.BTC:
                refundAddress = this.request.fund.refundAddress;
                break;
            default: break;
        }

        let redeemAddress: string | object = '';
        switch (this.request.redeem.type) {
            case SwapAsset.NIM:
                redeemAddress = this.request.redeem.recipient.toUserFriendlyAddress();
                break;
            case SwapAsset.BTC:
                redeemAddress = this.request.redeem.output.address;
                break;
            // case SwapAsset.EUR:
            //     // Assemble recipient object
            default: break;
        }

        // Generate UID to track account limits
        const walletInfo = this.findWallet(this.request.walletId);
        if (!walletInfo) throw new Error('UNEXPECTED: Cannot find walletId for swap signing');
        const uid = await walletInfo.getUid();

        let confirmedSwap: Swap;
        try {
            confirmedSwap = await confirmSwap({
                id: this.request.swapId,
            } as PreSwap, {
                // Redeem
                asset: this.request.redeem.type,
                address: redeemAddress,
            }, {
                // Refund
                asset: this.request.fund.type,
                address: refundAddress,
            }, uid).catch((error) => {
                if (error.message === 'The swap was already confirmed before.') {
                    return getSwap(this.request.swapId) as Promise<Swap>;
                } else {
                    throw error;
                }
            });

            console.debug('Swap:', confirmedSwap);
        } catch (error) {
            console.error(error);
            this.state = this.State.FETCHING_SWAP_DATA_FAILED;
            this.error = error.message || error;
            return;
        }

        if (this._isDestroyed) return;

        // Validate contract details
        // TODO also validate timeouts?
        let hashRoot: string | undefined;

        if (confirmedSwap.from.asset === SwapAsset.NIM || confirmedSwap.to.asset === SwapAsset.NIM) {
            const { data: nimHtlcData } = confirmedSwap.contracts[SwapAsset.NIM]!.htlc as NimHtlcDetails;
            const decodedNimHtlc = decodeNimHtlcData(nimHtlcData);

            // TODO: Decode via HashedTimeLockedContract instead of HtlcUtils when HTLC is part of CoreJS web-offline
            // const htlcData = Nimiq.HashedTimeLockedContract.dataToPlain(this.keyguardRequest.redeem.htlcData);
            // if (!('hashAlgorithm' in htlcData)) {
            //     this.$rpc.reject(new Error('UNEXPECTED: Could not decode NIM htlcData'));
            //     return;
            // }
            // const { hashAlgorithm, hashCount } = htlcData;
            // const algorithm = Nimiq.Hash.Algorithm.fromString(hashAlgorithm);

            hashRoot = decodedNimHtlc.hash;

            const hashSize = Nimiq.Hash.SIZE.get(decodedNimHtlc.hashAlgorithm)!;
            if (hashSize !== 32) {
                // Hash must be 32 bytes, as otherwise it cannot work with the BTC HTLC
                this.$rpc.reject(new Error('Disallowed HTLC hash length'));
                return;
            }
            if (decodedNimHtlc.hashCount !== 1) {
                // Hash count must be 1 for us to accept the swap
                this.$rpc.reject(new Error('Disallowed HTLC hash count'));
                return;
            }

            if (confirmedSwap.from.asset === SwapAsset.NIM && refundAddress !== decodedNimHtlc.refundAddress) {
                this.$rpc.reject(new Error('Unknown HTLC refund address'));
                return;
            }
            if (confirmedSwap.to.asset === SwapAsset.NIM && redeemAddress !== decodedNimHtlc.redeemAddress) {
                this.$rpc.reject(new Error('Unknown HTLC redeem address'));
                return;
            }
        }

        if (confirmedSwap.from.asset === SwapAsset.BTC || confirmedSwap.to.asset === SwapAsset.BTC) {
            const { script: btcHtlcScript } = confirmedSwap.contracts[SwapAsset.BTC]!.htlc as BtcHtlcDetails;
            await loadBitcoinJS();
            const decodedBtcHtlc = await decodeBtcScript(btcHtlcScript);

            if (hashRoot && decodedBtcHtlc.hash !== hashRoot) {
                this.$rpc.reject(new Error('HTLC hash roots do not match'));
                return;
            }
            hashRoot = decodedBtcHtlc.hash;

            if (confirmedSwap.from.asset === SwapAsset.BTC && refundAddress !== decodedBtcHtlc.refundAddress) {
                this.$rpc.reject(new Error('Unknown HTLC refund address'));
                return;
            }
            if (confirmedSwap.to.asset === SwapAsset.BTC && redeemAddress !== decodedBtcHtlc.redeemAddress) {
                this.$rpc.reject(new Error('Unknown HTLC redeem address'));
                return;
            }
        }

        if (confirmedSwap.from.asset === SwapAsset.EUR /* || confirmedSwap.to.asset === SwapAsset.EUR */) {
            // FIXME: Fetch contract from OASIS API and compare instead of trusting Fastspot

            if (hashRoot && confirmedSwap.hash !== hashRoot) {
                this.$rpc.reject(new Error('HTLC hash roots do not match'));
                return;
            }
            hashRoot = confirmedSwap.hash;
        }

        // Construct htlc info

        let fundingHtlcInfo: SwapHtlcInfo['fund'] | null = null;
        let redeemingHtlcInfo: SwapHtlcInfo['redeem'] | null = null;

        if (this.request.fund.type === SwapAsset.NIM) {
            const nimHtlcData = confirmedSwap.contracts[SwapAsset.NIM]!.htlc as NimHtlcDetails;

            fundingHtlcInfo = {
                type: SwapAsset.NIM,
                htlcData: Nimiq.BufferUtils.fromHex(nimHtlcData.data),
            };
        }

        if (this.request.fund.type === SwapAsset.BTC) {
            const btcHtlcData = confirmedSwap.contracts[SwapAsset.BTC]!.htlc as BtcHtlcDetails;

            fundingHtlcInfo = {
                type: SwapAsset.BTC,
                htlcScript: Nimiq.BufferUtils.fromHex(btcHtlcData.script),
            };
        }

        if (this.request.fund.type === SwapAsset.EUR) {
            const eurContract = confirmedSwap.contracts[SwapAsset.EUR] as Contract<SwapAsset.EUR>;
            const eurHtlcData = eurContract.htlc;

            fundingHtlcInfo = {
                type: SwapAsset.EUR,
                hash: confirmedSwap.hash,
                timeout: eurContract.timeout,
                htlcId: eurHtlcData.address,
            };
        }

        if (this.request.redeem.type === SwapAsset.NIM) {
            const nimHtlcData = confirmedSwap.contracts[SwapAsset.NIM]!.htlc as NimHtlcDetails;

            redeemingHtlcInfo = {
                type: SwapAsset.NIM,
                htlcData: Nimiq.BufferUtils.fromHex(nimHtlcData.data),
                htlcAddress: nimHtlcData.address,
            };
        }

        if (this.request.redeem.type === SwapAsset.BTC) {
            const btcHtlcData = confirmedSwap.contracts[SwapAsset.BTC]!.htlc as BtcHtlcDetails;

            // Fetch missing info from the blockchain
            // BTC tx hash and output data

            try {
                this.state = this.State.SYNCING;
                const { transaction, output } = await new Promise<{
                    transaction: BtcTransactionDetails,
                    output: PlainOutput,
                }>(async (resolve, reject) => {
                    try {
                        function listener(tx: BtcTransactionDetails) {
                            const htlcOutput = tx.outputs.find((out) => out.address === btcHtlcData.address);
                            if (htlcOutput && htlcOutput.value === confirmedSwap.to.amount) {
                                resolve({
                                    transaction: tx,
                                    output: htlcOutput,
                                });
                                electrum.removeListener(handle);
                                return true;
                            }
                            return false;
                        }

                        const electrum = await getElectrumClient();

                        // First subscribe to new transactions
                        const handle = electrum.addTransactionListener(listener, [btcHtlcData.address]);

                        // Then check history
                        const history = await electrum.getTransactionsByAddress(btcHtlcData.address);
                        for (const tx of history) {
                            if (listener(tx)) return;
                        }
                    } catch (error) {
                        reject(error);
                    }
                });

                redeemingHtlcInfo = {
                    type: SwapAsset.BTC,
                    htlcScript: Nimiq.BufferUtils.fromHex(btcHtlcData.script),
                    transactionHash: transaction.transactionHash,
                    outputIndex: output.index,
                };
            } catch (error) {
                console.error(error);
                this.state =  this.State.SYNCING_FAILED;
                this.error = error.message || error;
                return;
            }
        }

        if (this._isDestroyed) return;

        if (!fundingHtlcInfo || !redeemingHtlcInfo) {
            this.$rpc.reject(new Error('Funding or redeeming HTLC info missing.'));
            return;
        }

        // if (this.request.redeem.type === SwapAsset.EUR) {
        //
        // }

        // Sign transactions
        this.state = this.State.SIGNING_TRANSACTIONS;
        let nimiqTransaction: Nimiq.Transaction | undefined;
        let nimiqProxyTransaction: Nimiq.Transaction | undefined;
        let bitcoinTransaction: SignedBtcTransaction | undefined;
        let refundTransaction: string | undefined;
        let euroSettlement: string | undefined;
        try {
            const signingResult = await this._signSwapTransactions({
                fund: fundingHtlcInfo,
                redeem: redeemingHtlcInfo,
            });
            if (!signingResult) return; // failed to sign and an error is getting displayed
            ({
                nim: nimiqTransaction,
                nimProxy: nimiqProxyTransaction,
                btc: bitcoinTransaction,
                eur: euroSettlement,
                refundTx: refundTransaction,
            } = signingResult);
        } catch (error) {
            if (!this._isDestroyed) {
                this.$rpc.reject(error);
            }
            return;
        }

        if (this._isDestroyed) return;

        if (nimiqTransaction) {
            // If we have a Nimiq transaction, validate it (to make sure we are not returning an invalid tx)
            // FIXME: unnecessary once we enable nimiqTransaction.verify() below
            const signatureProof = Nimiq.SignatureProof.unserialize(new Nimiq.SerialBuffer(nimiqTransaction.proof));
            if (!signatureProof.verify(null, nimiqTransaction.serializeContent())) {
                this.$rpc.reject(new Error('NIM signature is invalid'));
                return;
            }

            // for redeeming nim transaction prepare a htlc proof with a dummy preImage and hashRoot
            if (this.request.redeem.type === SwapAsset.NIM && redeemingHtlcInfo.type === SwapAsset.NIM) {
                const dummyPreImage = '0000000000000000000000000000000000000000000000000000000000000000';
                const dummyHashRoot = '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925'; // sha256

                // FIXME: Enable decoding when HTLC is part of CoreJS web-offline build
                const algorithm = redeemingHtlcInfo.htlcData[20 + 20] as Nimiq.Hash.Algorithm;
                const hashCount = redeemingHtlcInfo.htlcData[20 + 20 + 32 + 1];

                const proof = new Nimiq.SerialBuffer(3 + 2 * 32 + Nimiq.SignatureProof.SINGLE_SIG_SIZE);
                // FIXME: Use constant when HTLC is part of CoreJS web-offline build
                proof.writeUint8(1 /* Nimiq.HashedTimeLockedContract.ProofType.REGULAR_TRANSFER */);
                proof.writeUint8(algorithm);
                proof.writeUint8(hashCount);
                proof.write(Nimiq.BufferUtils.fromHex(dummyHashRoot));
                proof.write(Nimiq.BufferUtils.fromHex(dummyPreImage));
                proof.write(new Nimiq.SerialBuffer(nimiqTransaction.proof)); // Current proof is regular SignatureProof
                nimiqTransaction.proof = proof;
            }

            // FIXME: Enable validation when HTLC is part of CoreJS web-offline build
            // // Validate that transaction is valid
            // if (!nimiqTransaction.verify()) {
            //     this.$rpc.reject(new Error('NIM transaction is invalid'));
            //     return;
            // }
        }

        // Construct Hub response

        const result: SetupSwapResult = {
            nim: nimiqTransaction ? await this.nimiqNetwork.makeSignTransactionResult(nimiqTransaction) : undefined,
            nimProxy: nimiqProxyTransaction
                ? await this.nimiqNetwork.makeSignTransactionResult(nimiqProxyTransaction)
                : undefined,
            btc: bitcoinTransaction,
            eur: euroSettlement,
            refundTx: refundTransaction,
        };

        this.$rpc.resolve(result);
    }

    protected destroyed() {
        this._isDestroyed = true;
    }

    protected async _shouldConfirmSwap() {
        // note that this method gets overwritten for SetupSwapLedger
        return this.keyguardResult && this.keyguardResult.success && !this._isDestroyed;
    }

    protected async _signSwapTransactions(htlcInfo: SwapHtlcInfo): Promise<{
        nim?: Nimiq.Transaction,
        nimProxy?: Nimiq.Transaction, // only in SetupSwapLedger
        btc?: SignedBtcTransaction,
        eur?: string,
        refundTx?: string,
    } | null> {
        // Note that this method gets overwritten for SetupSwapLedger
        const keyguardRequest: KeyguardSignSwapTransactionsRequest = {
            ...htlcInfo,
            swapId: this.request.swapId,
        };

        const client = this.$rpc.createKeyguardClient();
        const {
            nim: nimiqSignatureResult,
            btc: bitcoinTransaction,
            eur: euroSettlement,
            refundTx,
        } = await client.signSwapTransactions(keyguardRequest);

        // create a nimiq transaction
        let nimiqTransaction: Nimiq.Transaction | undefined;
        if (this.request.fund.type === SwapAsset.NIM && htlcInfo.fund.type === SwapAsset.NIM && nimiqSignatureResult) {
            nimiqTransaction = await this.nimiqNetwork.createTx({
                ...this.request.fund,
                recipient: Nimiq.Address.CONTRACT_CREATION,
                recipientType: Nimiq.Account.Type.HTLC,
                data: htlcInfo.fund.htlcData,
                flags: Nimiq.Transaction.Flag.CONTRACT_CREATION,
                signerPubKey: nimiqSignatureResult.publicKey,
                signature: nimiqSignatureResult.signature,
            });
        } else if (this.request.redeem.type === SwapAsset.NIM && htlcInfo.redeem.type === SwapAsset.NIM
            && nimiqSignatureResult) {
            nimiqTransaction = await this.nimiqNetwork.createTx({
                ...this.request.redeem,
                sender: Nimiq.Address.fromUserFriendlyAddress(htlcInfo.redeem.htlcAddress),
                senderType: Nimiq.Account.Type.HTLC,
                signerPubKey: nimiqSignatureResult.publicKey,
                signature: nimiqSignatureResult.signature,
            });
        }

        return {
            nim: nimiqTransaction,
            btc: bitcoinTransaction ? {
                serializedTx: bitcoinTransaction.raw,
                hash: bitcoinTransaction.transactionHash,
            } : undefined,
            eur: euroSettlement,
            refundTx,
        };
    }

    protected get statusScreenState(): StatusScreen.State {
        if (this.state === this.State.FETCHING_SWAP_DATA_FAILED) return StatusScreen.State.ERROR;
        return super.statusScreenState;
    }

    protected get statusScreenTitle() {
        switch (this.state) {
            case this.State.FETCHING_SWAP_DATA_FAILED:
                return this.$t('Swap Setup Failed') as string;
            case this.State.SYNCING_FAILED:
                return this.$t('Syncing Failed') as string;
            default:
                return this.$t('Preparing Swap') as string;
        }
    }

    protected get statusScreenStatus() {
        switch (this.state) {
            case this.State.FETCHING_SWAP_DATA:
                return this.$t('Fetching swap data...') as string;
            case this.State.SIGNING_TRANSACTIONS:
                return this.$t('Signing transactions...') as string;
            default:
                return super.statusScreenStatus;
        }
    }

    protected get statusScreenMessage() {
        if (this.state === this.State.FETCHING_SWAP_DATA_FAILED) {
            return this.$t('Fetching swap data failed: {error}', { error: this.error }) as string;
        }
        return super.statusScreenMessage;
    }

    protected get statusScreenAction() {
        if (this.state !== this.State.FETCHING_SWAP_DATA_FAILED
            && this.state !== this.State.SYNCING_FAILED) return '';
        return this.$t('Retry') as string;
    }

    protected get isGlobalCloseShown() {
        return this.state === this.State.FETCHING_SWAP_DATA_FAILED || super.isGlobalCloseShown;
    }
}
</script>
