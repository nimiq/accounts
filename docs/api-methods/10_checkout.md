---
title: Checkout
layout: default
parent: API Reference
nav_order: 10
permalink: /api-reference/checkout
---

# Checkout
{: .no_toc }

The `checkout()` method allows your site to request a payment from the user in form of a transaction. Calling this method will open a pop-up where the user can select the payment option and finalize the payment &mdash; or cancel the process.

This API method has two versions:
1) **NIM Checkout:** The user selects the address to send from and confirms the payment. During the payment process, the signed transaction is sent (relayed) to the network but also returned to the caller, e.g. for processing on your side, storage on your server or re-submittal.

2) **The Multicurrency Checkout:** Enables you to accept payments in BTC, ETH and NIM. When paying with NIM, it will be similar to the previous version, but when accepting BTC or ETH, the user will have to scan a QR code to pay with those currencies using their native wallets.

## Table of Contents
{: .no_toc .text-delta }

1. TOC
{:toc}

## Example

<div class="code-example">
  <button id="nim-checkout-btn" class="btn btn-primary mb-1">NIM Checkout</button>
  <button id="multi-checkout-btn" class="btn btn-primary mb-1">Multicurrency Checkout</button>
  <p>Result: <span id="output">-</span></p>

  <script
    src="https://cdn.jsdelivr.net/npm/@nimiq/hub-api@v1.2.3/dist/standalone/HubApi.standalone.umd.js"
    integrity="sha256-5X6zryCUAPOnfjLU8tEtJrLdcslA2UI27RsUWnLAxHs=" crossorigin="anonymous"></script>
  <script>
    const hubApi = new HubApi('https://hub.nimiq-testnet.com');

    document.getElementById('nim-checkout-btn').addEventListener('click', async function(event) {
      const output = document.getElementById('output');

      try {
        const result = await hubApi.checkout({
          appName: 'Hub API Docs',
          recipient: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
          value: 3.14 * 1e5, /* 3.14 NIM */
        });
        output.textContent = 'Checkout complete, transaction sent!';
      } catch (error) {
        output.textContent = error.message;
      }
    });
    document.getElementById('multi-checkout-btn').addEventListener('click', async function(event) {
      const output = document.getElementById('output');
      const now = new Date();
      try {
        const result = await hubApi.checkout({
          appName: 'Hub API Docs',
          version: 2, // switching to multicurrency checkout!
          callbackUrl: `${location.origin}/callback.html`, // required if using BTC/ETH!
          csrf: 'dummy-csrf-token', // generate and store server-side
          time: now,
          fiatCurrency: 'EUR', // Or any other valid currency symbol
          fiatAmount: 24.99,
          paymentOptions: [{
            currency: HubApi.Currency.NIM,
            type: HubApi.PaymentType.DIRECT,
            amount: '20e5', // the price you charge in Luna, 20e5 are 20 NIM
            expires: + new Date(now + 15 * 60000), // 15 minutes
            protocolSpecific: {
              fee: 50000, // optional, default: 0
            },
          },{
            currency: HubApi.Currency.BTC,
            type: HubApi.PaymentType.DIRECT, // in the future also via OASIS :)
            amount: '.00029e8', // what you'll charge in BTC
            expires: + new Date(now + 15 * 60000), // 15 minutes
            protocolSpecific: {
              feePerByte: 2, // 2 sat per byte
              recipient: '17w6ar5SqXFGr786WjGHB8xyu48eujHaBe', // Unicef
            },
          },{
            currency: HubApi.Currency.ETH,
            type: HubApi.PaymentType.DIRECT,
            amount: '.0091e18', // your price in ETH
            expires: + new Date(now + 15 * 60000), // 15 minutes
            protocolSpecific: {
              gasLimit: 21000,
              gasPrice: '10000',
              recipient: '0xa4725d6477644286b354288b51122a808389be83', // the water project
            },
          }]});
        output.textContent = 'Checkout complete, transaction sent!';
      } catch (error) {
        output.textContent = error.message;
      }
    });
  </script>
</div>

## NIM Checkout

### Request

```javascript
const options = {
  appName: 'Hub API Docs',
  recipient: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
  value: 3.14 * 1e5, /* 3.14 NIM */
  // See more options in the table below
};

// All client requests are async and return a promise
const signedTransaction = await hubApi.checkout(options);
```

### Options

(On mobile, scroll right to see the entire table.)

| Option | Type | Required? | Description |
|:-------|:-----|:----------|:------------|
| `appName` | string | **yes** | The name of your app, should be as short as possible. |
| `recipient` | string | **yes** | Your Nimiq address in human-readable format ("NQ ..."). |
| `value` | number | **yes** | Value of the transaction, in Luna. |
| `shopLogoUrl` | string | no | An image URL. Must be on the same origin as the request is sent from. Should be square and at least 146x146 px. |
| `fee` | number | no | Transaction fee in Luna. Default: 0 |
| `extraData` | string or Uint8Array | no | A message that should be sent with the transaction - it will be public on the blockchain! |
| `sender` | string | no | Human-readable address of the sender. If the address exists in the user's Hub and has enough balance, the address selection is skipped. |
| `forceSender` | boolean | no | Whether to force the submitted sender address. If this option is `true`, an exception is thrown when either the sender address does not exist or does not have sufficient balance. When `false` (default), the user will be shown the address selector instead. (Only relevant in connection with the `sender` option.) |
| `validityDuration` | number | no | The duration (in number of blocks) that the signed transaction should be valid for. The maximum and default is 120. |
| `flags` | number | no | A [`Nimiq.Transaction.Flag`](https://nimiq-network.github.io/developer-reference/chapters/transactions.html#extended-transaction), only required if the transaction should create a contract. |
| `recipientType` | number | no | The [`Nimiq.Account.Type`](https://nimiq-network.github.io/developer-reference/chapters/accounts-and-contracts.html#contracts) of the recipient. Only required if the transaction should create a contract. |
| `version` | number | no | Set to `1` for the NIM Checkout. Default: 1. |

## Multicurrency Checkout

### Request

```javascript
const options = {
  appName: 'Hub API Docs',
  version: 2, // switching to multicurrency checkout!
  callbackUrl: `${location.origin}/callback.html`, // required if using BTC/ETH!
  csrf: 'dummy-csrf-token', // generate and store server-side
  time: now,
  fiatCurrency: 'EUR', // Or any other valid currency symbol
  fiatAmount: 24.99,
  paymentOptions: [{
    type: HubApi.PaymentType.DIRECT,  // in the future also via OASIS :)
    currency: HubApi.Currency.NIM,
    amount: '20e5', // the price you charge in Luna, 20e5 are 20 NIM
    expires: + new Date(now + 15 * 60000), // 15 minutes
    protocolSpecific: {
      fee: 50000, // optional, default: 0
    },
  },{
    type: HubApi.PaymentType.DIRECT,
    currency: HubApi.Currency.BTC,
    amount: '.00029e8', // what you'll charge in Satoshi
    expires: + new Date(now + 15 * 60000), // 15 minutes
    protocolSpecific: {
      feePerByte: 2, // 2 Satoshi per byte
      recipient: '17w6ar5SqXFGr786WjGHB8xyu48eujHaBe', // Unicef
    },
  },{
    type: HubApi.PaymentType.DIRECT,
    currency: HubApi.Currency.ETH,
    amount: '.0091e18', // your price in Wei
    expires: + new Date(now + 15 * 60000), // 15 minutes
    protocolSpecific: {
      gasLimit: 21000,
      gasPrice: '10000',
      recipient: '0xa4725d6477644286b354288b51122a808389be83', // the water project
    },
  }]
};

// A signed transaction when paid with NIM, otherwise the callback URL will be used.
const signedTransaction = await hubApi.checkout(options);
```

### Options

| Option | Type | Required? | Description |
|:-------|:-----|:----------|:------------|
| `appName` | string | **yes** | The name of your app, should be as short as possible. |
| `version` | number | **yes** | Set to `2` for Multicurrency Checkout. |
| `callbackUrl` | string | **yes** | The URL will be called to receive the payment details for BTC and ETH. See [Callback](#callback) for details |
| `csrf` | string | no | To make sure the request came from you. |
| `time` | number | **yes** | Current time on your server in seconds or milliseconds. |
| `shopLogoUrl` | string | **yes** | An image URL. Must be on the same origin as the request is sent from. Should be square and at least 146x146 px. |
| `fiatCurrency` | string | **yes** | Currency symbol (ISO 4217 Code) of the fiat you are requesting to be paid in. See below. |
| `fiatAmount` | number | **yes** | Exact fiat amount you are requesting to be paid in. |
| `paymentOptions` | array | **yes** | One entry per cryptocurrency you want to accept. Supported: BTC, ETH, and NIM. NIM is required! See below for properties. |

#### Payment Options

| Option | Type | Required? | Description |
|:-------|:-----|:----------|:------------|
| `type` | number | **yes** | Set to `0` or `HubApi.PaymentType.DIRECT` for direct transactions. Will also support `OASIS` as soon as it goes live; expected in 2020. |
| `currency` | string | **yes** | The symbol of the cryptocurrency to be charged: `nim`, `btc`, or `eth` - or use the `HubApi.Currency` enum. |
| `amount` | string | **yes** | Amount of crypto requested in the given currency's smallest denominator. As string to not lose any digits. |
| `expires` | number | no | The duration (in milliseconds) that the given rate is offered. We recommend 15 minutes. Default: 0 (does not expire) |
| `protocolSpecific` | object | **yes** | Settings that are particular to BTC, ETH, and NIM, see below. |

#### Protocol specific: Nimiq

| Option | Type | Required? | Description |
|:-------|:-----|:----------|:------------|
| `fee` | number | no | The fee to use for the transaction, 2 Luna per byte is recommended, as a rule of thumb: 150 Luna. Default: 0. |

#### Protocol specific: Bitcoin

All fields are optional. All fields can be set or overwritten when answering the callback at `callbackUrl`.

| Option | Type | Required? | Description |
|:-------|:-----|:----------|:------------|
| `feePerByte` | number | no | The fee to be used for the transaction, 2 Satoshis per byte are recommended. Default: 0 (Thus, this value should always be set!) |
| `fee` | number | no | The absolute fee, we recommend to use `feePerByte` (above). |
| `recipient` | string | no | Bitcoin address to receive the BTC at. If you don't set that here it's required when receiving the callback on `callbackUrl`. **# limits on which formats are accepted?** |

#### Protocol specific: Ethereum

All fields are optional. All fields can be set or overwritten when answering the callback at `callbackUrl`.

| Option | Type | Required? | Description |
|:-------|:-----|:----------|:------------|
| `gasLimit` | number | no | Maximum of gas to be paid for the transaction; 21000 recommended. |
| `gasPrice` | string | no | In Gwei (1 billion Wei); multiplying limit and price will result in the fee to be paid. Recommended: 10000. |
| `recipient` | string | no | Ethereum address to receive the ETH at. |

### Callback

The idea of using a callback is that a Bitcoin or Ethereum address can be created only when the user selects to pay by that crypto. All information returned from your server to the callback will overwrite the fields given in the request's `protocolSpecific`.

**TODO:** will add

* Flow chart of calls and callbacks
* Data structures requested
* Data provided

## Result

The `checkout()` method returns a promise which resolves to a `SignedTransaction` when the checkout was paid with NIM:
**#What gets returned when paying with BTC or ETH? undefined?**

```javascript
interface SignedTransaction {
    serializedTx: string;                  // HEX signed and serialized transaction
    hash: string;                          // HEX transaction hash

    raw: {
        signerPublicKey: Uint8Array;       // Serialized public key of the signer
        signature: Uint8Array;             // Serialized signature of the signer

        sender: string;                    // Human-readable address of sender
        senderType: Nimiq.Account.Type;

        recipient: string;                 // Human-readable address of recipient
        recipientType: Nimiq.Account.Type;

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
