// Import @nimiq/core-web types from relative path within user's node_modules
/// <reference path="../../core-web/namespace.d.ts" />

export { default } from '../dist/src/HubApi';

// export public request types and RequestBehavior types for convenience of the HupApi user
export * from '../dist/src/PublicRequestTypes';
export { PopupRequestBehavior, RedirectRequestBehavior } from '../dist/src/RequestBehavior';
