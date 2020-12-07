/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import {
    AuthTokenError,
    AuthTokenExpiredError,
    AuthTokenInvalidError,
    AuthTokenNotBeforeError,
    InvalidArgumentsError,
    InvalidOptionsError
} from "zation-core-errors";
import {Algorithm, sign, SignOptions, TokenExpiredError, verify, VerifyOptions, NotBeforeError} from 'jsonwebtoken';
import crypto = require('crypto');

export interface AuthOptions {
    /**
     * The secret key which zation will use to encrypt/decrypt authTokens.
     * If you want to use RSA or ECDSA, you should provide a authPrivateKey and authPublicKey instead of authKey.
     * @default 256 bits cryptographically random hex string.
     */
    secretKey?: string | null;
    /**
     * The default expiry of tokens in seconds.
     * @default 86400
     */
    defaultExpiry?: number;
    /**
     * The algorithm that will be used to sign and verify jwt tokens.
     * @default 'HS256'
     */
    algorithm?: Algorithm;
    /**
     * The private secret key to signing the jwt tokens.
     * For using asymmetric encryption, you also need to define the
     * public key and change the algorithm to a proper one, e.g. RSA or ECDSA.
     * @default null
     */
    privateKey?: string | null;
    /**
     * The public secret key to verify the jwt tokens.
     * For using asymmetric encryption, you also need to define the
     * private key and change the algorithm to a proper one, e.g. RSA or ECDSA.
     * @default null
     */
    publicKey?: string | null;
}

export default class AuthEngine {

    public readonly options: Required<AuthOptions> = {
        secretKey: null,
        defaultExpiry: 86400,
        algorithm: 'HS256',
        publicKey: null,
        privateKey: null,
    };

    private readonly _defaultSignOptions: SignOptions;
    private readonly _defaultVerifyOptions: VerifyOptions;
    private readonly _signatureKey: string;
    private readonly _verificationKey:  string;

    constructor(options: AuthOptions = {}) {
        Object.assign(this.options,options);

        //process keys.
        if (this.options.privateKey != null || this.options.publicKey != null) {
            if (this.options.privateKey == null) {
                throw new InvalidOptionsError('The authPrivateKey option must be specified if authPublicKey is specified');
            } else if (this.options.publicKey == null) {
                throw new InvalidOptionsError('The authPublicKey option must be specified if authPrivateKey is specified');
            }
            this._signatureKey = this.options.privateKey;
            this._verificationKey = this.options.publicKey;
        } else {
            if (this.options.secretKey == null) {
                this.options.secretKey = crypto.randomBytes(32).toString('hex');
            }
            this._signatureKey = this.options.secretKey;
            this._verificationKey = this.options.secretKey;
        }

        this._defaultSignOptions = {
            expiresIn: this.options.defaultExpiry,
            ...(this.options.algorithm != null ? {algorithm: this.options.algorithm} : {})
        };

        this._defaultVerifyOptions = {
            ...(this.options.algorithm != null ? {algorithms: [this.options.algorithm]} : {})
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
                Object.assign({}, this._defaultSignOptions ,options), (err, signedToken) =>
            {
                err ? reject(err) : resolve(signedToken);
            });
        });
    }
}