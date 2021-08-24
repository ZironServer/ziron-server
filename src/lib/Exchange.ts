/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import EventEmitter from "emitix";
import Socket from "./Socket";

type PublishEmitter = EventEmitter<{[key: string]: [any,boolean,boolean]}>;

export default class Exchange {

    public readonly subscriptions: ReadonlyArray<string>;
    public subscribe: (channel: string) => void;
    public unsubscribe: (channel: string) => void;
    public publish: (channel: string, data: any, processComplexTypes?: boolean, publisher?: Socket) => void;

    private readonly _publishEmitter: PublishEmitter = new EventEmitter();
    public readonly oncePublish: PublishEmitter['once'] = this._publishEmitter.once.bind(this._publishEmitter);
    public readonly onPublish: PublishEmitter['on'] = this._publishEmitter.on.bind(this._publishEmitter);
    public readonly offPublish: PublishEmitter['off'] = this._publishEmitter.off.bind(this._publishEmitter);
    /**
     * @private
     * @internal
     */
    public readonly _emitPublish: PublishEmitter['emit'] = this._publishEmitter.emit.bind(this._publishEmitter);

    constructor(connector: {
        subscriptions: string[],
        subscribe: (channel: string) => void,
        unsubscribe: (channel: string) => void,
        publish: (channel: string, data: any, processComplexTypes?: boolean, publisher?: Socket) => void;
    }) {
        this.subscriptions = connector.subscriptions;
        this.subscribe = connector.subscribe;
        this.unsubscribe = connector.unsubscribe;
        this.publish = connector.publish;
    }

}