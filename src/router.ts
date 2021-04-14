import Vue from 'vue';
import Router from 'vue-router';
import { RequestType } from '@/lib/PublicRequestTypes';
import { KeyguardCommand } from '@nimiq/keyguard-client';

const SignTransaction         = () => import(/*webpackChunkName: "sign-transaction"*/ './views/SignTransaction.vue');
const SignTransactionSuccess  = () => import(/*webpackChunkName: "sign-transaction"*/
    './views/SignTransactionSuccess.vue');

const SignTransactionLedger   = () => import(/*webpackChunkName: "sign-transaction-ledger"*/
    './views/SignTransactionLedger.vue');

const CashlinkCreate          = () => import(/*webpackChunkName: "cashlink" */ './views/CashlinkCreate.vue');
const CashlinkManage          = () => import(/*webpackChunkName: "cashlink" */ './views/CashlinkManage.vue');

const Checkout                = () => import(/*webpackChunkName: "checkout"*/ './views/Checkout.vue');
const CheckoutTransmission    = () => import(/*webpackChunkName: "checkout"*/ './views/CheckoutTransmission.vue');

const ChooseAddress           = () => import(/*webpackChunkName: "choose-address"*/ './views/ChooseAddress.vue');

const Signup                  = () => import(/*webpackChunkName: "onboarding"*/ './views/Signup.vue');
const SignupSuccess           = () => import(/*webpackChunkName: "onboarding"*/ './views/SignupSuccess.vue');

const SignupLedger            = () => import(/*webpackChunkName: "add-ledger"*/ './views/SignupLedger.vue');

const Login                   = () => import(/*webpackChunkName: "onboarding"*/ './views/Login.vue');
const LoginSuccess            = () => import(/*webpackChunkName: "onboarding"*/ './views/LoginSuccess.vue');

const Export                  = () => import(/*webpackChunkName: "export"*/ './views/Export.vue');
const ExportSuccess           = () => import(/*webpackChunkName: "export"*/ './views/ExportSuccess.vue');

const ChangePassword          = () => import(/*webpackChunkName: "change-password"*/ './views/ChangePassword.vue');

const Logout                  = () => import(/*webpackChunkName: "logout"*/ './views/Logout.vue');
const LogoutSuccess           = () => import(/*webpackChunkName: "logout"*/ './views/LogoutSuccess.vue');

const LogoutLedger            = () => import(/*webpackChunkName: "logout-ledger"*/ './views/LogoutLedger.vue');

const AddAccount              = () => import(/*webpackChunkName: "add-account"*/ './views/AddAccount.vue');
const AddAccountSelection     = () => import(/*webpackChunkName: "add-account"*/ './views/AddAccountSelection.vue');

const AddAddressLedger        = () => import(/*webpackChunkName: "add-ledger"*/ './views/AddAddressLedger.vue');

const OnboardingSelector      = () => import(/*webpackChunkName: "onboarding"*/ './views/OnboardingSelector.vue');

const Rename                  = () => import(/*webpackChunkName: "rename"*/ './views/Rename.vue');
const AddVestingContract      = () => import(/*webpackChunkName: "add-vesting-contract"*/
    './views/AddVestingContract.vue');

const Migrate                 = () => import(/*webpackChunkName: "migrate"*/ './views/Migrate.vue');

const SignMessage             = () => import(/*webpackChunkName: "sign-message"*/ './views/SignMessage.vue');
const SignMessageSuccess      = () => import(/*webpackChunkName: "sign-message"*/ './views/SignMessageSuccess.vue');

const SimpleSuccess           = () => import(/*webpackChunkName: "common"*/ './views/SimpleSuccess.vue');
const ErrorHandler            = () => import(/*webpackChunkName: "common"*/ './views/ErrorHandler.vue');

const RequestError            = () => import(/*webpackChunkName: "request-error"*/ './views/RequestError.vue');

const ErrorHandlerUnsupportedLedger = () => import(/*webpackChunkName: "unsupported-ledger"*/
    './views/ErrorHandlerUnsupportedLedger.vue');

const SignBtcTransaction        = () => import(/*webpackChunkName: "sign-btc-transaction"*/
    './views/SignBtcTransaction.vue');
const SignBtcTransactionSuccess = () => import(/*webpackChunkName: "sign-btc-transaction"*/
'./views/SignBtcTransactionSuccess.vue');

const SignBtcTransactionLedger  = () => import(/*webpackChunkName: "sign-btc-transaction-ledger"*/
    './views/SignBtcTransactionLedger.vue');

const ActivateBitcoin         = () => import(/*webpackChunkName: "activate-btc"*/ './views/ActivateBitcoin.vue');
const ActivateBitcoinSuccess  = () => import(/*webpackChunkName: "activate-btc"*/ './views/ActivateBitcoinSuccess.vue');

const ActivateBitcoinLedger = () => import(/*webpackChunkName: "activate-btc-ledger"*/
    './views/ActivateBitcoinLedger.vue');

const SetupSwap               = () => import(/*webpackChunkName: "swap"*/ './views/SetupSwap.vue');
const SetupSwapSuccess        = () => import(/*webpackChunkName: "swap"*/ './views/SetupSwapSuccess.vue');
const RefundSwap              = () => import(/*webpackChunkName: "swap"*/ './views/RefundSwap.vue');
const RefundSwapSuccess       = () => import(/*webpackChunkName: "swap"*/ './views/RefundSwapSuccess.vue');

const SetupSwapLedger         = () => import(/*webpackChunkName: "swap-ledger"*/ './views/SetupSwapLedger.vue');

const RefundSwapLedger        = () => import(/*webpackChunkName: "refund-swap-ledger"*/ './views/RefundSwapLedger.vue');

Vue.use(Router);

export function keyguardResponseRouter(
    command: KeyguardCommand,
    originalRequestType: RequestType,
): { resolve: string, reject: string } {
    let resolve = '';
    switch (command) {
        case KeyguardCommand.CREATE:
            resolve = `${RequestType.SIGNUP}-success`; break;
        case KeyguardCommand.IMPORT:
            resolve = `${RequestType.LOGIN}-success`; break;
        case KeyguardCommand.REMOVE:
            resolve = `${RequestType.LOGOUT}-success`; break;
        case KeyguardCommand.SIGN_TRANSACTION:
            // The SIGN_TRANSACTION Keyguard command is used by Hub's SIGN_TRANSACTION, CHECKOUT,
            // CASHLINK and REFUND_SWAP. Thus we return the user to the respective handler component
            resolve = originalRequestType === RequestType.CREATE_CASHLINK
                ? RequestType.MANAGE_CASHLINK
                : `${originalRequestType}-success`;
            break;
        case KeyguardCommand.EXPORT:
            resolve = `${RequestType.EXPORT}-success`; break;
        case KeyguardCommand.CHANGE_PASSWORD:
            resolve = `${RequestType.CHANGE_PASSWORD}-success`; break;
        case KeyguardCommand.DERIVE_ADDRESS:
            resolve = `${RequestType.ADD_ADDRESS}-selection`; break;
        case KeyguardCommand.SIGN_MESSAGE:
            // The SIGN_MESSAGE Keyguard command is used by Hub's SIGN_MESSAGE and
            // NIMIQ_ID (future). Thus we return the user to the respective handler component
            resolve = `${originalRequestType}-success`; break;
        case KeyguardCommand.SIGN_BTC_TRANSACTION:
            // The SIGN_BTC_TRANSACTION Keyguard command is used by Hub's SIGN_BTC_TRANSACTION, CHECKOUT
            // and REFUND_SWAP. Thus we return the user to the respective handler component
            resolve = `${originalRequestType}-success`; break;
        case KeyguardCommand.DERIVE_BTC_XPUB:
            resolve = `${RequestType.ACTIVATE_BITCOIN}-success`; break;
        case KeyguardCommand.SIGN_SWAP:
            resolve = `${RequestType.SETUP_SWAP}-success`; break;
        default:
            throw new Error(`router.keyguardResponseRouter not defined for Keyguard command: ${command}`);
    }

    return {
        resolve,
        reject: 'error',
    };
}

// Static routes names
export const REQUEST_ERROR = 'request-error';
export const ERROR = 'error';

export default new Router({
    mode: 'history',
    base: process.env.BASE_URL,
    routes: [
        {
            path: `/${ERROR}`,
            component: ErrorHandler,
            name: ERROR,
        },
        {
            path: `/${REQUEST_ERROR}`,
            component: RequestError,
            name: REQUEST_ERROR,
        },
        {
            path: `/${RequestType.SIGN_TRANSACTION}`,
            component: SignTransaction,
            name: RequestType.SIGN_TRANSACTION,
        },
        {
            path: `/${RequestType.SIGN_TRANSACTION}/success`,
            component: SignTransactionSuccess,
            name: `${RequestType.SIGN_TRANSACTION}-success`,
        },
        {
            path: `/${RequestType.SIGN_TRANSACTION}/ledger`,
            component: SignTransactionLedger,
            name: `${RequestType.SIGN_TRANSACTION}-ledger`,
        },
        {
            path: `/cashlink/create`,
            component: CashlinkCreate,
            name: RequestType.CREATE_CASHLINK,
        },
        {
            path: `/cashlink/manage`,
            component: CashlinkManage,
            name: RequestType.MANAGE_CASHLINK,
        },
        {
            path: `/${RequestType.CHECKOUT}`,
            component: Checkout,
            name: RequestType.CHECKOUT,
        },
        {
            path: `/${RequestType.CHECKOUT}/success`,
            component: CheckoutTransmission,
            name: `${RequestType.CHECKOUT}-success`,
        },
        {
            path: `/${RequestType.ONBOARD}`,
            component: OnboardingSelector,
            name: RequestType.ONBOARD,
        },
        {
            path: `/${RequestType.SIGNUP}`,
            component: Signup,
            name: RequestType.SIGNUP,
        },
        {
            path: `/${RequestType.SIGNUP}/success`,
            component: SignupSuccess,
            name: `${RequestType.SIGNUP}-success`,
        },
        {
            path: `/${RequestType.SIGNUP}/ledger`,
            component: SignupLedger,
            name: `${RequestType.SIGNUP}-ledger`,
        },
        {
            path: `/${RequestType.LOGIN}`,
            component: Login,
            name: RequestType.LOGIN,
        },
        {
            path: `/${RequestType.LOGIN}/success`,
            component: LoginSuccess,
            name: `${RequestType.LOGIN}-success`,
        },
        {
            path: `/${RequestType.EXPORT}`,
            component: Export,
            name: RequestType.EXPORT,
        },
        {
            path: `/${RequestType.EXPORT}/success`,
            component: ExportSuccess,
            name: `${RequestType.EXPORT}-success`,
        },
        {
            path: `/${RequestType.EXPORT}/ledger`,
            component: ErrorHandlerUnsupportedLedger,
            name: `${RequestType.EXPORT}-ledger`,
        },
        {
            path: `/${RequestType.CHANGE_PASSWORD}`,
            component: ChangePassword,
            name: RequestType.CHANGE_PASSWORD,
        },
        {
            path: `/${RequestType.CHANGE_PASSWORD}/success`,
            component: SimpleSuccess,
            name: `${RequestType.CHANGE_PASSWORD}-success`,
        },
        {
            path: `/${RequestType.CHANGE_PASSWORD}/ledger`,
            component: ErrorHandlerUnsupportedLedger,
            name: `${RequestType.CHANGE_PASSWORD}-ledger`,
        },
        {
            path: `/${RequestType.LOGOUT}`,
            component: Logout,
            name: RequestType.LOGOUT,
        },
        {
            path: `/${RequestType.LOGOUT}/success`,
            component: LogoutSuccess,
            name: `${RequestType.LOGOUT}-success`,
        },
        {
            path: `/${RequestType.LOGOUT}/ledger`,
            component: LogoutLedger,
            name: `${RequestType.LOGOUT}-ledger`,
        },
        {
            path: `/${RequestType.ADD_ADDRESS}`,
            component: AddAccount,
            name: RequestType.ADD_ADDRESS,
        },
        {
            path: `/${RequestType.ADD_ADDRESS}/selection`,
            component: AddAccountSelection,
            name: `${RequestType.ADD_ADDRESS}-selection`,
        },
        {
            path: `/${RequestType.ADD_ADDRESS}/ledger`,
            component: AddAddressLedger,
            name: `${RequestType.ADD_ADDRESS}-ledger`,
        },
        {
            path: `/${RequestType.RENAME}`,
            component: Rename,
            name: RequestType.RENAME,
        },
        {
            path: `/${RequestType.ADD_VESTING_CONTRACT}`,
            component: AddVestingContract,
            name: RequestType.ADD_VESTING_CONTRACT,
        },
        {
            path: `/${RequestType.MIGRATE}`,
            component: Migrate,
            name: RequestType.MIGRATE,
        },
        {
            path: `/${RequestType.CHOOSE_ADDRESS}`,
            component: ChooseAddress,
            name: RequestType.CHOOSE_ADDRESS,
        },
        {
            path: `/${RequestType.SIGN_MESSAGE}`,
            component: SignMessage,
            name: RequestType.SIGN_MESSAGE,
        },
        {
            path: `/${RequestType.SIGN_MESSAGE}/success`,
            component: SignMessageSuccess,
            name: `${RequestType.SIGN_MESSAGE}-success`,
        },
        {
            path: `/${RequestType.SIGN_MESSAGE}/ledger`,
            component: ErrorHandlerUnsupportedLedger,
            // not specifying a name here to not trigger automatic routing to this view in RpcApi.ts
        },
        {
            path: `/${RequestType.SIGN_BTC_TRANSACTION}`,
            component: SignBtcTransaction,
            name: RequestType.SIGN_BTC_TRANSACTION,
        },
        {
            path: `/${RequestType.SIGN_BTC_TRANSACTION}/success`,
            component: SignBtcTransactionSuccess,
            name: `${RequestType.SIGN_BTC_TRANSACTION}-success`,
        },
        {
            path: `/${RequestType.SIGN_BTC_TRANSACTION}/ledger`,
            component: SignBtcTransactionLedger,
            name: `${RequestType.SIGN_BTC_TRANSACTION}-ledger`,
        },
        {
            path: `/${RequestType.ACTIVATE_BITCOIN}`,
            component: ActivateBitcoin,
            name: RequestType.ACTIVATE_BITCOIN,
        },
        {
            path: `/${RequestType.ACTIVATE_BITCOIN}/success`,
            component: ActivateBitcoinSuccess,
            name: `${RequestType.ACTIVATE_BITCOIN}-success`,
        },
        {
            path: `/${RequestType.ACTIVATE_BITCOIN}/ledger`,
            component: ActivateBitcoinLedger,
            name: `${RequestType.ACTIVATE_BITCOIN}-ledger`,
        },
        {
            path: `/${RequestType.SETUP_SWAP}`,
            component: SetupSwap,
            name: RequestType.SETUP_SWAP,
        },
        {
            path: `/${RequestType.SETUP_SWAP}/success`,
            component: SetupSwapSuccess,
            name: `${RequestType.SETUP_SWAP}-success`,
        },
        {
            path: `/${RequestType.SETUP_SWAP}/ledger`,
            component: SetupSwapLedger,
            name: `${RequestType.SETUP_SWAP}-ledger`,
        },
        {
            path: `/${RequestType.REFUND_SWAP}`,
            component: RefundSwap,
            name: RequestType.REFUND_SWAP,
        },
        {
            path: `/${RequestType.REFUND_SWAP}/success`,
            component: RefundSwapSuccess,
            name: `${RequestType.REFUND_SWAP}-success`,
        },
        {
            path: `/${RequestType.REFUND_SWAP}/ledger`,
            component: RefundSwapLedger,
            name: `${RequestType.REFUND_SWAP}-ledger`,
        },
    ],
});
