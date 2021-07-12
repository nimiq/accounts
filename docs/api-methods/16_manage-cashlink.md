---
title: Manage Cashlink
layout: default
parent: API Reference
nav_order: 16
permalink: /api-reference/manage-cashlink
---

# Manage Cashlink
{: .no_toc }

To get an intro on what Cashlinks are and how to create them see [Create Cashlink](create-cashlink).

With `manageCashlink()`, you can open a pop-up for the user to cancel or share an existing Cashlink.

## Table of Contents
{: .no_toc .text-delta }

1. TOC
{:toc}

## Request

<div class="code-example">
  <label for="address-input">
    Paste the address you got from <code>createCashlink()</code>  below.
  </label><br>
  <input id="address-input" placeholder="Cashlink address">
  <button id="manage-cashlink-btn" class="btn btn-primary mb-1">Manage Cashlink</button>
  <p>Result: <span id="output">-</span></p>

  <script
    src="https://cdn.jsdelivr.net/npm/@nimiq/hub-api@v1.0/dist/standalone/HubApi.standalone.umd.js"
    integrity="sha256-HZuohwzM5nRdRQh3HLpAcYGbpNe6PtqZRyK+VvUI+nU=" crossorigin="anonymous"></script>
  <script>
    const hubApi = new HubApi('https://hub.nimiq-testnet.com');

    document.getElementById('manage-cashlink-btn').addEventListener('click', async function(event) {
      const input = document.getElementById('address-input');
      const output = document.getElementById('output');

      try {
        const result = await hubApi.createCashlink({
          appName: 'Hub API Docs',
          cashlinkAddress: input.value,
        });
        output.textContent = `Cashlink created: ${result.link}`;
      } catch (error) {
        output.textContent = error.message;
      }
    });
  </script>
</div>

```javascript
const options = {
  appName: 'Hub API Docs', // required
  cashlinkAddress: 'NQ07 0000...', // required
};

// All client requests are async and return a promise
const result = await hubApi.manageCashlink(options);
```

## Options

(On mobile, scroll right to see the entire table.)

| Option | Type | Required? | Description |
|:-------|:-----|:----------|:------------|
| `appName` | string | **yes** | The name of your app, should be as short as possible. |
| `cashlinkAddress` | string | **yes** | Human-readable address of the Cashlink. Will be returned from the `createCashlink()` API call. |

## Result

The `manageCashlink()` method returns a promise which resolves to a `Cashlink`, see [Create Cashlink](create-cashlink) for details.
