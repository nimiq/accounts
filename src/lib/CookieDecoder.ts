// tslint:disable no-bitwise no-shadowed-variable

import { WalletInfoEntry, WalletType } from './WalletInfo';
import { Utf8Tools } from '@nimiq/utils';
import { AccountInfoEntry } from './AccountInfo';
import CookieJar from './CookieJar';

export class CookieDecoder {
    public static decode(str: string): WalletInfoEntry[] {
        if (!str) return [];

        // Convert base64 str into byte array
        const bytes: number[] = Array.from(this._base64Decode(str));

        // Cookie version
        const version = this.readByte(bytes);

        if (version !== CookieJar.VERSION) return this._legacyCookie(version, bytes);

        const wallets: WalletInfoEntry[] = [];
        while (bytes.length > 0) wallets.push(this._decodeWallet(bytes));

        return wallets;
    }

    // The following constants are taken from @nimiq/core source,
    // namely Nimiq.Address and Nimiq.BufferUtils.
    private static CCODE = 'NQ';
    private static BASE32_ALPHABET_NIMIQ = '0123456789ABCDEFGHJKLMNPQRSTUVXY';

    private static readByte(bytes: number[]): number {
        const byte = bytes.shift();
        if (typeof byte === 'undefined') throw new Error('Malformed Cookie');
        return byte;
    }

    private static readBytes(bytes: number[], length: number): number[] {
        const result: number[] = [];
        for (let i = 0; i < length; i++) {
            result.push(this.readByte(bytes));
        }
        return result;
    }

    private static _decodeWallet(bytes: number[]): WalletInfoEntry {
        // Wallet ID
        let id: string = '';
        for (let i = 0; i < 6; i++) id += this.readByte(bytes).toString(16);

        // Wallet type and label length
        const typeAndLabelLength = this.readByte(bytes);
        const type = typeAndLabelLength & 0b11;
        const labelLength = typeAndLabelLength >> 2; // Can only be < 64 because it's only 6 bit

        // Handle LEGACY wallet
        if (type === WalletType.LEGACY) {
            const walletLabel = 'Legacy Wallet';

            const accounts = this._decodeAccounts(bytes, labelLength);

            const walletInfoEntry: WalletInfoEntry = {
                id,
                type,
                label: walletLabel,
                accounts,
                contracts: [],
            };

            return walletInfoEntry;
        }

        // Handle regular wallet

        // Wallet label
        const walletLabelBytes = this.readBytes(bytes, labelLength);

        let walletLabel: string;
        if (walletLabelBytes.length === 0) {
            walletLabel = type === WalletType.BIP39
                ? 'Keyguard Wallet'
                : 'Ledger Wallet';
        } else walletLabel = Utf8Tools.utf8ByteArrayToString(new Uint8Array(walletLabelBytes));

        const accounts = this._decodeAccounts(bytes);

        const walletInfoEntry: WalletInfoEntry = {
            id,
            type,
            label: walletLabel,
            accounts,
            contracts: [],
        };

        return walletInfoEntry;
    }

    private static _decodeAccounts(bytes: number[], labelLength?: number): Map<string, AccountInfoEntry> {
        let numberAccounts = 1;
        if (typeof labelLength === 'undefined') numberAccounts = this.readByte(bytes);

        const accounts: AccountInfoEntry[] = [];
        for (let i = 0; i < numberAccounts; i++) {
            accounts.push(this._decodeAccount(bytes, labelLength));
        }

        const accountsMapArray: Array<[string, AccountInfoEntry]> = accounts.map((account) => {
            // Deserialize Nimiq.Address
            const userFriendlyAddress = this._toUserFriendlyAddress(account.address);

            return [userFriendlyAddress, account] as [string, AccountInfoEntry];
        });

        return new Map(accountsMapArray);
    }

    private static _decodeAccount(bytes: number[], labelLength?: number): AccountInfoEntry {
        if (typeof labelLength === 'undefined') labelLength = this.readByte(bytes);

        if (labelLength > CookieJar.MAX_LABEL_LENGTH) throw new Error('Malformed Cookie, label too long');

        // Account label
        const labelBytes = this.readBytes(bytes, labelLength);

        let accountLabel: string;
        if (labelBytes.length === 0) accountLabel = 'Standard Account';
        else accountLabel = Utf8Tools.utf8ByteArrayToString(new Uint8Array(labelBytes));

        // Account address
        const addressBytes = this.readBytes(bytes, 20 /* Nimiq.Address.SERIALIZED_SIZE */);

        const accountInfoEntry: AccountInfoEntry = {
            path: 'not public',
            label: accountLabel,
            address: new Uint8Array(addressBytes),
        };

        return accountInfoEntry;
    }

    private static _legacyCookie(version: number, bytes: number[]) {
        switch (version) {
            default: return [];
        }
    }

    private static _base64Decode(base64: string): Uint8Array {
        /*
        Source: https://github.com/danguer/blog-examples/blob/master/js/base64-binary.js

        Copyright (c) 2011, Daniel Guerrero
        All rights reserved.

        Redistribution and use in source and binary forms, with or without
        modification, are permitted provided that the following conditions are met:
            * Redistributions of source code must retain the above copyright
            notice, this list of conditions and the following disclaimer.
            * Redistributions in binary form must reproduce the above copyright
            notice, this list of conditions and the following disclaimer in the
            documentation and/or other materials provided with the distribution.

        THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
        ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
        WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
        DISCLAIMED. IN NO EVENT SHALL DANIEL GUERRERO BE LIABLE FOR ANY
        DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
        (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
        LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
        ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
        (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
        SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
        */

        // Use a lookup table to find the index.
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        const lookup = new Uint8Array(256);
        for (let i = 0; i < chars.length; i++) {
            lookup[chars.charCodeAt(i)] = i;
        }

        // Decode
        let bufferLength = base64.length * 0.75;
        let p = 0;
        let encoded1: number;
        let encoded2: number;
        let encoded3: number;
        let encoded4: number;

        if (base64[base64.length - 1] === '=') {
            bufferLength--;
            if (base64[base64.length - 2] === '=') {
                bufferLength--;
            }
        }

        const bytes = new Uint8Array(bufferLength);

        for (let i = 0; i < base64.length; i += 4) {
            encoded1 = lookup[base64.charCodeAt(i)];
            encoded2 = lookup[base64.charCodeAt(i + 1)];
            encoded3 = lookup[base64.charCodeAt(i + 2)];
            encoded4 = lookup[base64.charCodeAt(i + 3)];

            bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
            bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
            bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
        }

        return bytes;
    }

    // The following methods are taken from @nimiq/core source,
    // namely Nimiq.Address and Nimiq.BufferUtils.

    private static _toUserFriendlyAddress(serializedAddress: Uint8Array, withSpaces = true): string {
        const base32 = this._toBase32(serializedAddress);
        // tslint:disable-next-line prefer-template
        const check = ('00' + (98 - this._ibanCheck(base32 + this.CCODE + '00'))).slice(-2);
        let res = this.CCODE + check + base32;
        if (withSpaces) res = res.replace(/.{4}/g, '$& ').trim();
        return res;
    }

    private static _ibanCheck(str: string): number {
        const num = str.split('').map((c) => {
            const code = c.toUpperCase().charCodeAt(0);
            return code >= 48 && code <= 57 ? c : (code - 55).toString();
        }).join('');
        let tmp = '';

        for (let i = 0; i < Math.ceil(num.length / 6); i++) {
            tmp = (parseInt(tmp + num.substr(i * 6, 6), 10) % 97).toString();
        }

        return parseInt(tmp, 10);
    }

    private static _toBase32(buf: Uint8Array, alphabet = CookieDecoder.BASE32_ALPHABET_NIMIQ): string {
        let shift = 3;
        let carry = 0;
        let symbol: number;
        let res = '';

        for (const byte of buf) {
            symbol = carry | (byte >> shift);
            res += alphabet[symbol & 0x1f];

            if (shift > 5) {
                shift -= 5;
                symbol = byte >> shift;
                res += alphabet[symbol & 0x1f];
            }

            shift = 5 - shift;
            carry = byte << shift;
            shift = 8 - shift;
        }

        if (shift !== 3) {
            res += alphabet[carry & 0x1f];
        }

        while (res.length % 8 !== 0 && alphabet.length === 33) {
            res += alphabet[32];
        }

        return res;
    }
}
