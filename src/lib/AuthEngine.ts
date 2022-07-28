/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import {
    AuthTokenError,
    AuthTokenExpiredError,
    AuthTokenInvalidError,
    AuthTokenNotBeforeError,
    InvalidArgumentsError,
    InvalidOptionsError
} from "ziron-errors";
import {Algorithm, sign, SignOptions, TokenExpiredError, verify, VerifyOptions, NotBeforeError} from 'jsonwebtoken';
import crypto = require('crypto');

export interface AuthOptions {
    /**
     * @description
     * The secret key that is used to encrypt/decrypt auth tokens.
     * If you want to use RSA or ECDSA, you should provide a authPrivateKey and authPublicKey instead of a authKey.
     * @default 256 bits cryptographically random hex string.
     */
    secretKey?: string | null;
    /**
     * @description
     * The default expiry of tokens in seconds.
     * @default 86400
     */
    defaultExpiry?: number;
    /**
     * @description
     * The algorithm that will be used to sign and verify jwt tokens.
     * @default 'HS256'
     */
    algorithm?: Algorithm;
    /**
     * @description
     * The private secret key to signing the jwt tokens.
     * For using asymmetric encryption, you also need to define the
     * public key and change the algorithm to a proper one, e.g. RSA or ECDSA.
     * @default null
     */
    privateKey?: string | null;
    /**
     * @description
     * The public secret key to verify the jwt tokens.
     * For using asymmetric encryption, you also need to define the
     * private key and change the algorithm to a proper one, e.g. RSA or ECDSA.
     * @default null
     */
    publicKey?: string | null;
}

export default class AuthEngine {

    private readonly _options: Required<AuthOptions> = {
        secretKey: null,
        defaultExpiry: 86400,
        algorithm: 'HS256',
        publicKey: null,
        privateKey: null,
    };

    private _defaultSignOptions: SignOptions;
    private _defaultSignOptionsWithoutExp: SignOptions;
    private _defaultVerifyOptions: VerifyOptions;
    private _signatureKey: string;
    private _verificationKey:  string;

    constructor(options: AuthOptions = {}) {
        this.updateOptions(options);
    }

    get options(): Required<AuthOptions> {
        return {...this._options};
    }

    public updateOptions(options: AuthOptions = {}) {
        Object.assign(this._options,options);
        if (this._options.privateKey != null || this._options.publicKey != null) {
            if (this._options.privateKey == null) {
                throw new InvalidOptionsError('The authPrivateKey option must be specified if authPublicKey is specified');
            } else if (this._options.publicKey == null) {
                throw new InvalidOptionsError('The authPublicKey option must be specified if authPrivateKey is specified');
            }
            this._signatureKey = this._options.privateKey;
            this._verificationKey = this._options.publicKey;
        } else {
            if (this._options.secretKey == null) {
                this._options.secretKey = crypto.randomBytes(32).toString('hex');
            }
            this._signatureKey = this._options.secretKey;
            this._verificationKey = this._options.secretKey;
        }

        this._defaultSignOptionsWithoutExp = {
            ...(this._options.algorithm != null ? {algorithm: this._options.algorithm} : {}),
        }
        this._defaultSignOptions = {
            ...this._defaultSignOptionsWithoutExp,
            expiresIn: this._options.defaultExpiry,
        };

        this._defaultVerifyOptions = {
            ...(this._options.algorithm != null ? {algorithms: [this._options.algorithm]} : {})
        }
    }

    public async verifyToken(signedAuthToken: any, options: VerifyOptions = {}): Promise<any> {
        if (typeof signedAuthToken === 'string') {
            return new Promise((resolve, reject) => {
                verify(signedAuthToken, this._verificationKey,
                    Object.assign({}, this._defaultVerifyOptions ,options), (err, token) =>
                {
                    if(err) {
                        switch (err.name) {
                            case 'TokenExpiredError':
                                return reject(new AuthTokenExpiredError(err.message,
                                    (err as TokenExpiredError).expiredAt));
                            case 'JsonWebTokenError':
                                return reject(new AuthTokenInvalidError(err.message));
                            case 'NotBeforeError':
                                return reject(new AuthTokenNotBeforeError(err.message, (err as NotBeforeError).date));
                            default:
                                return reject(new AuthTokenError(err.message));
                        }
                    }
                    else resolve(token);
                });
            });
        }
        throw new InvalidArgumentsError('Invalid token format - Token must be a string');
    }

    public async signToken(token: any, options: SignOptions = {}): Promise<string> {
        return new Promise((resolve, reject) => {
            sign(token, this._signatureKey,
                Object.assign({},
                    (typeof token === 'object' && token.exp != null) ?
                        this._defaultSignOptionsWithoutExp : this._defaultSignOptions, options),
                (err, signedToken) => {
                err ? reject(err) : resolve(signedToken);
            });
        });
    }
}