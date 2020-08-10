import { setup } from './_setup';
import { Store } from '@/lib/Store';
import { CashlinkStore } from '@/lib/CashlinkStore';
import Cashlink from '@/lib/Cashlink';
import { CashlinkState } from '../../client/PublicRequestTypes';

setup();

const indexedDB: IDBFactory = require('fake-indexeddb'); // tslint:disable-line:no-var-requires

// @ts-ignore private property access
Store.INDEXEDDB_IMPLEMENTATION = indexedDB;

const DUMMY_DATA = {
    addresses: [
        'NQ73 822X Q55C EQ9N BV36 DD59 TMED X511 TQAY',
        'NQ94 DA1Q SVB4 61YN XEY6 2TVT F22G 0381 L284',
    ],
    cashlinks: [
        new Cashlink(
            Nimiq.KeyPair.derive(new Nimiq.PrivateKey(new Uint8Array([
                70, 207, 252, 77, 192, 84, 237, 202, 3, 46, 88, 64, 101, 200, 131, 19, 212,
                105, 128, 49, 54, 99, 159, 166, 103, 196, 208, 178, 26, 244, 184, 234,
            ]))),
            Nimiq.KeyPair.derive(new Nimiq.PrivateKey(new Uint8Array([
                70, 207, 252, 77, 192, 84, 237, 202, 3, 46, 88, 64, 101, 200, 131, 19, 212,
                105, 128, 49, 54, 99, 159, 166, 103, 196, 208, 178, 26, 244, 184, 234,
            ]))).publicKey.toAddress(),
            1234554321,
            123,
            'Ein Cashlink test Cashlink',
            CashlinkState.UNCLAIMED,
        ),
        new Cashlink(
            Nimiq.KeyPair.derive(new Nimiq.PrivateKey(new Uint8Array([
                154, 176, 138, 78, 42, 184, 216, 152, 203, 236, 166, 111, 246, 63, 50, 14,
                175, 84, 7, 65, 181, 2, 217, 44, 104, 255, 138, 63, 20, 196, 193, 125,
            ]))),
            Nimiq.KeyPair.derive(new Nimiq.PrivateKey(new Uint8Array([
                154, 176, 138, 78, 42, 184, 216, 152, 203, 236, 166, 111, 246, 63, 50, 14,
                175, 84, 7, 65, 181, 2, 217, 44, 104, 255, 138, 63, 20, 196, 193, 125,
            ]))).publicKey.toAddress(),
            5000000,
            undefined,
            'Ein Cashlink test Cashlink',
            CashlinkState.CLAIMED,
            Cashlink.DEFAULT_THEME,
            Date.now(),
            'Contact name',
        ),
    ].map((cashlink) => {
        // Anonymous functions cannot be compared by Jest, so we need to work around that
        // (https://stackoverflow.com/a/48204295/4204380)
        // @ts-ignore ignore private property access
        cashlink._getNetwork = expect.any(Function);
        // @ts-ignore ignore private property access
        cashlink._networkClientResolver = expect.any(Function);
        return cashlink;
    }),
};

const beforeEachCallback = async () => {
    await Promise.all(DUMMY_DATA.cashlinks.map((cashlink) => CashlinkStore.Instance.put(cashlink)));
    await CashlinkStore.Instance.close();
};

const afterEachCallback = async () => {
    await CashlinkStore.Instance.close();
    await new Promise((resolve, reject) => {
        // @ts-ignore access to private property
        const request = indexedDB.deleteDatabase(CashlinkStore.Instance.DB_NAME);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(true);
        request.onblocked = () => {
            // Wait for open connections to get closed
            setTimeout(() => reject(new Error('Can\'t delete database, there is still an open connection.')), 1000);
        };
    });
};

function expectEqualIgnoringFeeAndContactName(a: any, b: any) {
    const filterIgnoredKeys = (key: string) => key !== 'fee' && key !== '_fee' && key !== 'contactName';
    const keysA = Object.keys(a).filter(filterIgnoredKeys);
    const keysB = Object.keys(b).filter(filterIgnoredKeys);
    expect(keysA).toEqual(keysB);
    for (const key of keysA) {
        expect(a[key]).toEqual(b[key]);
    }
}

describe('CashlinkStore', () => {
    beforeEach(beforeEachCallback);
    afterEach(afterEachCallback);

    it('is a singleton', () => {
        const instance1 = CashlinkStore.Instance;
        const instance2 = CashlinkStore.Instance;
        expect(instance1).toBe(instance2);
    });

    it('can get a cashlink', async () => {
        const cl = await CashlinkStore.Instance.get(DUMMY_DATA.addresses[0]);
        expectEqualIgnoringFeeAndContactName(cl, DUMMY_DATA.cashlinks[0]);
    });

    it('can list cashlinks', async () => {
        const cashlinkEntries = await CashlinkStore.Instance.list();
        expect(cashlinkEntries).toEqual(DUMMY_DATA.cashlinks.map((cashlink) =>
            cashlink.toObject(/*includeOptional*/ false),
        ));
    });

    it('can remove cashlinks', async () => {
        let currentCashlinks = await CashlinkStore.Instance.list();
        expect(currentCashlinks.length).toBe(2);

        await CashlinkStore.Instance.remove(DUMMY_DATA.addresses[0]);
        currentCashlinks = await CashlinkStore.Instance.list();
        expect(currentCashlinks.length).toBe(1);
        expect(currentCashlinks[0].address).toBe(DUMMY_DATA.addresses[1]);

        // Check that we can't get a removed cashlink by ID
        const removedCashlink = await CashlinkStore.Instance.get(DUMMY_DATA.addresses[0]);
        expect(removedCashlink).toBeUndefined();
    });

    it('can add and update cashlinks', async () => {
        // First clear database
        await afterEachCallback();

        let currentCashlinks = await CashlinkStore.Instance.list();
        expect(currentCashlinks.length).toBe(0);

        // Add cashlinks
        await CashlinkStore.Instance.put(DUMMY_DATA.cashlinks[0]);
        currentCashlinks = await CashlinkStore.Instance.list();
        expect(currentCashlinks.length).toBe(1);

        // Check that the cashlink has been stored correctly
        let cashlink = await CashlinkStore.Instance.get(DUMMY_DATA.addresses[0]);
        expectEqualIgnoringFeeAndContactName(cashlink, DUMMY_DATA.cashlinks[0]);

        cashlink!.state = CashlinkState.CLAIMED;

        // Update the cashlink
        await CashlinkStore.Instance.put(cashlink!);

        // Check that the cashlink has been updated correctly
        cashlink = await CashlinkStore.Instance.get(DUMMY_DATA.addresses[0]);
        expect(cashlink).toBeDefined();
        expect(cashlink!.state).toBe(CashlinkState.CLAIMED);
    });
});
