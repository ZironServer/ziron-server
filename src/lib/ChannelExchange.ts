/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import EventEmitter from "emitix";
import Socket from "./Socket";
import {ComplexTypesOption} from "ziron-engine";
import {PublisherOption} from "./Options";

type PublishEmitter = EventEmitter<{[key: string]: [any,boolean,boolean]}>;

export default class ChannelExchange {

    public readonly subscriptions: ReadonlySet<string>;
    public subscribe: (channel: string) => void;
    public unsubscribe: (channel: string) => void;
    public publish: (channel: string, data: any, options: ComplexTypesOption & PublisherOption) => void;

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
        subscriptions: ReadonlySet<string>,
        subscribe: (channel: string) => void,
        unsubscribe: (channel: string) => void,
        publish: (channel: string, data: any, options: ComplexTypesOption & PublisherOption) => void;
    }) {
        this.subscriptions = connector.subscriptions;
        this.subscribe = connector.subscribe;
        this.unsubscribe = connector.unsubscribe;
        this.publish = connector.publish;
    }

}