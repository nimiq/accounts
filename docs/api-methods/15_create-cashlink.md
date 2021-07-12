---
title: Create Cashlink
layout: default
parent: API Reference
nav_order: 15
permalink: /api-reference/create-cashlink
---

# Create Cashlink
{: .no_toc }

A Cashlink is a special way of sending NIM in form of a link. All the information about the NIM being sent is included in the link, non is stored on third-party servers or the clouds -- it's truly non-custodial.
The `createCashlink()` method allows the user to create such a link and charge it with NIM.

Calling this method will open a pop-up for the user to select the address to charge the Cashlink from &mdash;
or cancel the request.

## Table of Contents
{: .no_toc .text-delta }

1. TOC
{:toc}

## Request

<div class="code-example">
  <button id="create-cashlink-btn" class="btn btn-primary mb-1">Create a Cashlink</button>
  <p>Result: <span id="output">-</span></p>

  <script
    src="https://cdn.jsdelivr.net/npm/@nimiq/hub-api@v1.0/dist/standalone/HubApi.standalone.umd.js"
    integrity="sha256-HZuohwzM5nRdRQh3HLpAcYGbpNe6PtqZRyK+VvUI+nU=" crossorigin="anonymous"></script>
  <script>
    const hubApi = new HubApi('https://hub.nimiq-testnet.com');

    document.getElementById('create-cashlink-btn').addEventListener('click', async function(event) {
      const output = document.getElementById('output');

      try {
        const result = await hubApi.createCashlink({
          appName: 'Hub API Docs',
          value: 3.14 * 1e5, // 3.14 NIM
          returnLink: true,
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
  value: 3.14 * 1e5, // 3.14 NIM
  returnLink: true,
  // More options in the table below
};

// All client requests are async and return a promise
const result = await hubApi.createCashlink(options);
```

## Options

(On mobile, scroll right to see the entire table.)

| Option | Type | Required? | Description |
|:-------|:-----|:----------|:------------|
| `appName` | string | **yes** | The name of your app, should be as short as possible. |
| `value` | number | no | Amount of NIM to be loaded onto the Cashlink, in Luna. |
| `theme` | number | no | Give your Cashlink a custom look e.g. for birthdays, seasonal greetings or Luna New Year - more will be added in the future. Use the `CashlinkTheme` enum. |
| `message` | string | no | A message to be included with the Cashlink. Can be changed by the user. Maximum 255 bytes. |
| `autoTruncateMessage` | boolean | no | Truncate the message automatically if it is longer than 255 bytes. Default: true. |
| `senderAddress` | string | no | Preset the address the Cashlink should be funded from. If the address doesn't exists, all available addresses will be shown. |
| `senderBalance` | number | no | If `senderAddress` is set, you can pass the latest balance if you know it. This will speed up the process as the Hub doesn't need to wait for the balance to be retrieved from the network. |
| `returnLink` | boolean | no | As the Cashlink is similar to cash (who get's the hands on it can use the NIM), the user will handle it confidentially. Thus, this flag is available for privileged apps only, i.e. apps at nimiq.com. Default: false. |
| `skipSharing` | boolean | no | If you set `returnLink` to `true`, this flag can also be set. If set, the dialog will skip the section helping the user to share the Cashlink after it has been created. Default: false. |

## Result

The `createCashlink()` method returns a promise which resolves to a `Cashlink` instance:

```javascript
interface Cashlink {
    address: string;       // Human-readable address of
                           // where the NIM are stored
    message: string;
    value: number;         // In Luna
    status: CashlinkState; // See below
    theme: CashlinkTheme;  // See below
    link?: string;         // the created Cashlink
                           // if returnLink was set to true
}

enum CashlinkState {
    UNKNOWN = -1,
    UNCHARGED = 0,
    CHARGING = 1,
    UNCLAIMED = 2,
    CLAIMING = 3,
    CLAIMED = 4,
}

enum CashlinkTheme {
    UNSPECIFIED, // Equivalent to theme being omitted
    STANDARD,
    CHRISTMAS,
    LUNAR_NEW_YEAR,
    GENERIC,
    BIRTHDAY, // More will be added in the future
}
```

The `address` returned from `createCashlink()` is the address of the account that was created and is now stored in the Cashlink. (That's how Cashlinks work, the account is inside. :)) So, the address can be used to identify the Cashlink.

When the resulting link is opened in a browser, the recipient can claim the NIM. Thus, Cashlinks are a great tool to on-board users that don't have a Nimiq address yet. See [Manage Cashlink](manage-cashlink) for a user interface to cancel and share a Cashlink.
