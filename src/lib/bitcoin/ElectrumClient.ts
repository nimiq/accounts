import Config from 'config';
import { BTC_NETWORK_MAIN } from './BitcoinConstants';
import { loadBitcoinJS } from './BitcoinJSLoader';

// Import only types to avoid bundling of lazy-loaded libs.
import type { ElectrumClient } from '@nimiq/electrum-client';
import type { Transaction as BitcoinJsTransaction } from 'bitcoinjs-lib';

let electrumClientPromise: Promise<ElectrumClient> | null = null;

/**
 * Get a singleton Electrum client. This singleton should be used throughout the whole app, such that consensus has
 * only to be established once. The Electrum client library is lazy-loaded on demand. Optionally wait for consensus.
 */
export async function getElectrumClient(waitForConsensus: boolean = true) {
    electrumClientPromise = electrumClientPromise || (async () => {
        // @nimiq/electrum-client already depends on a globally available BitcoinJS,
        // so we need to load it first.
        // TODO (pre)load electrum client in parallel
        await loadBitcoinJS();

        const { GenesisConfig, Network, ElectrumClient: Client } = await import(
            /*webpackChunkName: "electrum-client"*/ '@nimiq/electrum-client');

        try {
            GenesisConfig[Config.bitcoinNetwork === BTC_NETWORK_MAIN ? 'main' : 'test']();
        } catch (e) {
            // GenesisConfig already initialized. Check whether it's for the correct network.
            if ((Config.bitcoinNetwork === BTC_NETWORK_MAIN) !== (GenesisConfig.NETWORK_NAME === Network.MAIN)) {
                throw new Error('Wrong Electrum client GenesisConfig initialized.');
            }
        }

        const options = Config.bitcoinNetwork === BTC_NETWORK_MAIN ? {
            extraSeedPeers: [{
                host: 'c0a5duastc849ei53vug.bdnodes.net',
                wssPath: 'electrumx',
                ports: { wss: 443, ssl: 50002, tcp: null },
                ip: '',
                version: '',
                highPriority: true,
            }, {
                host: 'btccore-main.bdnodes.net',
                ports: { wss: null, ssl: 50002, tcp: null },
                ip: '',
                version: '',
            }],
        } : {};

        return new Client(options);
    })();

    let client: ElectrumClient;
    try {
        client = await electrumClientPromise;
    } catch (e) {
        electrumClientPromise = null;
        throw e;
    }

    if (waitForConsensus) {
        await client.waitForConsensusEstablished();
    }

    return client;
}

export async function fetchTransaction(transactionHash: string): Promise<BitcoinJsTransaction> {
    const [electrum, transactionFromPlain] = await Promise.all([
        getElectrumClient(),
        import(/*webpackChunkName: "electrum-client"*/ '@nimiq/electrum-client')
            .then((module) => module.transactionFromPlain),
    ]);

    const fetchedTransaction = await electrum.getTransaction(transactionHash);
    return transactionFromPlain(fetchedTransaction);
}
