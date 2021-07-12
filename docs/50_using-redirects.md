---
title: Using Redirects
layout: default
nav_order: 50
permalink: /using-redirects
---

# Using Redirects
{: .no_toc }

## Table of Contents
{: .no_toc .text-delta }

1. TOC
{:toc}

## Configuring Top-Level Redirects

If you prefer top-level redirects instead of pop-ups, you can pass an
instance of `RedirectRequestBehavior` as a second parameter to either the
HubApi initialization or to any API method:

```javascript
const redirectBehavior = new HubApi.RedirectRequestBehavior();

// Pass the behavior as a second parameter to the HubApi
const hubApi = new HubApi(<url>, redirectBehavior);

// Or pass it as a second parameter to any API method
const result = hubApi.checkout(<requestOptions>, redirectBehavior);
```

> **Note:** To use redirects instead of pop-ups, your app must run under HTTPS!

> **Note:** The way to configure top-level redirects will likely change in an upcoming
> version of the Hub API!

The `RedirectRequestBehavior` accepts two optional parameters:

The first is the return URL. If no return URL is specified, the current URL
without parameters will be used.

```javascript
const redirectBehavior = new RedirectRequestBehavior('https://url.to/return?to');
```

The second optional parameter is a plain object you can use to store data until
the request returns:

```javascript
const storedData = { foo: 'I am the state' };
const redirectBehavior = new RedirectRequestBehavior(null, storedData);
```

## Listening for Redirect Responses

If you configured the HubApi to use top-level redirects instead of pop-ups, you need to
follow the four steps below to specifically listen for the redirects from the Hub back
to your site, using the `on()` method.

Your handler functions will be called with two parameters: (1) the result object and
(2) the stored data object as it was passed to the `RedirectRequestBehavior` during
initialization.

```javascript
// 1. Initialize an Hub client instance
const hubApi = new HubApi(/* ... */);

// 2. Define your handler functions
const onSuccess = function(result, storedData) {
    console.log("Got result from Hub:", result);
    console.log("Retrieved stored data:", storedData);
}

const onError = function(error, storedData) {
    console.log("Got error from Hub:", error);
    console.log("Retrieved stored data:", storedData);
}

// 3. Listen for the redirect responses you expect
hubApi.on(HubApi.RequestType.CHECKOUT, onSuccess, onError);
hubApi.on(HubApi.RequestType.SIGN_TRANSACTION, onSuccess, onError);
hubApi.on(HubApi.RequestType.CHOOSE_ADDRESS, onSuccess, onError);

// 4. After setup is complete, check for a redirect response
hubApi.checkRedirectResponse();
```

<!-- QUESTION/IDEA The RPC ID should be explained.
     Can the dev retrieve the ID before triggering the API method so that later
     on request and result can be aligned?
     If not, what's the potential use of the ID?
     I suggestion to remove it, or at least make the ID third and thus optional.
     -->
The available `RequestType`s, corresponding to the API methods, are:

```javascript
enum HubApi.RequestType {
    CHECKOUT = 'checkout',
    CHOOSE_ADDRESS = 'choose-address',
    SIGN_TRANSACTION = 'sign-transaction',
    SIGN_MESSAGE = 'sign-message',
}
```
