---
title: Sign Transaction
layout: default
parent: API Reference
nav_order: 40
permalink: /api-reference/sign-transaction
---

# Sign Transaction
{: .no_toc }

The `signTransaction()` method is similar to [checkout](/hub/checkout), but provides a different
UI to the user. This request does not connect to the Nimiq blockchain at any point, so it can
be used to sign transactions offline.

## Table of Contents
{: .no_toc .text-delta }

1. TOC
{:toc}

## Differences to Checkout

- It requires the request to include the sender's address as `sender`.
- It requires the request to include the transaction's `validityStartHeight`.
- The created transaction will only be returned to the caller, not sent to the network.

## Request

<div class="code-example">
  <p>Result: <span id="output">-</span></p>
  <small>Please choose an address first to use as the sender:</small><br>
  <button id="choose-address-btn" class="btn mb-1">Choose address</button>
  <button id="sign-transaction-btn" class="btn btn-primary mb-1" disabled>Sign Transaction</button>

  <script
    src="https://cdn.jsdelivr.net/npm/@nimiq/hub-api@v1.2.3/dist/standalone/HubApi.standalone.umd.js"
    integrity="sha256-5X6zryCUAPOnfjLU8tEtJrLdcslA2UI27RsUWnLAxHs=" crossorigin="anonymous"></script>
  <script>
    const hubApi = new HubApi('https://hub.nimiq-testnet.com');

    let chosenAddress = '';

    document.getElementById('choose-address-btn').addEventListener('click', async function(event) {
      const output = document.getElementById('output');

      try {
        const result = await hubApi.chooseAddress({
          appName: 'Hub API Docs',
        });
        output.textContent = result.address + ' (' + result.label + ')';
        chosenAddress = result.address;
        document.getElementById('sign-transaction-btn').disabled = false;
      } catch (error) {
        output.textContent = error.message;
      }
    });

    document.getElementById('sign-transaction-btn').addEventListener('click', async function(event) {
      const output = document.getElementById('output');

      try {
        const result = await hubApi.signTransaction({
          appName: 'Hub API Docs',
          sender: chosenAddress,
          recipient: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
          value: 3.14 * 1e5, /* 3.14 NIM */
          validityStartHeight: 500000,
        });
        output.textContent = 'Transaction signed!';
      } catch (error) {
        output.textContent = error.message;
      }
    });
  </script>
</div>
```javascript
const options = {
  appName: 'Hub API Docs',
  sender: chosenAddress,
  recipient: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
  value: 3.14 * 1e5, /* 3.14 NIM */
  validityStartHeight: 500000,
  // See more options in the table below
};

// All client requests are async and return a promise
const signedTransaction = await hubApi.signTransaction(options);
```

## Options

(On mobile, scroll right to see the whole table.)

| Option | Type | Required? | Description |
|:-------|:-----|:----------|:------------|
| `appName` | string | **yes** | The name of your app, should be as short as possible. |
| `sender` | string | **yes** | The human-readable address of the sender. |
| `recipient` | string | **yes** | The human-readable address of the recipient (your shop/app). |
| `value` | number | **yes** | Value of the transaction, in Luna. |
| `validityStartHeight` | number | **yes** | The transaction's validity start height. (A transaction is only valid for 120 blocks after its validityStartHeight. Transactions with a validityStartHeight higher than the next network block height are rejected and need to be sent again later during their validity window.) |
| `fee` | number | no | Transaction fee in Luna. Default: 0 |
| `extraData` | string or Uint8Array | no | Extra data that should be sent with the transaction. |
| `flags` | number | no | A [`Nimiq.Transaction.Flag`](https://nimiq-network.github.io/developer-reference/chapters/transactions.html#extended-transaction), only required if the transaction should create a contract. |
| `recipientType` | number | no | The [`Nimiq.Account.Type`](https://nimiq-network.github.io/developer-reference/chapters/accounts-and-contracts.html#contracts) of the recipient. Only required if the transaction should create a contract. |

## Result

The `signTransaction()` method returns a `SignedTransaction`.

```javascript
interface SignedTransaction {
    serializedTx: string;                  // HEX signed and serialized transaction
    hash: string;                          // HEX transaction hash

    raw: {
        signerPublicKey: Uint8Array;       // Serialized public key of the signer
        signature: Uint8Array;             // Serialized signature of the signer

        sender: string;                    // Human-readable address of sender
        senderType: Nimiq.Account.Type;    // 0, 1, 2 - see recipientType above

        recipient: string;                 // Human-readable address of recipient
        recipientType: Nimiq.Account.Type; // 0, 1, 2 - see above

        value: number;
        fee: number;
        validityStartHeight: number;       // Automatically determined validity
                                           // start height of the transaction
        extraData: Uint8Array;
        flags: number;
        networkId: number;
    }
}
```

The `serializedTx` can be handed to a Nimiq JSON-RPC's `sendRawTransaction` method.

The `raw` object can be handed to the NanoApi's `relayTransaction` method.
