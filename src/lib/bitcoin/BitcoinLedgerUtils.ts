import Config from 'config';
import { BTC_NETWORK_TEST } from './BitcoinConstants';
import { fetchTransaction } from './ElectrumClient';
import { loadBitcoinJS } from './BitcoinJSLoader';

// Import only types to avoid bundling
import type { Transaction as BitcoinJsTransaction } from 'bitcoinjs-lib';
import type { BitcoinTransactionInfo } from '../../views/SignBtcTransaction.vue';
import type { TransactionInfoBitcoin as LedgerBitcoinTransactionInfo } from '@nimiq/ledger-api';

export async function prepareBitcoinTransactionForLedgerSigning(
    transactionInfo: Omit<BitcoinTransactionInfo, 'inputs'>
        & { inputs: Array<
            Pick<
                BitcoinTransactionInfo['inputs'][0],
                'transactionHash' | 'outputIndex' | 'keyPath' | 'witnessScript' | 'sequence'
            >
        > },
): Promise<LedgerBitcoinTransactionInfo> {
    const bitcoinJsPromise = loadBitcoinJS();

    // Fetch whole input transactions for computation of Ledger's trusted inputs.
    // Fetch them in batches of 10 to avoid too many network requests at once.
    const inputTransactions: BitcoinJsTransaction[] = [];
    for (let i = 0; i < transactionInfo.inputs.length; i += 10) {
        const batch = transactionInfo.inputs.slice(i, i + 10);
        inputTransactions.push(...await Promise.all(batch.map((input) => fetchTransaction(input.transactionHash))));
    }

    const inputs: LedgerBitcoinTransactionInfo['inputs'] = transactionInfo.inputs.map((input, i) => ({
        transaction: inputTransactions[i],
        index: input.outputIndex,
        keyPath: input.keyPath.replace(/m\//, ''),
        customScript: input.witnessScript,
        sequence: input.sequence,
    }));

    // Prepare outputs and pre-calculate output scripts
    await bitcoinJsPromise;
    const network = Config.bitcoinNetwork === BTC_NETWORK_TEST
        ? BitcoinJS.networks.testnet
        : BitcoinJS.networks.bitcoin;
    const outputs: LedgerBitcoinTransactionInfo['outputs']  = [{
        amount: transactionInfo.recipientOutput.value,
        outputScript: BitcoinJS.address.toOutputScript(
            transactionInfo.recipientOutput.address,
            network,
        ).toString('hex'),
    }];
    let changePath: string | undefined;
    if (transactionInfo.changeOutput) {
        changePath = transactionInfo.changeOutput.keyPath.replace(/^m\//, '');
        outputs.push({
            amount: transactionInfo.changeOutput.value,
            outputScript: BitcoinJS.address.toOutputScript(
                transactionInfo.changeOutput.address!,
                network,
            ).toString('hex'),
        });
    }

    return { inputs, outputs, changePath, lockTime: transactionInfo.locktime };
}
