/**
 * The UID is used for the purpose of tracking Fastspot swap limits per user. It is generated from
 * two deterministic values. The keyId of an account and its first NIM address, wich are always the same.
 *
 * The `keyId` is never passed to outside the Hub, so can be seen as a secret value. This way
 * it is impossible for anyone who gets access to the UID alone to determine the user's address.
 */
export async function makeUid(keyId: string, firstAddress: string): Promise<string> {
    return toHex(await sha256(fromAscii(`Nimiq UID: ${keyId} ${firstAddress}`)));
}

/**
 * This method uses only browser-native APIs to avoid loading the Nimiq or Bitcoin library, as this
 * method is also used in the iframe.
 */
async function sha256(buffer: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await window.crypto.subtle.digest('SHA-256', buffer));
}

/**
 * Conversion functions taken from Nimiq.BufferUtils.
 */

function fromAscii(ascii: string): Uint8Array {
    const buf = new Uint8Array(ascii.length);
    for (let i = 0; i < ascii.length; ++i) { // tslint:disable-line:prefer-for-of
        buf[i] = ascii.charCodeAt(i);
    }
    return buf;
}

function toHex(buffer: Uint8Array) {
    const HEX_ALPHABET = '0123456789abcdef';
    let hex = '';
    for (let i = 0; i < buffer.length; i++) { // tslint:disable-line:prefer-for-of
        const code = buffer[i];
        hex += HEX_ALPHABET[code >>> 4]; // tslint:disable-line:no-bitwise
        hex += HEX_ALPHABET[code & 0x0F]; // tslint:disable-line:no-bitwise
    }
    return hex;
}
