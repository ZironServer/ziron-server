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
type SubscriptionEmitter = EventEmitter<{[key: string]: [boolean]}>;
type PublishLossEmitter = EventEmitter<{loss: [string]}>;

export default class ChannelExchange {

    public readonly subscriptions: ReadonlySet<string>;
    public subscribe: (channel: string) => void;
    public unsubscribe: (channel: string) => void;
    /**
     * Publishes data in a channel to the subscribers of this server and the other servers.
     * Data that is a JSONString (prepared JSON, without complex types) goes out without converting it again;
     * the listeners of this server get it as it is, the others the value.
     */
    public publish: (channel: string, data: any, options?: ComplexTypesOption & PublisherOption) => void;

    private readonly _publishEmitter: PublishEmitter = new EventEmitter();
    public readonly oncePublish: PublishEmitter['once'] = this._publishEmitter.once.bind(this._publishEmitter);
    public readonly onPublish: PublishEmitter['on'] = this._publishEmitter.on.bind(this._publishEmitter);
    public readonly offPublish: PublishEmitter['off'] = this._publishEmitter.off.bind(this._publishEmitter);
    /**
     * @private
     * @internal
     */
    public readonly _emitPublish: PublishEmitter['emit'] = this._publishEmitter.emit.bind(this._publishEmitter);

    /**
     * @description
     * Whether the publishes of other servers in the channel reach this server now.
     * Always true without a broker.
     */
    public isSubscriptionActive: (channel: string) => boolean;

    private readonly _subscriptionEmitter: SubscriptionEmitter = new EventEmitter();
    /**
     * @description
     * The subscription of the channel at the broker became active (true) or was cut (false).
     * Publishes of other servers between the two can be missed.
     */
    public readonly onSubscriptionChange: SubscriptionEmitter['on'] = this._subscriptionEmitter.on.bind(this._subscriptionEmitter);
    public readonly offSubscriptionChange: SubscriptionEmitter['off'] = this._subscriptionEmitter.off.bind(this._subscriptionEmitter);
    /**
     * @private
     * @internal
     */
    public readonly _emitSubscriptionChange: SubscriptionEmitter['emit'] = this._subscriptionEmitter.emit.bind(this._subscriptionEmitter);

    private readonly _publishLossEmitter: PublishLossEmitter = new EventEmitter();
    /**
     * @description
     * A publish of this server in the channel may not have reached the broker
     * (the connection broke before the broker confirmed it, or no broker was there).
     */
    public onPublishLoss(listener: (channel: string) => void) {this._publishLossEmitter.on('loss',listener);}
    public offPublishLoss(listener: (channel: string) => void) {this._publishLossEmitter.off('loss',listener);}
    /**
     * @private
     * @internal
     */
    public _emitPublishLoss(channel: string) {this._publishLossEmitter.emit('loss',channel);}

    constructor(connector: {
        subscriptions: ReadonlySet<string>,
        subscribe: (channel: string) => void,
        unsubscribe: (channel: string) => void,
        publish: (channel: string, data: any, options?: ComplexTypesOption & PublisherOption) => void;
        isSubscriptionActive: (channel: string) => boolean
    }) {
        this.subscriptions = connector.subscriptions;
        this.subscribe = connector.subscribe;
        this.unsubscribe = connector.unsubscribe;
        this.publish = connector.publish;
        this.isSubscriptionActive = connector.isSubscriptionActive;
    }

}